"""Validate and append a K6 Issue #111 human-required Evaluation."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import subprocess
import tempfile
from datetime import datetime
from pathlib import Path
from typing import Any, NamedTuple


VERDICTS = {"PASSED", "FAILED", "BLOCKED"}
TEST_OUTCOMES = {"PASS", "FAIL", "BLOCKED", "NOT_RUN"}
APPROVAL_STATES = {"approved", "pending", "rejected"}
REQUIRED_CASE_IDS = {f"MA-111-{index:02d}" for index in range(1, 9)}
TOP_LEVEL_FIELDS = {
    "schema_version",
    "run_id",
    "observed_at",
    "executor",
    "artifact_binding",
    "test_results",
    "verdict",
    "human_approval",
}
V2_TRANSITION_FIELDS = {"accepted_run_id", "approval_sha256"}
OPTIONAL_TOP_LEVEL_FIELDS = {"notes"}
ARTIFACT_BINDING_FIELDS = {
    "guide_revision",
    "guide_sha256",
    "source_base",
    "candidate_tree",
}
TEST_RESULT_FIELDS = {"id", "outcome", "observation", "evidence"}
SENSITIVE_TEXT_PATTERNS = (
    re.compile(r"(?i)authorization\s*:\s*bearer\s+\S+"),
    re.compile(r"(?i)bearer\s+[a-z0-9._~+/=-]{16,}"),
    re.compile(r"(?i)(?:api[_-]?key|password|secret|token|cookie|credential)\s*[:=]\s*\S+"),
    re.compile(r"AKIA[0-9A-Z]{16}"),
    re.compile(r"(?i)(?:mongodb(?:\+srv)?|rediss?|amqps?)://[^\s/@:]+:[^\s/@]+@"),
    re.compile(r"(?i)(?:\.upstash\.io|\.rmq\.cloudamqp\.com|\.mongodb\.net|\.railway\.internal|\.railway\.app)"),
    re.compile(r"sha256:[0-9a-f]{64}"),
)
RUN_ID_PATTERN = re.compile(r"[A-Za-z0-9](?:[A-Za-z0-9._-]{0,159})\Z")
RFC3339_PATTERN = re.compile(
    r"\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{1,9})?(?:Z|[+-]\d{2}:\d{2})\Z"
)
SHA256_PATTERN = re.compile(r"[0-9a-f]{64}\Z")
EXECUTOR_IDENTITIES = {"Codex"}
ACCEPTANCE_APPROVAL_FIELDS = {
    "schema_version",
    "approval_type",
    "guide_revision",
    "guide_sha256",
    "source_base",
    "candidate_tree",
    "accepted_run_id",
    "approved_at",
    "approver",
    "approval_reference",
    "human_approval",
}


class EvaluationError(ValueError):
    """Raised when Evaluation authority, content, or history is invalid."""


class EvaluationAuthority(NamedTuple):
    repository: Path
    guide_path: Path
    guide_revision: str
    guide_sha256: str
    source_base: str
    candidate_tree: str

    @classmethod
    def create(
        cls,
        *,
        repository: Path,
        guide_path: Path,
        guide_revision: str,
        source_base: str,
        candidate_tree: str,
    ) -> "EvaluationAuthority":
        repository = repository.resolve()
        guide_path = guide_path.resolve()
        if not (repository / ".git").exists():
            raise EvaluationError("repository must be a Git worktree root")
        if not guide_path.is_file():
            raise EvaluationError("guide must be a readable file")
        _require_non_empty_string(guide_revision, "guide_revision")
        if _git_object_type(repository, source_base) != "commit":
            raise EvaluationError("source_base must resolve to a commit object")
        if _git_object_type(repository, candidate_tree) != "tree":
            raise EvaluationError("candidate_tree must resolve to a tree object")
        guide_sha256 = hashlib.sha256(guide_path.read_bytes()).hexdigest()
        return cls(
            repository=repository,
            guide_path=guide_path,
            guide_revision=guide_revision,
            guide_sha256=guide_sha256,
            source_base=source_base,
            candidate_tree=candidate_tree,
        )


class AcceptanceApproval(NamedTuple):
    path: Path
    sha256: str
    accepted_run_id: str

    @classmethod
    def create(
        cls,
        *,
        path: Path,
        authority: EvaluationAuthority,
    ) -> "AcceptanceApproval":
        path = path.resolve()
        if not path.is_file():
            raise EvaluationError("maintainer acceptance approval must be a readable file")
        try:
            record = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError as error:
            raise EvaluationError("maintainer acceptance approval must be valid JSON") from error
        if not isinstance(record, dict) or set(record) != ACCEPTANCE_APPROVAL_FIELDS:
            raise EvaluationError(
                "maintainer acceptance approval must contain only the required fields"
            )
        if record["schema_version"] != 1:
            raise EvaluationError("maintainer acceptance approval schema_version must be 1")
        if record["approval_type"] != "manual-acceptance-run":
            raise EvaluationError("maintainer acceptance approval type is invalid")
        expected_binding = {
            "guide_revision": authority.guide_revision,
            "guide_sha256": authority.guide_sha256,
            "source_base": authority.source_base,
            "candidate_tree": authority.candidate_tree,
        }
        for field, expected in expected_binding.items():
            if record[field] != expected:
                raise EvaluationError(
                    f"maintainer acceptance approval {field} does not match authority"
                )
        _validate_run_id(record["accepted_run_id"], "accepted_run_id")
        _validate_rfc3339(record["approved_at"], "approved_at")
        if record["approver"] != "maintainer":
            raise EvaluationError("maintainer acceptance approval approver is invalid")
        if record["human_approval"] != "approved":
            raise EvaluationError("maintainer acceptance approval state is invalid")
        _require_non_empty_string(record["approval_reference"], "approval_reference")
        if len(record["approval_reference"]) > 500:
            raise EvaluationError("approval_reference exceeds the maximum length")
        _validate_safe_text(record["approval_reference"], "approval_reference")
        return cls(
            path=path,
            sha256=hashlib.sha256(path.read_bytes()).hexdigest(),
            accepted_run_id=record["accepted_run_id"],
        )


def _git_object_type(repository: Path, object_id: str) -> str:
    result = subprocess.run(
        ["git", "-C", str(repository), "cat-file", "-t", object_id],
        capture_output=True,
        text=True,
    )
    return result.stdout.strip() if result.returncode == 0 else ""


def _require_non_empty_string(value: Any, field: str) -> None:
    if not isinstance(value, str) or not value.strip():
        raise EvaluationError(f"{field} must be a non-empty string")


def _validate_safe_text(value: str, field: str) -> None:
    for pattern in SENSITIVE_TEXT_PATTERNS:
        if pattern.search(value):
            raise EvaluationError(f"sensitive evidence text is forbidden: {field}")


def _validate_run_id(value: Any, field: str = "run_id") -> None:
    _require_non_empty_string(value, field)
    _validate_safe_text(value, field)
    if not RUN_ID_PATTERN.fullmatch(value):
        raise EvaluationError(f"{field} has an invalid format or length")


def _validate_rfc3339(value: Any, field: str) -> None:
    _require_non_empty_string(value, field)
    _validate_safe_text(value, field)
    if len(value) > 40 or not RFC3339_PATTERN.fullmatch(value):
        raise EvaluationError(f"{field} must be an RFC3339 timestamp")
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError as error:
        raise EvaluationError(f"{field} must be an RFC3339 timestamp") from error
    if parsed.utcoffset() is None:
        raise EvaluationError(f"{field} must include a timezone")


def _validate_executor(value: Any) -> None:
    _require_non_empty_string(value, "executor")
    _validate_safe_text(value, "executor")
    if len(value) > 64 or value not in EXECUTOR_IDENTITIES:
        raise EvaluationError("executor must be an approved identity")


def _validate_binding(record: dict[str, Any], authority: EvaluationAuthority) -> None:
    binding = record.get("artifact_binding")
    if not isinstance(binding, dict):
        raise EvaluationError("artifact_binding must be an object")
    if set(binding) != ARTIFACT_BINDING_FIELDS:
        raise EvaluationError("artifact_binding must contain only the required fields")

    expected = {
        "guide_revision": authority.guide_revision,
        "guide_sha256": authority.guide_sha256,
        "source_base": authority.source_base,
        "candidate_tree": authority.candidate_tree,
    }
    for field, value in expected.items():
        if binding.get(field) != value:
            raise EvaluationError(f"artifact_binding.{field} does not match authority")


def validate_evaluation(record: Any, authority: EvaluationAuthority) -> None:
    if not isinstance(record, dict):
        raise EvaluationError("evaluation must be a JSON object")
    schema_version = record.get("schema_version")
    required_fields = TOP_LEVEL_FIELDS | (
        V2_TRANSITION_FIELDS if schema_version == 2 else set()
    )
    unknown = set(record) - required_fields - OPTIONAL_TOP_LEVEL_FIELDS
    missing = required_fields - record.keys()
    if unknown:
        raise EvaluationError(f"evaluation contains unknown fields: {', '.join(sorted(unknown))}")
    if missing:
        raise EvaluationError(f"missing required fields: {', '.join(sorted(missing))}")
    if schema_version not in {1, 2}:
        raise EvaluationError("schema_version must be 1 or 2")

    _validate_run_id(record["run_id"])
    _validate_rfc3339(record["observed_at"], "observed_at")
    _validate_executor(record["executor"])
    if "notes" in record:
        if not isinstance(record["notes"], str):
            raise EvaluationError("notes must be a string")
        _validate_safe_text(record["notes"], "notes")

    _validate_binding(record, authority)

    results = record["test_results"]
    if not isinstance(results, list) or not results:
        raise EvaluationError("test_results must be a non-empty array")
    if any(not isinstance(result, dict) for result in results):
        raise EvaluationError("every test result must be an object")

    result_ids = [result.get("id") for result in results]
    if len(result_ids) != len(REQUIRED_CASE_IDS) or set(result_ids) != REQUIRED_CASE_IDS:
        raise EvaluationError("test result IDs must exactly match MA-111-01 through MA-111-08")
    if len(set(result_ids)) != len(result_ids):
        raise EvaluationError("test result IDs must be unique")

    for index, result in enumerate(results):
        if set(result) != TEST_RESULT_FIELDS:
            raise EvaluationError(f"test_results[{index}] must contain only required fields")
        _require_non_empty_string(result["id"], f"test_results[{index}].id")
        if result["outcome"] not in TEST_OUTCOMES:
            raise EvaluationError(f"test_results[{index}].outcome is invalid")
        if not isinstance(result["observation"], str):
            raise EvaluationError(f"test_results[{index}].observation must be a string")
        _validate_safe_text(result["observation"], f"test_results[{index}].observation")
        evidence = result["evidence"]
        if not isinstance(evidence, list) or not evidence or not all(
            isinstance(item, str) and item for item in evidence
        ):
            raise EvaluationError(f"test_results[{index}].evidence must be a non-empty string array")
        for evidence_index, item in enumerate(evidence):
            _validate_safe_text(item, f"test_results[{index}].evidence[{evidence_index}]")

    verdict = record["verdict"]
    approval = record["human_approval"]
    if verdict not in VERDICTS:
        raise EvaluationError("verdict is invalid")
    if approval not in APPROVAL_STATES:
        raise EvaluationError("human_approval is invalid")

    outcomes = {result["outcome"] for result in results}
    if approval == "approved" and verdict != "PASSED":
        raise EvaluationError("approved human approval requires PASSED verdict")
    if verdict == "PASSED":
        if approval != "approved" or outcomes != {"PASS"}:
            raise EvaluationError("PASSED requires approved human approval and eight PASS results")
    elif verdict == "FAILED":
        if approval == "approved" or "FAIL" not in outcomes:
            raise EvaluationError("FAILED requires a FAIL result and non-approved human approval")
    else:
        if approval == "approved" or "FAIL" in outcomes:
            raise EvaluationError("BLOCKED requires non-approved human approval and no FAIL result")

    if schema_version == 2:
        accepted_run_id = record["accepted_run_id"]
        approval_sha256 = record["approval_sha256"]
        if verdict == "PASSED":
            _validate_run_id(accepted_run_id, "accepted_run_id")
            if not isinstance(approval_sha256, str) or not SHA256_PATTERN.fullmatch(
                approval_sha256
            ):
                raise EvaluationError("approval_sha256 must be a lowercase SHA-256")
        elif accepted_run_id is not None or approval_sha256 is not None:
            raise EvaluationError(
                "non-PASSED schema_version 2 records must not bind approval"
            )


def load_history(path: Path, authority: EvaluationAuthority) -> list[dict[str, Any]]:
    if not path.exists():
        return []
    records: list[dict[str, Any]] = []
    for line_number, line in enumerate(path.read_text(encoding="utf-8").splitlines(), 1):
        if not line.strip():
            continue
        try:
            record = json.loads(line)
        except json.JSONDecodeError as error:
            raise EvaluationError(
                f"invalid JSONL at line {line_number}: {error.msg}"
            ) from error
        validate_evaluation(record, authority)
        records.append(record)
    return records


def append_evaluation(
    path: Path,
    record: dict[str, Any],
    authority: EvaluationAuthority,
    *,
    approval: AcceptanceApproval | None = None,
) -> None:
    validate_evaluation(record, authority)
    path.parent.mkdir(parents=True, exist_ok=True)
    prior = path.read_bytes() if path.exists() else b""
    history = load_history(path, authority)
    if any(existing["run_id"] == record["run_id"] for existing in history):
        raise EvaluationError(f"duplicate run_id: {record['run_id']}")

    if record["verdict"] == "PASSED":
        if record["schema_version"] != 2:
            raise EvaluationError("PASSED append requires schema_version 2")
        if approval is None:
            raise EvaluationError("PASSED append requires maintainer acceptance approval")
        bound_approval = AcceptanceApproval.create(
            path=approval.path,
            authority=authority,
        )
        if bound_approval != approval:
            raise EvaluationError("maintainer acceptance approval changed after binding")
        if record["accepted_run_id"] != approval.accepted_run_id:
            raise EvaluationError("accepted_run_id does not match maintainer approval")
        if record["approval_sha256"] != approval.sha256:
            raise EvaluationError("approval_sha256 does not match maintainer approval")
        accepted = next(
            (
                existing
                for existing in history
                if existing["run_id"] == record["accepted_run_id"]
            ),
            None,
        )
        if (
            accepted is None
            or accepted["verdict"] != "BLOCKED"
            or accepted["human_approval"] != "pending"
            or {result["outcome"] for result in accepted["test_results"]} != {"PASS"}
            or accepted["artifact_binding"] != record["artifact_binding"]
        ):
            raise EvaluationError(
                "PASSED append requires a prior BLOCKED/pending observation"
            )
        if accepted["test_results"] != record["test_results"]:
            raise EvaluationError("PASSED results must match accepted observation results")
    elif approval is not None:
        raise EvaluationError("maintainer acceptance approval is valid only for PASSED")

    separator = b"" if not prior or prior.endswith((b"\n", b"\r")) else b"\n"
    encoded = json.dumps(record, ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    descriptor, temporary_name = tempfile.mkstemp(prefix=f".{path.name}.", dir=path.parent)
    temporary = Path(temporary_name)
    try:
        with os.fdopen(descriptor, "wb") as stream:
            stream.write(prior)
            stream.write(separator)
            stream.write(encoded)
            stream.write(b"\n")
            stream.flush()
            os.fsync(stream.fileno())
        os.replace(temporary, path)
    finally:
        if temporary.exists():
            temporary.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--history", type=Path, required=True)
    parser.add_argument("--evaluation", type=Path, required=True)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--guide", type=Path, required=True)
    parser.add_argument("--guide-revision", required=True)
    parser.add_argument("--source-base", required=True)
    parser.add_argument("--candidate-tree", required=True)
    parser.add_argument("--acceptance-approval", type=Path)
    args = parser.parse_args(argv)

    try:
        authority = EvaluationAuthority.create(
            repository=args.repository,
            guide_path=args.guide,
            guide_revision=args.guide_revision,
            source_base=args.source_base,
            candidate_tree=args.candidate_tree,
        )
        record = json.loads(args.evaluation.read_text(encoding="utf-8"))
        approval = AcceptanceApproval.create(
            path=args.acceptance_approval,
            authority=authority,
        ) if args.acceptance_approval else None
        append_evaluation(args.history, record, authority, approval=approval)
    except (OSError, json.JSONDecodeError, EvaluationError) as error:
        parser.error(str(error))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
