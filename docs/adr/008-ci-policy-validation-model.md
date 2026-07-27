# ADR-008: CI Policy Validation Model

## Status
Accepted

## Decision
CI validation has closed structural rules, global deny rules, and an open Advisory extension surface. A SHA-pinned reusable `CI Policy v1` baseline validates the candidate independently before candidate policy tests run; it is the seventh Required check. Policy upgrades use versioned expand/migrate/contract.

Same-repository caller wiring cannot be an absolute root of trust in a solo personal repository. K2 records that residual risk, requires focused manual review for control-plane changes, and reopens CI authority at `Contributor Mode Entry`.
