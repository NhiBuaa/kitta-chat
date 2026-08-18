# Issue #61 CodeQL rate-limit query replacement

This bounded repository-owned replacement answers one question: can a narrow model for the
repository's canonical `createHttpRateLimitMiddleware` export make `js/missing-rate-limiting`
recognize protected routes while preserving detection of unprotected, look-alike, and
post-handler limiter controls?

The replacement is wired locally through `.github/codeql/codeql-config.yml` and
`.github/workflows/security.yml`. It preserves the default CodeQL suite and excludes only the
stock `js/missing-rate-limiting` rule. This worktree has not been published, so no GitHub Actions
run from the replacement revision is claimed yet.

The config excludes only this directory's disposable JavaScript fixtures from repository source
analysis. The fixture gate still analyzes those files directly from its dedicated source root.

## Reproduce the fixture coverage gate

Use the CodeQL CLI shipped by the exact bundle selected by the repository's pinned
`github/codeql-action/init@7fc6561ed893d15cec696e062df840b21db27eb0` (`v4.35.2`). That action
release defaults to CodeQL bundle `v2.25.2`.

```powershell
pwsh -File .github/codeql/issue61-rate-limit/run-prototype.ps1 `
  -CodeQL C:\path\to\codeql\codeql.exe
```

The gate creates a disposable fixture database under `%TEMP%`, runs the bundled stock query and
the repository-owned replacement, and fails closed unless all of these hold:

- stock query reports all six fixture routes;
- custom query reports exactly four results;
- `/protected` and `/protected-alias` are not reported;
- `/unprotected`, `/after-controller`, `/look-alike`, and `/same-name` are all reported;
- custom results are a subset of stock results.

No result database or SARIF output is written into the repository.
