# ADR-007: Workflow Governance and Ruleset Activation

## Status
Accepted

## Decision
K2 uses five responsibility workflows and seven Required checks, including versioned `CI Policy v1`; Security remains Advisory. Readiness precedes one direct-Active Ruleset activation with PR-only merging, strict up-to-date checks, conversation resolution, no bypass, deletion/force-push protection, and merge-commit-only completion. Activation is behavior-tested by a ready-for-review behind branch. Rollback allows one predeclared correction and suffix rerun before disabling and fully re-verifying the Ruleset.

Merge queue, signed-commit enforcement and auto-merge remain disabled. Topic branches rebase with force-with-lease; merged head branches are deleted automatically.
