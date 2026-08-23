import importlib.util
import hashlib
import json
import subprocess
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "record_evaluation.py"
SPEC = importlib.util.spec_from_file_location("record_evaluation", SCRIPT)
record_evaluation = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(record_evaluation)


CASE_IDS = [f"MA-111-{index:02d}" for index in range(1, 9)]


def git(repository, *args):
    return subprocess.run(
        ["git", "-C", str(repository), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


class EvaluationRecorderTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repository = Path(self.temp.name) / "repository"
        self.repository.mkdir()
        git(self.repository, "init")
        git(self.repository, "config", "user.email", "k6-evaluation@example.test")
        git(self.repository, "config", "user.name", "K6 Evaluation Test")

        self.guide = self.repository / "guide-v5.md"
        self.guide.write_text("# K6 Issue #111 guide v5\n", encoding="utf-8")
        (self.repository / "candidate.txt").write_text("candidate\n", encoding="utf-8")
        git(self.repository, "add", ".")
        git(self.repository, "commit", "-m", "candidate")

        self.source_base = git(self.repository, "rev-parse", "HEAD")
        self.candidate_tree = git(self.repository, "write-tree")
        self.authority = record_evaluation.EvaluationAuthority.create(
            repository=self.repository,
            guide_path=self.guide,
            guide_revision="k6-111-target-config-v5",
            source_base=self.source_base,
            candidate_tree=self.candidate_tree,
        )
        self.history = Path(self.temp.name) / "history" / "evaluations.jsonl"

    def tearDown(self):
        self.temp.cleanup()

    def evaluation(self, run_id="k6-111-run-1", verdict="BLOCKED"):
        outcome = "FAIL" if verdict == "FAILED" else "PASS"
        return {
            "schema_version": 1,
            "run_id": run_id,
            "observed_at": "2026-08-22T12:00:00Z",
            "executor": "Codex",
            "artifact_binding": {
                "guide_revision": self.authority.guide_revision,
                "guide_sha256": self.authority.guide_sha256,
                "source_base": self.authority.source_base,
                "candidate_tree": self.authority.candidate_tree,
            },
            "test_results": [
                {
                    "id": case_id,
                    "outcome": outcome,
                    "observation": "The required local behavior matched the guide.",
                    "evidence": [f"{case_id} command exited 0"],
                }
                for case_id in CASE_IDS
            ],
            "verdict": verdict,
            "human_approval": "approved" if verdict == "PASSED" else "pending",
        }

    def acceptance_approval(self, accepted_run_id):
        path = Path(self.temp.name) / f"{accepted_run_id}.acceptance.json"
        path.write_text(
            json.dumps({
                "schema_version": 1,
                "approval_type": "manual-acceptance-run",
                "guide_revision": self.authority.guide_revision,
                "guide_sha256": self.authority.guide_sha256,
                "source_base": self.authority.source_base,
                "candidate_tree": self.authority.candidate_tree,
                "accepted_run_id": accepted_run_id,
                "approved_at": "2026-08-22T12:30:00Z",
                "approver": "maintainer",
                "approval_reference": "Maintainer accepted the exact pending observation.",
                "human_approval": "approved",
            }),
            encoding="utf-8",
        )
        return path, record_evaluation.AcceptanceApproval.create(
            path=path,
            authority=self.authority,
        )

    def approved_transition(self):
        pending = self.evaluation("k6-111-observation")
        approval_path, approval = self.acceptance_approval(pending["run_id"])
        approved = self.evaluation("k6-111-approved", "PASSED")
        approved["schema_version"] = 2
        approved["accepted_run_id"] = pending["run_id"]
        approved["approval_sha256"] = approval.sha256
        return pending, approved, approval_path, approval

    def test_appends_without_rewriting_prior_bytes(self):
        first = self.evaluation()
        second = self.evaluation("k6-111-run-2", "FAILED")
        record_evaluation.append_evaluation(self.history, first, self.authority)
        prior = self.history.read_bytes()
        record_evaluation.append_evaluation(self.history, second, self.authority)
        self.assertTrue(self.history.read_bytes().startswith(prior))
        self.assertEqual(
            [first, second],
            record_evaluation.load_history(self.history, self.authority),
        )

    def test_appends_a_new_candidate_without_rewriting_prior_candidate_history(self):
        first = self.evaluation("k6-111-old-candidate", "FAILED")
        record_evaluation.append_evaluation(self.history, first, self.authority)
        prior = self.history.read_bytes()

        (self.repository / "candidate.txt").write_text(
            "remediated candidate\n",
            encoding="utf-8",
        )
        git(self.repository, "add", "candidate.txt")
        remediated_authority = record_evaluation.EvaluationAuthority.create(
            repository=self.repository,
            guide_path=self.guide,
            guide_revision=self.authority.guide_revision,
            source_base=self.source_base,
            candidate_tree=git(self.repository, "write-tree"),
        )
        second = self.evaluation("k6-111-remediated-candidate")
        second["artifact_binding"]["candidate_tree"] = remediated_authority.candidate_tree

        record_evaluation.append_evaluation(
            self.history,
            second,
            remediated_authority,
        )

        self.assertTrue(self.history.read_bytes().startswith(prior))
        self.assertEqual(
            [first, second],
            record_evaluation.load_history(self.history, remediated_authority),
        )

    def test_rejects_duplicate_run_id_without_changing_history(self):
        record = self.evaluation()
        record_evaluation.append_evaluation(self.history, record, self.authority)
        prior = self.history.read_bytes()
        with self.assertRaisesRegex(record_evaluation.EvaluationError, "duplicate run_id"):
            record_evaluation.append_evaluation(self.history, record, self.authority)
        self.assertEqual(prior, self.history.read_bytes())

    def test_enforces_exact_guide_source_and_candidate_binding(self):
        for field in ("guide_sha256", "source_base", "candidate_tree"):
            record = self.evaluation()
            record["artifact_binding"][field] = "0" * len(record["artifact_binding"][field])
            with self.subTest(field=field), self.assertRaisesRegex(
                record_evaluation.EvaluationError,
                f"artifact_binding.{field} does not match",
            ):
                record_evaluation.append_evaluation(self.history, record, self.authority)

        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "candidate_tree must resolve to a tree object",
        ):
            record_evaluation.EvaluationAuthority.create(
                repository=self.repository,
                guide_path=self.guide,
                guide_revision="k6-111-target-config-v5",
                source_base=self.source_base,
                candidate_tree=self.source_base,
            )

    def test_requires_exactly_the_eight_locked_case_ids(self):
        missing = self.evaluation()
        missing["test_results"].pop()
        extra = self.evaluation()
        extra["test_results"][-1]["id"] = "MA-111-09"
        for record in (missing, extra):
            with self.assertRaisesRegex(
                record_evaluation.EvaluationError,
                "test result IDs must exactly match",
            ):
                record_evaluation.append_evaluation(self.history, record, self.authority)

    def test_derives_issue_112_case_ids_from_the_locked_guide_revision(self):
        guide = self.repository / "issue-112-edge-v3.md"
        guide.write_text("# K6 Issue #112 guide v3\n", encoding="utf-8")
        git(self.repository, "add", guide.name)
        authority = record_evaluation.EvaluationAuthority.create(
            repository=self.repository,
            guide_path=guide,
            guide_revision="k6-112-edge-v3",
            source_base=self.source_base,
            candidate_tree=self.candidate_tree,
        )
        record = self.evaluation("k6-112-observation")
        record["artifact_binding"] = {
            "guide_revision": authority.guide_revision,
            "guide_sha256": authority.guide_sha256,
            "source_base": authority.source_base,
            "candidate_tree": authority.candidate_tree,
        }
        for index, result in enumerate(record["test_results"], 1):
            result["id"] = f"MA-112-{index:02d}"

        record_evaluation.append_evaluation(self.history, record, authority)
        self.assertEqual([record], record_evaluation.load_history(self.history, authority))

        unknown = json.loads(json.dumps(record))
        unknown["run_id"] = "k6-112-unknown-case"
        unknown["test_results"][-1]["id"] = "MA-112-09"
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "MA-112-01 through MA-112-08",
        ):
            record_evaluation.append_evaluation(self.history, unknown, authority)

    def test_rejects_guide_revisions_that_cannot_derive_a_case_namespace(self):
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "guide_revision must match",
        ):
            record_evaluation.EvaluationAuthority.create(
                repository=self.repository,
                guide_path=self.guide,
                guide_revision="k6-edge-v3",
                source_base=self.source_base,
                candidate_tree=self.candidate_tree,
            )

    def test_existing_issue_111_histories_validate_without_byte_changes(self):
        repository = SCRIPT.parents[1]
        histories = [
            "issue-111-target-config-v5",
            "issue-111-target-config-v6",
        ]
        expected_paths = [
            repository / ".agents" / "manual-tests" / "k6-public-demo" / f"{stem}{suffix}"
            for stem in histories
            for suffix in (".md", ".evaluations.jsonl")
        ]
        if not all(path.exists() for path in expected_paths):
            self.assertFalse((repository / ".git").exists())
            self.assertTrue(all(not path.exists() for path in expected_paths))
            return

        for stem in histories:
            history = repository / ".agents" / "manual-tests" / "k6-public-demo" / f"{stem}.evaluations.jsonl"
            guide = repository / ".agents" / "manual-tests" / "k6-public-demo" / f"{stem}.md"
            prior = history.read_bytes()
            first = json.loads(prior.splitlines()[0])
            binding = first["artifact_binding"]
            authority = record_evaluation.EvaluationAuthority.create(
                repository=repository,
                guide_path=guide,
                guide_revision=binding["guide_revision"],
                source_base=binding["source_base"],
                candidate_tree=binding["candidate_tree"],
            )
            with self.subTest(stem=stem):
                self.assertGreater(len(record_evaluation.load_history(history, authority)), 0)
                self.assertEqual(prior, history.read_bytes())
                self.assertEqual(
                    hashlib.sha256(prior).hexdigest(),
                    hashlib.sha256(history.read_bytes()).hexdigest(),
                )

    def test_enforces_verdict_and_human_approval_matrix(self):
        invalid_records = []
        passed_pending = self.evaluation(verdict="PASSED")
        passed_pending["human_approval"] = "pending"
        invalid_records.append(passed_pending)
        blocked_approved = self.evaluation(verdict="BLOCKED")
        blocked_approved["human_approval"] = "approved"
        invalid_records.append(blocked_approved)
        failed_without_fail = self.evaluation(verdict="FAILED")
        for result in failed_without_fail["test_results"]:
            result["outcome"] = "PASS"
        invalid_records.append(failed_without_fail)
        blocked_with_fail = self.evaluation(verdict="BLOCKED")
        blocked_with_fail["test_results"][0]["outcome"] = "FAIL"
        invalid_records.append(blocked_with_fail)
        for record in invalid_records:
            with self.assertRaises(record_evaluation.EvaluationError):
                record_evaluation.append_evaluation(self.history, record, self.authority)

    def test_passed_append_requires_prior_observation_and_bound_maintainer_approval(self):
        pending, approved, _, approval = self.approved_transition()

        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "prior BLOCKED/pending observation",
        ):
            record_evaluation.append_evaluation(
                self.history,
                approved,
                self.authority,
                approval=approval,
            )

        record_evaluation.append_evaluation(self.history, pending, self.authority)
        record_evaluation.append_evaluation(
            self.history,
            approved,
            self.authority,
            approval=approval,
        )

        self.assertEqual(
            [pending, approved],
            record_evaluation.load_history(self.history, self.authority),
        )

    def test_passed_append_rejects_unbound_or_changed_approval_transition(self):
        pending, approved, _, approval = self.approved_transition()
        record_evaluation.append_evaluation(self.history, pending, self.authority)

        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "maintainer acceptance approval",
        ):
            record_evaluation.append_evaluation(
                self.history,
                approved,
                self.authority,
            )

        wrong_run = dict(approved)
        wrong_run["accepted_run_id"] = "k6-111-other-observation"
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "accepted_run_id",
        ):
            record_evaluation.append_evaluation(
                self.history,
                wrong_run,
                self.authority,
                approval=approval,
            )

        changed_results = json.loads(json.dumps(approved))
        changed_results["test_results"][0]["observation"] = "Changed after approval."
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "accepted observation results",
        ):
            record_evaluation.append_evaluation(
                self.history,
                changed_results,
                self.authority,
                approval=approval,
            )

    def test_passed_append_rejects_approval_file_changed_after_binding(self):
        pending, approved, approval_path, approval = self.approved_transition()
        record_evaluation.append_evaluation(self.history, pending, self.authority)
        approval_path.write_text(
            approval_path.read_text(encoding="utf-8") + "\n",
            encoding="utf-8",
        )

        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "changed after binding",
        ):
            record_evaluation.append_evaluation(
                self.history,
                approved,
                self.authority,
                approval=approval,
            )

    def test_acceptance_approval_rejects_binding_drift_and_sensitive_reference(self):
        approval_path, _ = self.acceptance_approval("k6-111-observation")
        record = json.loads(approval_path.read_text(encoding="utf-8"))

        drifted = dict(record)
        drifted["candidate_tree"] = self.source_base
        approval_path.write_text(json.dumps(drifted), encoding="utf-8")
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "candidate_tree does not match",
        ):
            record_evaluation.AcceptanceApproval.create(
                path=approval_path,
                authority=self.authority,
            )

        sensitive = dict(record)
        sensitive["approval_reference"] = "token=synthetic-not-a-secret"
        approval_path.write_text(json.dumps(sensitive), encoding="utf-8")
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "sensitive evidence text",
        ):
            record_evaluation.AcceptanceApproval.create(
                path=approval_path,
                authority=self.authority,
            )

    def test_passed_append_revalidates_injected_approval_objects(self):
        pending, approved, approval_path, approval = self.approved_transition()
        record_evaluation.append_evaluation(self.history, pending, self.authority)
        injected = record_evaluation.AcceptanceApproval(
            path=approval_path,
            sha256=approval.sha256,
            accepted_run_id="k6-111-different-observation",
        )

        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "changed after binding",
        ):
            record_evaluation.append_evaluation(
                self.history,
                approved,
                self.authority,
                approval=injected,
            )

    def test_rejects_first_record_legacy_passed_even_with_self_declared_approval(self):
        record = self.evaluation(verdict="PASSED")
        with self.assertRaisesRegex(
            record_evaluation.EvaluationError,
            "PASSED append requires schema_version 2",
        ):
            record_evaluation.append_evaluation(self.history, record, self.authority)

    def test_rejects_unsafe_or_unconstrained_top_level_text(self):
        invalid_values = {
            "run_id": [
                "password=synthetic-not-a-secret",
                "contains spaces",
                "x" * 161,
            ],
            "observed_at": [
                "not-a-time",
                "2026-08-22T12:00:00",
                "token=synthetic-not-a-secret",
            ],
            "executor": [
                "unknown-agent",
                "password=synthetic-not-a-secret",
                "Codex" * 40,
            ],
        }

        for field, values in invalid_values.items():
            for value in values:
                record = self.evaluation()
                record[field] = value
                with self.subTest(field=field, value=value), self.assertRaises(
                    record_evaluation.EvaluationError,
                ):
                    record_evaluation.append_evaluation(
                        self.history,
                        record,
                        self.authority,
                    )

    def test_rejects_unknown_fields_and_secret_bearing_evidence(self):
        unknown = self.evaluation()
        unknown["api_key"] = "forbidden"
        with self.assertRaisesRegex(record_evaluation.EvaluationError, "unknown fields"):
            record_evaluation.append_evaluation(self.history, unknown, self.authority)

        secret_values = [
            "Authorization: Bearer abcdefghijklmnopqrstuvwxyz",
            "password=not-for-evidence",
            "AKIA" + "ABCDEFGHIJKLMNOP",
            "rediss://default:value@redis.example.test:6379",
            "provider.example.upstash.io",
            "sha256:" + "a" * 64,
        ]
        for value in secret_values:
            record = self.evaluation()
            record["test_results"][0]["evidence"] = [value]
            with self.subTest(value=value), self.assertRaisesRegex(
                record_evaluation.EvaluationError,
                "sensitive evidence text is forbidden",
            ):
                record_evaluation.append_evaluation(self.history, record, self.authority)

    def test_cli_appends_valid_json_record(self):
        evaluation_path = Path(self.temp.name) / "evaluation.json"
        evaluation_path.write_text(json.dumps(self.evaluation()), encoding="utf-8")
        exit_code = record_evaluation.main(
            [
                "--history",
                str(self.history),
                "--evaluation",
                str(evaluation_path),
                "--repository",
                str(self.repository),
                "--guide",
                str(self.guide),
                "--guide-revision",
                self.authority.guide_revision,
                "--source-base",
                self.source_base,
                "--candidate-tree",
                self.candidate_tree,
            ]
        )
        self.assertEqual(0, exit_code)
        self.assertEqual(
            [self.evaluation()],
            record_evaluation.load_history(self.history, self.authority),
        )


if __name__ == "__main__":
    unittest.main()
