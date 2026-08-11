# Issue #61 Rate-Limit Closure-Minimum Gate

## Purpose

Planning-only gate to decide the smallest enforcement set that satisfies Issue #61's missing-rate-limit acceptance. It does not choose numbers, create Redis keys, enable collection or authorize implementation.

## Candidate mapping

| Candidate/control | Closure-minimum status | Why | Remaining decision |
| --- | --- | --- | --- |
| `auth_entry` aggregate plus login/register/Google differentiation | CLOSURE-MANDATORY BUT NUMBER PENDING | Public credential/account-creation/provider work is within Issue #61 acceptance | Approve intentional baseline or require evidence for each number |
| Recovery request/complete and refresh stages | CLOSURE-MANDATORY BUT NUMBER PENDING | Expensive security-sensitive authentication/recovery work must be bounded | Decide compatible baseline and recovery availability tradeoff |
| `state_mutation` expensive domains | CLOSURE-MANDATORY BUT NUMBER PENDING | Issue #61 explicitly covers state-changing operations | Select minimum covered domains/numbers |
| `file_resource` expensive/upload/download-signing work | CLOSURE-MANDATORY BUT NUMBER PENDING | Issue #61 explicitly covers file/resource operations | Select baseline and multipart boundary semantics |
| `read_expensive` domains | CLOSURE-MANDATORY BUT NUMBER PENDING | Issue #61 explicitly covers read-heavy/fan-out work | Select minimum expensive domains/numbers |
| `call_initiation` raw expensive work | CLOSURE-MANDATORY BUT NUMBER PENDING | `initCall` and `callUser` perform DB/Redis/signalling work | Decide whether a bounded event control satisfies closure before logical-attempt refinement |
| Target-wide account buckets | OPTIONAL HARDENING | Target-lockout and recovery-starvation concerns remain unresolved | Explicit separate fairness decision |
| Actor-callee secondary | OPTIONAL HARDENING | Anti-harassment value requires proportionality/fairness decision | Do not promote automatically |
| Verified reset-subject secondary | OPTIONAL HARDENING | Requires a verified cheap seam and recovery decision | Do not promote automatically |
| `read_bounded` | NOT ENFORCED BY DESIGN | Approved taxonomy-only disposition | No application counter absent later explicit approval |
| M1/M2 message routes | BLOCKED BY OTHER SECURITY SEMANTICS | Missing auth/authz prevents verified actor enforcement | Follow-up must resolve principal/authorization model first |

## Human decisions needed

For every `CLOSURE-MANDATORY BUT NUMBER PENDING` row, the maintainer must choose one of:

1. approve an intentional baseline hardening value with its documented compatibility risk;
2. require a later evidence path before selecting the value; or
3. narrow the control only if evidence-backed reasoning still satisfies the affected Issue #61 acceptance.

No result of this gate makes all 33 planning candidates mandatory. `B = 0` remains; it is not itself a closure blocker.
