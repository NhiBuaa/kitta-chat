# Issue #61 Human Decision Gate

## Status

Both maintainer decisions are recorded. This gate is closed at the decision-recorded state; it does not authorize remediation, issue publication, production access, behavioral extraction, instrumentation or numeric tuning.

Current provenance state remains: A — static evidence available; B — provenance-qualified retained runtime sources equals `0`; C — measurement/linkage blockers remain; D — normative decisions remain; E — final numeric governance approval remains mandatory.

| Decision | Recorded selection | Effective planning state |
| --- | --- | --- |
| Decision 1 — reset-token finding scope | **B — Create separate security follow-up** | `blocking follow-up linkage required / identifier pending`; Issue #61 retains the finding and remaining-risk accounting, but no actual cross-reference exists yet |
| Decision 2 — evidence strategy | **B — Stop pursuing retained evidence** | `B = 0`; no third provenance audit; future provider access or measurement requires a new explicit authorization gate |

## Decision 1 — Recorded B: separate reset-token security follow-up

Finding classification: **source-confirmed credential-in-URL design with multiple log exposure sinks; historical persistence/occurrence unverified**.

| Option | Benefits | Scope impact | Compatibility concerns | API/frontend contract migration | Historical-log handling question | Required human approvals |
| --- | --- | --- | --- | --- | --- | --- |
| **A. Remediate in Issue #61** | Directly satisfies the existing logging-hardening and secret-redaction acceptance boundary; keeps one security-baseline disposition | Expands Issue #61 implementation across at least Nginx logging, backend request/error logging and acceptance evidence; may also require frontend recovery URL, API route and referrer-policy design decisions | Redaction-only changes may preserve contracts, but eliminating credential-in-path behavior can affect emailed links, SPA routing and reset submission | Potentially required, depending on the approved design; migration and compatibility tests must be explicit | Must decide whether historical retained logs require controlled incident review, restriction, rotation or other disposition; this planning gate does not authorize inspection | Maintainer scope approval; security acceptance; operations/log-owner approval; product/client approval if contracts change |
| **B. Create separate security follow-up** | Gives the cross-layer credential-in-URL problem a dedicated threat model, migration plan and acceptance suite without expanding the rate-limit slice implicitly | Creates a new security issue covering frontend link, API contract, Nginx request/referrer logging, backend logging and historical-log disposition; Issue #61 must cross-reference it | Compatibility risk is isolated and can be planned before changing emailed links or API routes | Likely if the follow-up removes the credential from URL paths; follow-up must define transition behavior | Follow-up must explicitly decide whether and how historical logs are handled before claiming complete disposition | Maintainer approval to split scope; security owner approval of the new issue; later product/client/operations approvals for implementation |
| **C. Planning only / explicit defer-risk record** | Avoids immediate runtime or contract change while preserving the finding and measurement quarantine | Leaves the source-confirmed exposure in place; Issue #61 cannot claim complete secret-redaction remediation without a recorded exception | No immediate compatibility change; security risk and evidence restrictions continue | None now | Risk record must state that historical occurrence remains unverified and raw logs remain quarantined; no silent assumption that no incident occurred | Authorized risk-acceptance owner, maintainer, security owner and a time-bounded review/expiry decision |

**Pre-decision recommendation, now adopted by recorded Decision 1:** Option **B — create a separate security follow-up**. The finding crosses the email link, frontend route, API contract, Nginx request/referrer logging, backend logging and possible historical-log handling. A dedicated issue provides a safer migration boundary. Until that issue exists, Issue #61 must retain a blocking follow-up-linkage requirement so the split does not become silent deferral.

### Recorded Decision 1 contract

- Follow-up status: `blocking follow-up linkage required / identifier pending`.
- Splitting the finding is not remediation and does not make it resolved or dismissible.
- Issue #61 must retain the finding classification, risk status, separation rationale and blocking/remaining-risk accounting until the follow-up has an approved identifier and disposition. The placeholder is not an actual cross-reference; it must be replaced by the real link/reference after authorized creation/publication.
- Required follow-up review boundaries are: immediate logging containment/redaction; whether credentials remain in URL paths; frontend/API migration; referrer-policy consequences; historical retained-log discovery/disposition; secret-bearing-log access controls; and secret-free regression verification.
- A later follow-up may stage narrow logging containment independently after explicit approval; protocol redesign need not share the same commit.

## Decision 2 — Recorded B: stop retained-evidence pursuit

| Option | Benefits | Scope and boundaries | Compatibility/evidence consequence | Required human approvals |
| --- | --- | --- | --- | --- |
| **A. Identify actual provider and authorize secret-safe metadata provenance** | Could establish deployed SHA/image/config binding, retention windows and temporal overlap without behavioral extraction | Maintainer must name the actual hosting/deployment/observability provider and a concrete metadata source. Access remains metadata-only; raw logs, metric values, artifacts and secret-bearing config are excluded. Do not request isolated permissions such as `read:packages` unless they are shown to lead to deployed-runtime binding. | May upgrade one or more sources from `B = 0`; may still produce no qualified source if the provider lacks safe binding/window metadata | Maintainer authorization for the named provider/source; platform owner approval; security approval of the metadata interface if it can expose sensitive fields |
| **B. Stop pursuing retained evidence; later design a privacy-safe future measurement slice** | Stops unbounded provenance hunting after two audits and makes any new evidence path explicit, purpose-limited and reviewable | No further control-plane audit now. A future measurement/instrumentation design requires a separate approval covering aggregate fields, linkage need, retention, access and rollback. No instrumentation is approved by selecting this planning option. | Numeric candidates remain unapproved and `B = 0`; future evidence is designed around known privacy and censoring constraints instead of uncertain retained sources | Maintainer decision to stop retained-evidence work; later explicit privacy/security/product approval for any measurement slice |

**Pre-decision recommendation, now adopted by recorded Decision 2:** Option **B — stop pursuing retained evidence now**. No actual provider/control-plane identity is available, and the existing GitHub build lineage does not bind to deployed runtime. Reopen Option A only when the maintainer supplies a concrete provider and metadata source that can plausibly close the deployment-binding or temporal-provenance gap.

### Recorded Decision 2 contract

- Retained-evidence state remains `B = 0`.
- The current chain stops at repository/source -> GitHub workflow/build metadata; deployed-runtime binding and retained-runtime dataset provenance remain absent.
- Do not run provenance audit #3, request isolated permissions such as `read:packages`, infer a provider, or open raw auth/recovery logs.
- Reopening requires the maintainer to supply an actual hosting/deployment/observability provider or a concrete secret-safe metadata source, followed by a new explicit authorization gate.
- Measurement-dependent numeric candidates remain pending. Static reasoning does not replace measurement, and `measurement required` does not become intentional hardening without an explicit maintainer decision.
- Any future privacy-safe measurement/instrumentation slice requires separate approval; this decision does not design or authorize it.

## Decision record and terminal state

```text
Decision 1: B — Separate security follow-up
Decision 2: B — Stop retained-evidence pursuit
```

No selected option authorizes implementation, issue creation/publication, historical-log inspection, secret handling, behavioral extraction, instrumentation or numeric policy approval. Work stops at this decision-recorded state.
