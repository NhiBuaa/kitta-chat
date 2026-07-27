# ADR-010: Supply-Chain and Permissions

## Status
Accepted

## Decision
External Actions are pinned to immutable full SHAs with version comments and updated through weekly Dependabot PRs. Workflows default to `contents: read`; only CodeQL/Gitleaks upload jobs receive narrowly scoped security-event permissions. `pull_request_target`, `write-all`, repository content writes and hidden bypasses are forbidden.

Signed commits are deferred until contributor and bot signing is proven. `Contributor Mode Entry` reopens both signing readiness and CI authority independently.
