"""Pin and materialize the executable Git-index projection for K6 Issue #111."""

from __future__ import annotations

import argparse
import json
import os
import subprocess
import tempfile
import zipfile
from pathlib import Path
from typing import NamedTuple


WORKFLOW_PATHS = {
    ".agents/current-session.md",
    ".agents/next-session.md",
    "docs/deployment/k6-public-demo-feature-delivery.md",
}
MANUAL_GUIDE_PREFIX = ".agents/manual-tests/k6-public-demo/"


class CandidateError(ValueError):
    """Raised when the staged execution candidate cannot be pinned safely."""


class CandidateState(NamedTuple):
    repository: str
    source_base: str
    head: str
    full_index_tree: str
    execution_tree: str


def _git(
    repository: Path,
    *args: str,
    environment: dict[str, str] | None = None,
    text: bool = True,
) -> subprocess.CompletedProcess:
    result = subprocess.run(
        ["git", "-C", str(repository), *args],
        capture_output=True,
        env=environment,
        text=text,
    )
    if result.returncode != 0:
        raise CandidateError(f"git command failed: {' '.join(args)}")
    return result


def _object_type(repository: Path, object_id: str) -> str:
    return _git(repository, "cat-file", "-t", object_id).stdout.strip()


def _tracked_files(repository: Path, environment: dict[str, str]) -> list[str]:
    output = _git(
        repository,
        "ls-files",
        "-z",
        environment=environment,
        text=False,
    ).stdout
    return [item.decode("utf-8") for item in output.split(b"\0") if item]


def compute_execution_candidate(
    repository: Path,
    source_base: str,
    *,
    expected_tree: str | None = None,
) -> CandidateState:
    repository = repository.resolve()
    if not (repository / ".git").exists():
        raise CandidateError("repository must be the Issue #111 worktree root")
    if _object_type(repository, source_base) != "commit":
        raise CandidateError("source base must resolve to a commit")

    head = _git(repository, "rev-parse", "HEAD").stdout.strip()
    ancestor = subprocess.run(
        ["git", "-C", str(repository), "merge-base", "--is-ancestor", source_base, head],
        capture_output=True,
    )
    if ancestor.returncode != 0:
        raise CandidateError("source base is not an ancestor of HEAD")

    full_index_tree = _git(repository, "write-tree").stdout.strip()
    if _object_type(repository, full_index_tree) != "tree":
        raise CandidateError("Git index did not produce a tree object")

    descriptor, temporary_name = tempfile.mkstemp(prefix="k6-111-index-", suffix=".git-index")
    os.close(descriptor)
    temporary_index = Path(temporary_name)
    temporary_index.unlink()
    environment = {**os.environ, "GIT_INDEX_FILE": str(temporary_index)}
    try:
        _git(repository, "read-tree", full_index_tree, environment=environment)
        excluded = [
            path
            for path in _tracked_files(repository, environment)
            if path in WORKFLOW_PATHS or path.startswith(MANUAL_GUIDE_PREFIX)
        ]
        for offset in range(0, len(excluded), 100):
            _git(
                repository,
                "update-index",
                "--force-remove",
                "--",
                *excluded[offset : offset + 100],
                environment=environment,
            )
        execution_tree = _git(
            repository,
            "write-tree",
            environment=environment,
        ).stdout.strip()
    finally:
        if temporary_index.exists():
            temporary_index.unlink()

    if _object_type(repository, execution_tree) != "tree":
        raise CandidateError("execution candidate did not produce a tree object")
    if expected_tree is not None and execution_tree != expected_tree:
        raise CandidateError("execution tree does not match the approved candidate")

    return CandidateState(
        repository=str(repository),
        source_base=source_base,
        head=head,
        full_index_tree=full_index_tree,
        execution_tree=execution_tree,
    )


def materialize_archive(repository: Path, execution_tree: str, archive: Path) -> None:
    repository = repository.resolve()
    archive = archive.resolve()
    if archive.exists():
        raise CandidateError("candidate archive path already exists")
    if _object_type(repository, execution_tree) != "tree":
        raise CandidateError("execution candidate must resolve to a tree object")
    archive.parent.mkdir(parents=True, exist_ok=True)
    tree_output = _git(
        repository,
        "ls-tree",
        "-r",
        "-z",
        execution_tree,
        text=False,
    ).stdout
    entries: list[tuple[str, str, str]] = []
    for raw_entry in tree_output.split(b"\0"):
        if not raw_entry:
            continue
        metadata, raw_name = raw_entry.split(b"\t", maxsplit=1)
        raw_mode, raw_type, raw_object_id = metadata.split(b" ")
        mode = raw_mode.decode("ascii")
        object_type = raw_type.decode("ascii")
        object_id = raw_object_id.decode("ascii")
        name = raw_name.decode("utf-8")
        if object_type != "blob" or mode not in {"100644", "100755"}:
            raise CandidateError(f"unsupported candidate archive entry: {name}")
        entries.append((mode, object_id, name))

    descriptor, temporary_name = tempfile.mkstemp(
        prefix=f".{archive.name}.",
        suffix=".tmp",
        dir=archive.parent,
    )
    os.close(descriptor)
    temporary_archive = Path(temporary_name)
    try:
        with zipfile.ZipFile(
            temporary_archive,
            mode="w",
            compression=zipfile.ZIP_DEFLATED,
        ) as destination:
            for mode, object_id, name in entries:
                blob = _git(
                    repository,
                    "cat-file",
                    "blob",
                    object_id,
                    text=False,
                ).stdout
                info = zipfile.ZipInfo(name)
                info.create_system = 3
                info.external_attr = int(mode, 8) << 16
                info.internal_attr = 0
                info.compress_type = zipfile.ZIP_DEFLATED
                destination.writestr(info, blob)
        os.replace(temporary_archive, archive)
    finally:
        if temporary_archive.exists():
            temporary_archive.unlink()


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--repository", type=Path, required=True)
    parser.add_argument("--source-base", required=True)
    parser.add_argument("--expected-tree")
    parser.add_argument("--archive", type=Path)
    args = parser.parse_args(argv)

    try:
        candidate = compute_execution_candidate(
            args.repository,
            args.source_base,
            expected_tree=args.expected_tree,
        )
        if args.archive is not None:
            materialize_archive(args.repository, candidate.execution_tree, args.archive)
    except (OSError, CandidateError) as error:
        parser.error(str(error))

    print(json.dumps(candidate._asdict(), sort_keys=True, separators=(",", ":")))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
