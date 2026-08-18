# Issue #61 C4 — CodeQL custom rate-limit modeling research

## Question

Can the CodeQL JavaScript query `js/missing-rate-limiting` model the repository's canonical Redis-backed Express middleware without suppressing the rule or losing detection of genuinely unprotected expensive routes?

## Primary-source findings

1. **The standard query is intentionally extensible.** GitHub's `MissingRateLimiting` library defines the two concepts the query uses: an `ExpensiveRouteHandler` and a `RateLimitedRouteHandlerExpr` / `RateLimitingMiddleware`. The library documentation and source say that both are abstract and can be extended with further subclasses; specifically, other rate-limiting mechanisms are supported by additional `RateLimitedRouteHandlerExpr` subclasses.
   - Library reference: https://codeql.github.com/codeql-standard-libraries/javascript/semmle/javascript/security/dataflow/MissingRateLimiting.qll/module.MissingRateLimiting.html
   - Current source: https://github.com/github/codeql/blob/main/javascript/ql/lib/semmle/javascript/security/dataflow/MissingRateLimiting.qll

2. **The inclusion condition is structural, not an exception list.** The standard query reports an expensive route handler when its route-installation node is *not* guarded by the routing node of any `RateLimitingMiddleware`. A custom subclass which recognizes only the repository's canonical limiter middleware therefore preserves the query's default coverage: route handlers without that recognized limiter remain reportable.
   - Current query source: https://github.com/github/codeql/blob/main/javascript/ql/src/Security/CWE-770/MissingRateLimiting.ql

3. **A normal JS model pack/data-extension is not the suitable mechanism for this relationship.** GitHub documents JavaScript data extensions for extensible taint-model predicates (`sourceModel`, `sinkModel`, `summaryModel`, barriers, and types). `RateLimitingMiddleware` is an abstract QL class, not one of those documented YAML extensible predicates. The current GitHub docs also describe model packs as public-preview support for C/C++, C#, Java/Kotlin, Python, Ruby, and Rust, not JavaScript. Therefore this needs a custom QL library/query-pack extension, rather than a JavaScript YAML model pack.
   - JS data extensions: https://codeql.github.com/docs/codeql-language-guides/customizing-library-models-for-javascript/
   - Model-pack availability: https://docs.github.com/en/code-security/concepts/code-scanning/codeql/query-packs

4. **CodeQL supports running a custom query pack in Actions.** GitHub documents query packs and `github/codeql-action/init@v4` `queries` / `packs` inputs; the `+` prefix combines additional queries with the configured/default suite. A custom pack must declare its CodeQL dependencies in `qlpack.yml`; pinning/review of pack compatibility is required when the CodeQL engine updates.
   - Workflow configuration: https://docs.github.com/en/code-security/reference/code-scanning/workflow-configuration-options
   - Query-pack reference: https://docs.github.com/en/code-security/reference/code-scanning/codeql/codeql-cli/codeql-query-packs

## Candidate A — transparent CodeQL modeling (preferred)

Create a repository-owned JavaScript QL query pack which imports `semmle.javascript.security.dataflow.MissingRateLimiting`, defines a narrow subclass of `RateLimitingMiddleware` for the canonical Redis Express middleware construction/installation shape, and runs an equivalent `js/missing-rate-limiting` query using that subclass together with the standard subclasses.

The model must bind to the canonical exported middleware / route-policy construction path, not merely a middleware name or route path. It must prove the limiter is installed before the controller at the Express routing node. The pack must leave the stock mechanisms recognized and must test:

- canonical protected routes are not reported;
- an otherwise-identical expensive route lacking the canonical limiter is reported;
- a limiter installed after the handler is reported;
- a look-alike/non-canonical middleware is not accepted;
- the existing #173 disposition remains independently covered by its existing canonical limiter.

This is coverage-preserving in principle because the base query's negative condition remains intact. The exact-bundle fixture and repository-source gates below establish the required coverage, and the approved integration shape is a rule-level replacement: keep the default suite, exclude only `js/missing-rate-limiting`, and add the repository-owned equivalent.

## Alternatives

| Candidate | Assessment |
| --- | --- |
| **A. Transparent CodeQL modeling** | Supported by the standard library's explicit extension seam. The bounded query-pack and coverage gate passed; the approved rule-level replacement is implemented locally, with publication still pending. |
| **B. GitHub policy/config change** | Technically can alter code-scanning merge protection thresholds or tool selection, but it would change the protection policy rather than teach CodeQL the existing control. It does not demonstrate coverage preservation and is not recommended before A is proven infeasible. |
| **C. Alert dismissal** | GitHub supports alert dismissal, but it is excluded by the current authorization and would not make the scanner recognize the canonical control. Not a C4 action. |
| **D. Bypass/admin** | Explicitly prohibited. Does not resolve scanner semantics or provide durable assurance. |

## Uncertainties / stop condition

- GitHub's public documentation establishes the extension seam but does not publish a ready-made template for this repository's Redis limiter. The exact QL subclass depends on the repository's current middleware export and route installation AST/data-flow shape.
- JavaScript model packs/data extensions cannot be assumed to extend `RateLimitingMiddleware`; the official JS data-extension contract covers taint-related predicates only.
- A custom query-pack can be integrated through CodeQL configuration; the exact standard-query selection/replacement behavior and CodeQL-bundle compatibility were demonstrated with the negative-control fixture and repository-source gates below.

Accordingly, C4 originally stopped for a human choice before mutation: authorize a narrow Candidate-A prototype and coverage gate, or explicitly choose a GitHub protection-policy decision. The maintainer chose Candidate A, then approved the bounded rule-level replacement documented below. No rule-wide exclusion, severity lowering, dismissal, or bypass is justified by this research.

## Candidate-A bounded replacement result (2026-08-16)

The maintainer first authorized a **bounded Candidate-A CodeQL prototype**, then approved the
**rule-level replacement** after the exact-bundle coverage gate passed. The replacement is
implemented locally under `.github/codeql/` and wired through the CodeQL workflow, but has not
yet been published; no GitHub Actions result from this revision is claimed.

### Pinned toolchain

- Repository workflow pin: `github/codeql-action/init@7fc6561ed893d15cec696e062df840b21db27eb0` (`v4.35.2`).
- The pinned action's default bundle metadata is CodeQL `v2.25.2`.
- The downloaded Windows bundle was `codeql-bundle-win64.tar.gz` with SHA-256
  `c8ac3d85ad5d79d6a5c61140e19f2972eb926d82a0919276d900dbaa1f843536`.
- Executed CLI: `CodeQL command-line toolchain release 2.25.2.`

### Fixture coverage gate

The exact-bundle fixture run used the stock `js/missing-rate-limiting` query and the equivalent
repository-owned replacement query `KittaChatMissingRateLimiting.ql`.

| Control | Expected | Observed |
| --- | --- | --- |
| Canonical `/protected` | no result | no result (line 19) |
| Canonical alias `/protected-alias` | no result | no result (line 20) |
| `/unprotected` | result | result (line 21) |
| Limiter after controller `/after-controller` | result | result (line 22) |
| Look-alike middleware `/look-alike` | result | result (line 23) |
| Same-name non-canonical middleware `/same-name` | result | result (line 24) |

The executable gate returned `verdict=PASS`, with stock `6` results and custom `4` results. The
custom result set was a strict subset of the stock result set; it introduced no new result.

### Actual repository source check

Using a CodeQL database built from `server/`, the export diagnostic discovered `23` production
factory call sites and `2` test call sites for the canonical export. The stock query returned `70`
SARIF results and the replacement equivalent returned `37`; every custom result was present in the
stock set, with `33` stock results suppressed by recognizing the canonical middleware.

The existing #173 reset-completion disposition is independently covered: stock analysis reported
`src/routes/auth.js:49`, while the replacement did not, because that route is guarded by the
canonical `auth_recovery_complete` limiter. The replacement still reports the unprotected
`/session` route and keeps authorization findings where authentication work occurs before the
limiter; those are ordering signals, not a claim that every route-level finding is resolved.

### Local replacement configuration check

The configured replacement was then analyzed against `server/` with the pinned CodeQL `2.25.2`
bundle. The run exited `0`, scanned all `225/225` JavaScript/TypeScript files, and produced `47`
SARIF results across `86` rules: `37` findings from `js/issue61/missing-rate-limiting` and `0`
from the excluded stock `js/missing-rate-limiting` rule. This verifies the local configuration
shape (default suite retained, stock rule excluded, replacement selected); it is not a GitHub
Actions publication or hosted-run result. The same config-driven staging run included the
repository's disposable fixture tree and returned `0` fixture findings; a pre-guard staging run
returned `6`, which is why the narrow `paths-ignore` entry for
`.github/codeql/issue61-rate-limit/tests/**` is part of the replacement configuration.

### Replacement verdict and boundary

**Candidate A passes the bounded coverage question** for this exact bundle and fixture matrix:
canonical protected routes are recognized, negative controls remain reportable, and #173 is
recognized through the canonical export path. The approved replacement keeps the default suite,
excludes only the stock `js/missing-rate-limiting` rule, and supplies the repository-owned
equivalent. No alert was dismissed and no severity or merge policy was changed. The replacement
is local to this worktree and is not yet published.
