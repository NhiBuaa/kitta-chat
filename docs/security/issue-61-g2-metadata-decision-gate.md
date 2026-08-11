# Issue #61 G2 Metadata Decision Gate

## Status

**Open — maintainer/provider facts required.**

Issue #61 remains **NOT READY TO CLOSE**. This gate records only the non-secret factual input needed to make later credential decisions. It does not authorize credential inspection, provider access by itself, rotation, revocation, restriction changes, source changes, history rewriting, alert dismissal, or scanner execution.

## Evidence boundary

Provide only metadata that does not reveal a secret value:

- project, service-account, key ID, certificate, hostname, environment, owner, state, restriction, enabled-service, and runtime-binding metadata;
- explicit factual confirmations from the accountable maintainer or provider owner;
- safe provider-console or API metadata that excludes secret material.

Do not provide raw private keys, API-key values, tokens, raw SARIF/Gitleaks payloads, credential-bearing logs, or results of testing a credential.

## G2-A — findings #1–#3: Firebase service-account private key

### Maintainer input required

1. Google project identity and accountable owner.
2. Service-account identity and accountable owner.
3. Mapping from the historical repository key ID to provider key metadata, if available.
4. Current state for each matching key: `active`, `disabled`, `deleted`, or `unknown`.
5. Current runtime need for this service account: `required`, `not required`, or `unknown`, with the environment or deployment owner that confirms it.
6. If runtime need is `required`, whether a replacement path already exists or must be planned before disabling the old key.

### Decision rule after input

- If the historical key is `active`, recommend **revoke or disable the old key**.
- Create a replacement only when current runtime actually requires this service account.
- If the key is `disabled` or `deleted`, record the evidence; do not infer that repository-history exposure is erased.
- If identity, state, or runtime need remains unknown, keep the findings `LIKELY REAL CREDENTIAL — ROTATION DECISION REQUIRED`.

## G2-B — finding #4: TLS private key

### Maintainer input required

1. Whether the historical key/certificate pair was only local/dev/self-signed or was used for an external/deployed hostname.
2. For any external use: hostname, environment, deployment owner, and last known use period.
3. Whether any current runtime, artifact, backup, or deployment still uses the key.

### Decision rule after input

- If confirmed local/dev/self-signed only, recommend **retire or regenerate local material**. Do not describe this as production credential rotation.
- If any external/deployed use is confirmed, recommend **reissue or rotate** the certificate/key material.
- Do not infer that historical external use was impossible merely because current local files are absent.
- If use classification remains unknown, keep the finding `UNCERTAIN — ROTATION DECISION REQUIRED`.

## G2-C — finding #5: Firebase client API key

### Maintainer input required

1. Firebase/Google project owner.
2. Current key state: `active`, `disabled`, `deleted`, or `unknown`.
3. Browser or application restrictions, including allowed origins/application identities.
4. Enabled API scope relevant to the key.
5. Current runtime binding: which environment uses the key, or confirmation that no current environment uses it.

### Decision rule after input

- Retain only with evidence that the key is intentionally client-facing, owner-managed, appropriately restricted, and limited to approved APIs.
- Restrict or rotate when provider metadata shows missing, overly broad, or obsolete restrictions.
- Keep the finding uncertain when owner, state, restriction, API scope, or runtime binding cannot be established from safe metadata.

## Preserved findings and prohibitions

- #102 and #103 remain `SYNTHETIC/TEST — EVIDENCE-BACKED`; no rotation is needed.
- No raw secret may be read, printed, decoded, or tested.
- No provider mutation, source change, history rewrite, alert dismissal, CI run, or scanner claim follows from this gate.

## Stop condition

Stop after the maintainer supplies the requested facts. A separate explicit authorization is required before any credential mutation or remediation work.

## Closure impact

The Gitleaks and credential-disposition rows remain unresolved. This gate can produce decision-ready evidence only; it cannot close Issue #61 or change scanner status.
