# CI Policy Governance

KittaChat treats CI workflow behavior as a versioned repository contract. Workflow files create GitHub checks; repository Rulesets determine which observed check names block merges. Committed workflows alone do not activate merge enforcement.

## Required Check Contract

K2 reserves exactly seven Required check names:

1. `Server Tests`
2. `Client Tests`
3. `Client Build`
4. `Client Lint`
5. `Docker Build (server)`
6. `Docker Build (nginx)`
7. `CI Policy v1`

Advisory job names remain open. They may be added without changing this list when they do not reuse a Required name, weaken a Required outcome, or violate a global deny rule.

## Rule Classes

- **Closed contract rules** protect approved triggers, permissions, concurrency, dependency-tree ownership, commands, immutable Action pins, and Required check names.
- **Global deny rules** scan every workflow for `continue-on-error: true`, `pull_request_target`, mutable external Action references, `write-all`, and repository content write permissions.
- **Open extension surface** permits safe observability steps and new Advisory jobs without enumerating every future job in the validator.

## CI Policy v1 Execution

The Quality workflow separates trust execution from the stable Required check name:

- `Trusted CI Policy v1 Baseline` calls a reusable support workflow through a full immutable commit SHA. The caller accepts no policy root, path, ref, or revision input.
- `CI Policy v1` is an exact-name result gate. It runs with `if: always()`, depends on the trusted baseline job, and succeeds only when that job result is `success`. A failed, cancelled, or skipped baseline therefore cannot turn the exact gate green.

The reusable workflow performs these stages in order:

1. Check out the candidate revision into an isolated candidate directory.
2. Check out the trusted policy baseline from its fixed full SHA into an isolated policy directory.
3. Install the trusted root dependency tree from the policy lockfile.
4. Run the trusted validator against the candidate in contract mode.
5. Only after trusted validation succeeds, install candidate root dependencies.
6. Run candidate `npm run test:ci` and `npm run ci:validate`.

No stage suppresses failures. A candidate cannot select the trusted policy root or revision.

## Versioned Policy Upgrade

Every policy upgrade uses **expand → migrate → contract** under a new versioned check name when behavior changes materially.

### Expand

- Merge the new validator and reusable support workflow without removing the previous version.
- Pin every external Action and trusted baseline checkout to full immutable SHAs.
- Keep the existing caller and Ruleset requirement unchanged.

### Migrate

- Add the new fixed-SHA caller and observe its exact hosted check name on a pull request and `main`.
- Require both old and new policy checks temporarily if a Ruleset transition is authorized.
- Verify the new trusted baseline before changing or removing the old requirement.

### Contract

- Remove the old caller only after all callers and any authorized Ruleset requirement use the new version.
- Remove obsolete support code in a separate reviewed change.
- Never overwrite materially different behavior behind the existing `CI Policy v1` name.

Every Ruleset transition requires a dedicated issue, explicit Developer authorization, observed hosted check names, and separate behavior verification. Slice readiness never activates or edits repository Rulesets automatically.

## Residual Risk

The fixed-SHA reusable workflow protects the baseline implementation from ordinary candidate edits, but its same-repository caller remains candidate-modifiable. In a solo personal repository, this is not an absolute root of trust and does not protect against a malicious maintainer who weakens caller wiring and policy controls together.

Pull requests that change `.github/workflows/**`, `.github/actions/**`, `scripts/ci/**`, CI package scripts, or this governance document require focused manual control-plane review in addition to automated checks and the seven Required checks.

## Contributor Mode Entry

Contributor Mode Entry occurs before either event:

- merging the first pull request authored by someone other than the sole maintainer; or
- granting a second collaborator write-or-higher repository access.

Before that event, reopen and decide:

- at least one independent pull-request approval;
- independent ownership or review of CI policy authority; and
- signed-commit readiness for maintainers, contributors, and automation.

These controls are not activated by the Quality readiness slice itself.

## Current Readiness Boundary

The Issue #18 Client Lint remediation is complete: generated `.vite-cache/**` remains excluded, the live check requires zero errors and allows the fixed warning budget of 13, and hosted evidence confirms the Required gate is green. Docker, Security workflows, Ruleset activation evidence, verification branches, staging, deployment, and production release automation remain separate K2 boundaries; staging and deployment remain deferred under ADR-011.
