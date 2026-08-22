# K6 S1 — MongoDB Atlas public-demo evidence

## Status and boundary

`S1_EVIDENCE_RECORDED_LIVE_CONNECTIVITY_PENDING_D2`

This is a maintainer-supplied, non-secret S1 evidence record for the dedicated MongoDB Atlas
public-demo target. It records resource identity and security posture only. It does not contain a
password, connection URI, runtime secret, or live Railway connectivity proof.

The Atlas region below (`Hong Kong`) is the database-provider region. It is distinct from the
Railway application target region (`Singapore`, `asia-southeast1-eqsg3a`).

## Resource identity

| Field | Value |
| --- | --- |
| Atlas project name | `kitta-chat` |
| Project scope | Dedicated KittaChat public-demo project |
| Cluster name | `Cluster0` |
| Plan | `M0 / Free` |
| Cloud provider | AWS |
| Atlas region | Hong Kong |
| Storage limit | `512 MB` |
| Current data size | `0 B` |

## Security and access posture

| Control | Maintainer evidence |
| --- | --- |
| TLS | Enabled |
| Authentication | Enabled |
| IP allowlist | `0.0.0.0/0` |
| Allowlist purpose | KittaChat public-demo Railway egress |
| Allowlist classification | Explicit demo-only exception |
| Database username | `kittachat-demo` |
| Database role | `readWrite` |
| Database scope | `shot-chat` |
| Password | Not included; never record in repository evidence |

The wildcard allowlist is accepted only for this dedicated, cost-constrained demo project. It is
not a production recommendation. Production networking remains expected to use restricted/static
egress or private networking.

## Data and compensating controls

- Data policy: demo, seed, and `.test` data only.
- No personal, sensitive, or production data is allowed.
- Dedicated demo project/cluster.
- TLS enabled.
- Unique application credential.
- Minimum database role (`readWrite` scoped to `shot-chat`).
- Credential owner during S1: maintainer password manager.
- Credential owner during D2: Railway secret manager.
- No credential value is present in this file, Git, chat, or evidence logs.

## D2 boundary

Live Railway-to-Atlas connectivity is `PENDING_D2`. The following remain D2 evidence:

- actual backend connection from the Railway runtime;
- image-worker connection from the Railway runtime;
- `/readyz` with MongoDB connected;
- runtime-region/egress observation;
- deployed revision logs proving no credential leakage.

This record closes the MongoDB Atlas S1 resource/security evidence item only. It does not enable
deployment, image publication, upload, or D2 rollout.
