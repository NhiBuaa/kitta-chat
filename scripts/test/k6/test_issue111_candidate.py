import importlib.util
import subprocess
import tempfile
import unittest
import zipfile
from pathlib import Path


SCRIPT = Path(__file__).resolve().parents[2] / "k6" / "issue111_candidate.py"
SPEC = importlib.util.spec_from_file_location("issue111_candidate", SCRIPT)
issue111_candidate = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
SPEC.loader.exec_module(issue111_candidate)


def git(repository, *args):
    return subprocess.run(
        ["git", "-C", str(repository), *args],
        check=True,
        capture_output=True,
        text=True,
    ).stdout.strip()


class Issue111CandidateTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.repository = Path(self.temp.name) / "repository"
        self.repository.mkdir()
        git(self.repository, "init")
        git(self.repository, "config", "user.email", "k6-candidate@example.test")
        git(self.repository, "config", "user.name", "K6 Candidate Test")

        files = {
            ".agents/current-session.md": "current\n",
            ".agents/next-session.md": "next\n",
            ".agents/manual-tests/k6-public-demo/guide.md": "guide\n",
            "client/app.js": "export const value = 1;\n",
            "docs/deployment/k6-public-demo-feature-delivery.md": "ledger\n",
            "package.json": "{}\n",
        }
        for relative, content in files.items():
            path = self.repository / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(content, encoding="utf-8")
        git(self.repository, "add", ".")
        git(self.repository, "commit", "-m", "base")
        self.source_base = git(self.repository, "rev-parse", "HEAD")

    def tearDown(self):
        self.temp.cleanup()

    def test_workflow_artifact_changes_do_not_change_execution_tree(self):
        initial = issue111_candidate.compute_execution_candidate(
            self.repository,
            self.source_base,
        )

        guide = self.repository / ".agents/manual-tests/k6-public-demo/guide.md"
        guide.write_text("guide revision two\n", encoding="utf-8")
        git(self.repository, "add", str(guide.relative_to(self.repository)))
        after_guide = issue111_candidate.compute_execution_candidate(
            self.repository,
            self.source_base,
        )

        self.assertEqual(initial.execution_tree, after_guide.execution_tree)

        app = self.repository / "client/app.js"
        app.write_text("export const value = 2;\n", encoding="utf-8")
        git(self.repository, "add", str(app.relative_to(self.repository)))
        after_runtime = issue111_candidate.compute_execution_candidate(
            self.repository,
            self.source_base,
        )

        self.assertNotEqual(initial.execution_tree, after_runtime.execution_tree)

    def test_materialized_archive_contains_execution_files_only(self):
        candidate = issue111_candidate.compute_execution_candidate(
            self.repository,
            self.source_base,
        )
        archive = Path(self.temp.name) / "candidate.zip"

        issue111_candidate.materialize_archive(
            self.repository,
            candidate.execution_tree,
            archive,
        )

        with zipfile.ZipFile(archive) as stream:
            names = set(stream.namelist())
        self.assertIn("client/app.js", names)
        self.assertNotIn(".agents/current-session.md", names)
        self.assertNotIn(".agents/next-session.md", names)
        self.assertNotIn(".agents/manual-tests/k6-public-demo/guide.md", names)
        self.assertNotIn(
            "docs/deployment/k6-public-demo-feature-delivery.md",
            names,
        )

    def test_materialized_archive_marks_files_binary_and_preserves_git_blob_bytes(self):
        candidate = issue111_candidate.compute_execution_candidate(
            self.repository,
            self.source_base,
        )
        archive = Path(self.temp.name) / "candidate-binary.zip"

        issue111_candidate.materialize_archive(
            self.repository,
            candidate.execution_tree,
            archive,
        )

        expected_blob = subprocess.run(
            [
                "git",
                "-C",
                str(self.repository),
                "show",
                f"{candidate.execution_tree}:client/app.js",
            ],
            check=True,
            capture_output=True,
        ).stdout
        with zipfile.ZipFile(archive) as stream:
            file_info = stream.getinfo("client/app.js")
            self.assertEqual(file_info.internal_attr & 1, 0)
            self.assertEqual(stream.read(file_info), expected_blob)

    def test_expected_tree_mismatch_fails_closed(self):
        with self.assertRaisesRegex(
            issue111_candidate.CandidateError,
            "execution tree does not match",
        ):
            issue111_candidate.compute_execution_candidate(
                self.repository,
                self.source_base,
                expected_tree="0" * 40,
            )


if __name__ == "__main__":
    unittest.main()
