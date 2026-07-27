# ADR-009: Security Scanning Strategy

## Status
Accepted

## Decision
K2 Security is Advisory but fails truthfully: three dependency audits, CodeQL JavaScript/TypeScript with `build-mode: none`, Gitleaks full-history scanning with narrow finding exceptions and sanitized/redacted SARIF, and three full-tree license scans. Fork PRs skip only permission-dependent SARIF upload. No `continue-on-error`, verified-secret network calls, custom CodeQL severity gate, or broad path allowlist is used.
