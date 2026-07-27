# Next Session — Rebuild K2 Phase 3 Delivery Plan

## Objective

Re-run `/to-issues` from the finalized PRD and ADR-007 through ADR-011. Existing issues #14–#18 and the Slice 1 manual guide are provisional because they assume six Required checks and an Advisory CI Contract.

## Required Outputs

1. Replace/rewrite issue breakdown around the approved readiness sequence.
2. Include versioned Required `CI Policy v1`, fixed-SHA reusable trust anchor, policy migration and residual-risk boundary.
3. Separate workflow readiness, lint remediation, verification-branch preparation and atomic Ruleset activation.
4. Regenerate the first slice manual acceptance guide through `playbooks/manual-testing.md`.
5. Ask Developer to approve issue order and locked test cases before Phase 4.

## Non-Goals

- Do not write workflow, sanitizer, validator or lint-remediation code.
- Do not configure repository Settings or Ruleset.
- Do not reuse old issue acceptance criteria without reconciling them to seven Required checks.
