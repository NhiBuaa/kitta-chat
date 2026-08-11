# D9 — Firebase Admin Auth parent major-upgrade preflight research

## Question

Can the current runtime-reachable `firebase-admin@13.7.0` parent finding be
remediated by a Firebase Admin v14 upgrade, and what compatibility evidence is
needed before authorizing that mutation?

This is a read-only preflight. It does not authorize a package update, provider
access, credential inspection, Firebase service activation, or a change to the
accepted non-Auth service-unreached dispositions.

## Evidence boundary

- Audit acceptance authority: `npm --prefix server audit --json`, run on
  2026-08-11. It reports the direct `firebase-admin` finding as moderate,
  affected range `12.1.1 - 13.10.0`, and `fixAvailable` as
  `firebase-admin@14.2.0` with `isSemVerMajor: true`.
- Registry metadata observed on 2026-08-11 with `npm view`: the current
  `latest` dist-tag is `14.2.0`; `13.7.0` declares Node `>=18`, while
  `14.2.0` declares Node `>=22`.
- Upstream primary sources used below are Firebase documentation, the
  Firebase-maintained release notes, Firebase's GitHub repository/release
  source, npm registry metadata, and the advisory URL reported by npm audit.

## 1. Live audit reconciliation

| Item | Current evidence |
| --- | --- |
| Direct parent | `firebase-admin@13.7.0` |
| Audit severity | Moderate |
| Current advisory chain | `firebase-admin -> @google-cloud/firestore -> google-gax` |
| Exact direct `firebase-admin` advisory | None is supplied by npm audit: the direct-parent row is an `effects` aggregation of its vulnerable optional dependency chain, not a standalone Firebase Admin advisory. |
| npm-audit affected range | `12.1.1 - 13.10.0` |
| Minimum version outside that reported range | `14.0.0` |
| npm-audit recommended resolution | `firebase-admin@14.2.0` (major) |
| Current published/latest candidate | `14.2.0` |

The live audit range makes `14.0.0` the minimum version outside this specific
parent range. The actual npm audit resolver recommends `14.2.0`, which is also
the current `latest` release. A future mutation must re-run the live audit; this
preflight does not carry this result forward as a permanent safe-floor claim.

The audit is reporting the direct parent as affected through the optional
Firestore dependency graph. It is not evidence that this application invokes
Firestore. The previously accepted disposition for non-Auth Firebase services
therefore remains unchanged. The advisory evidence for this row is the fresh
live npm-audit report; it does not expose a separate direct Firebase Admin
advisory URL to cite.

## 2. Current application reachability

The server has one production Firebase Admin import:

- `server/src/config/firebaseAdmin.js` imports the legacy root namespace via
  `require("firebase-admin")`, lazily loads `firebase-service.json`, calls
  `admin.initializeApp({ credential: admin.credential.cert(serviceAccount) })`,
  and exposes `auth: () => getFirebaseAdmin().auth()`.
- `server/src/controllers/authController.js` calls
  `admin.auth().verifyIdToken(token)` only in `googleLogin`, the handler wired
  to `POST /api/auth/google`.

No repository call site invokes Firestore, Database, Storage, Messaging, or
their lazy getters. This is source/call-graph evidence only; it does not assert
that optional packages are absent from a production install.

The official Admin Auth documentation says `verifyIdToken()` verifies a client
ID token's format, expiry, and signature, returns a decoded token when valid,
and does *not* check revocation unless that separate behavior is requested.
It also says project ID may derive from the explicit app option, service-account
`project_id`, or `GOOGLE_CLOUD_PROJECT`.

Sources: [Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[Admin SDK setup](https://firebase.google.com/docs/admin/setup).

## 3. v13.7.0 to v14.2.0 compatibility

### Required source migration

This repository's current Admin adapter depends on legacy namespace APIs:
`admin.apps`, `admin.initializeApp`, `admin.credential.cert`, and `admin.auth`.
Firebase v14 removed legacy namespace support and requires module entry points.
The v14 root source exports app primitives but not the legacy `apps`,
`credential`, or service-namespace facade; the Auth entry point exposes
`getAuth(app?)`.

Therefore a v14 update cannot be accepted as lockfile-only. The smallest
anticipated source change is confined to `server/src/config/firebaseAdmin.js`:

- use the CommonJS module entry points `firebase-admin/app` and
  `firebase-admin/auth`;
- preserve lazy service-account loading and the existing missing-credential
  error contract;
- initialize only the default app when none exists; and
- return `getAuth(app)` rather than a legacy namespace `.auth()` method.

No such source change is authorized by D9.

Sources: [v14.0.0 release notes](https://firebase.google.com/support/release-notes/admin/node),
[v14.2.0 root exports](https://raw.githubusercontent.com/firebase/firebase-admin-node/v14.2.0/src/index.ts),
[v14.2.0 Auth exports](https://raw.githubusercontent.com/firebase/firebase-admin-node/v14.2.0/src/auth/index.ts).

### Node and module requirements

`firebase-admin@14.2.0` requires Node `>=22`. The repository's represented
server production Dockerfile uses `node:22-alpine`; that is compatible with the
package engine. This is repository evidence only, not evidence for unrepresented
future deployment targets.

Firebase's v14 release notes also identify three material major changes:

- Node 18 and 20 support was dropped;
- legacy namespace support was removed; and
- SDK-wide error handling was revamped with new error types/codes.

The code currently catches all Admin/Auth failures in `googleLogin`, logs the
error, and returns generic `401 Token không hợp lệ`; it does not branch on a
Firebase error class or code. The existing generic response contract is
therefore less exposed to the new error taxonomy, but the changed underlying
error objects must be regression-tested rather than assumed compatible.

Source: [Firebase Admin Node release notes, v14.0.0](https://firebase.google.com/support/release-notes/admin/node).

### Initialization, credentials, and `verifyIdToken`

The repository uses an explicit service-account credential and is not currently
using Application Default Credentials (ADC). Firebase documents both patterns:
it recommends ADC in Google environments and permits a service-account key file
in non-Google environments. D9 neither changes the credential model nor reads
the credential file.

`verifyIdToken` remains an Auth API in v14 (`getAuth(app).verifyIdToken(token)`),
but its actual interaction with a valid project/service-account binding cannot
be exercised here without credentials. The required test slice should use
adapter-level mocks for API wiring and controller tests for behavior; it must
not test a real Firebase project or inspect credentials.

Sources: [Admin SDK initialization](https://firebase.google.com/docs/admin/setup),
[Verify ID tokens](https://firebase.google.com/docs/auth/admin/verify-id-tokens),
[v14 Auth entry-point source](https://raw.githubusercontent.com/firebase/firebase-admin-node/v14.2.0/src/auth/index.ts).

## 4. Dependency graph delta expected from v14.2.0

Current installed graph under `firebase-admin@13.7.0` includes optional
`@google-cloud/firestore@7.11.6` and `@google-cloud/storage@7.19.0`, plus
direct `google-auth-library@10.6.2`, `jwks-rsa@3.2.2`,
`@firebase/database-compat@2.1.2`, and `@firebase/database-types@1.0.18`.

Registry metadata for `firebase-admin@14.2.0` declares:

- `@google-cloud/firestore ^8.6.0` as an optional dependency (a parent major
  transition from the current Firestore 7.x branch);
- `@google-cloud/storage ^7.19.0` as optional (same declared major, though a
  fresh resolver may choose a newer compatible 7.x version);
- `jwks-rsa ^4.0.1` (major transition from the current 3.x installed node);
- `google-auth-library ^10.6.2` (current shared root node already satisfies
  this minimum);
- `@firebase/database-compat ^2.1.4` and `@firebase/database-types ^1.0.20`;
  and
- removal of prior direct dependencies such as `uuid`, `node-forge`, and
  `farmhash-modern` from the package's v14 dependency declaration.

The exact lock graph must be observed only in a separately authorized mutation.
An update may change optional Firebase/Google branches, but installation or a
new resolved node is not service activation. Firestore, Database, and Storage
remain service-unreached unless source/call-graph evidence changes.

Sources: [npm registry package metadata for 13.7.0](https://registry.npmjs.org/firebase-admin/13.7.0),
[npm registry package metadata for 14.2.0](https://registry.npmjs.org/firebase-admin/14.2.0),
[Firebase Admin v14.0.0 release notes](https://firebase.google.com/support/release-notes/admin/node).

## 5. Existing testability and smallest required expansion

Existing repository evidence:

| Area | Existing test | Coverage and limitation |
| --- | --- | --- |
| Configuration without credential file | `server/test/firebaseAdminConfig.test.js` | Confirms import remains lazy and that calling `auth()` without the local file raises the project's controlled configuration error. It is legacy-adapter-specific. |
| Successful Google login | `server/test/googleAvatarQueueSemantics.test.js` | Mocks `auth().verifyIdToken()` and checks controller success plus queue failure reporting. It does not prove real Admin/Auth behavior. |
| HTTP app wiring | `server/test/httpCoreFlows.test.js` | Mocks the Admin adapter for app-level paths; it does not exercise a valid or rejected Firebase token. |
| Full server/Docker evidence | D8 accepted evidence | Useful regression baseline, but predates any Firebase v14 source migration. |

Coverage gaps that block a safe v14 mutation gate:

1. A focused adapter test for CommonJS module entry-point wiring: no duplicate
   initialization, explicit cert credential construction, `getAuth(app)` use,
   and the no-credential error contract. The test must mock modules; it must
   not read a credential value.
2. A controller test where `verifyIdToken` rejects (representing invalid or
   expired token) and must preserve the current `401` generic error response.
3. A controller test for a decoded token with no email, preserving the current
   `400 Token không hợp lệ` behavior.
4. Existing successful Google login, notification/session regressions, the full
   server suite, and production Docker build must be re-run after a mutation.

No real/local Firebase Auth integration harness is present. This is an explicit
test limitation, not proof of provider compatibility.

## Classification and decision boundary

**Classification: `COMPATIBILITY TEST EXPANSION REQUIRED`.**

The required v14 source migration is narrowly identifiable, Node 22 is
repository-compatible, and upstream still documents the Auth verification API.
However, legacy namespace removal means a package-only upgrade would break the
current adapter, and the focused configuration/rejection coverage is incomplete.

The smallest next human gate, if the maintainer wants to proceed, is:

`D9 Firebase Admin v14.2.0 Auth-adapter migration and compatibility tests: A | B`

`A` would need to authorize only:

- `firebase-admin@13.7.0 -> 14.2.0` plus normal server lockfile regeneration;
- the confined `firebaseAdmin` adapter migration from legacy namespace APIs to
  `firebase-admin/app` plus `firebase-admin/auth` CommonJS entry points;
- the four focused configuration/Auth-controller tests listed above;
- exact post-install graph review, including Firebase/Google optional branches;
- full server regression, production Docker build, fresh full-tree and
  omit-dev audit, lint, and diff check.

It must expressly prohibit credentials/provider mutation and Firestore,
Storage, or Database activation/testing. If the resolver introduces a
substantive unrelated package family or a source change beyond the adapter and
named tests, execution must stop for a scope amendment.

## Uncertainties and failure state

- No provider credentials, Firebase project metadata, or real Firebase Auth
  endpoint was accessed. Valid-token cryptographic verification and remote key
  retrieval are therefore unverified in this repository-only preflight.
- No deployed environment exists under the recorded runtime-owner fact; the
  Dockerfile evidence does not bind a future deployment runtime.
- npm audit is the acceptance authority. The live report records this direct
  parent row as an effect of a child advisory chain rather than exposing a
  standalone Firebase Admin advisory URL; the full remediation outcome must be
  evaluated with a new live audit after any approved mutation.
- `firebase-admin@14.2.0` was current at this preflight's registry lookup;
  this is not a permanent latest/safe-version assertion.
- **Failure state:** none encountered. This preflight completed without a
  package, lockfile, source, credential, or provider mutation.
