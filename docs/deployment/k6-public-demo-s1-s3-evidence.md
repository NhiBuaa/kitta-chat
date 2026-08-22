# K6 S1 — AWS S3 public-demo evidence

## Status and boundary

`S1_RESOURCE_SECURITY_READINESS_RECORDED_LIVE_PENDING_D2`

This is a non-secret S1 evidence record for the K6 upload-enabled public-demo target. It records
the dedicated private bucket, public-access controls, object ownership, encryption, prefix-scoped
IAM policy, lifecycle rule, and D2-bound CORS/credential state. It does not claim Railway
connectivity, AWS SDK authentication, upload success, presigned browser behavior, image-worker
behavior, or final public-origin configuration.

No access key, secret access key, presigned URL, or other credential material is recorded. The IAM
principal has no access key at this S1 checkpoint. No public bucket/object access is approved.

## Bucket and security controls

| Field | Evidence | Disposition |
| --- | --- | --- |
| Bucket | `kittachat-public-demo-nhibuaa` (`arn:aws:s3:::kittachat-public-demo-nhibuaa`) | Dedicated KittaChat public-demo bucket |
| Provider/region | AWS, `ap-southeast-1` (Asia Pacific — Singapore) | Recorded; aligns with the selected application region |
| Block Public Access | Enabled; block all public access enabled | Public bucket/object reads disabled |
| Object ownership | Bucket owner enforced | ACLs disabled |
| Versioning | Disabled | Accepted for demo-only bucket; not a K6 S1 prerequisite |
| Default encryption | Enabled, SSE-S3 with Amazon S3 managed keys | Bucket key enabled as shown by provider console; SSE-C blocked |
| Data policy | Demo/seed data only; no personal, sensitive, or production data | Dedicated public-demo scope |

Approved application object prefixes are exactly:

- `uploads/*`
- `avatars/*`

## IAM boundary

| Field | Evidence | Disposition |
| --- | --- | --- |
| Principal | IAM user `kittachat-public-demo` | Console access disabled |
| Permissions boundary | Not set | Customer-managed policy remains the recorded boundary |
| Access key | `NOT_CREATED` | Credential creation and Railway binding remain D2-bound |
| Policy | `KittaChatPublicDemoS3ObjectAccess`, customer-managed, directly attached | Application-specific policy |
| Allowed actions | `s3:PutObject`, `s3:GetObject`, `s3:DeleteObject`, `s3:AbortMultipartUpload` | No `s3:*`, `AmazonS3FullAccess`, account-wide, bucket-wide, or outside-prefix access |
| Resource scope | `arn:aws:s3:::kittachat-public-demo-nhibuaa/uploads/*` and `arn:aws:s3:::kittachat-public-demo-nhibuaa/avatars/*` | Prefix-scoped to the approved application paths |

The repository's current S3 boundary uses `PutObject` for single uploads and for the S3 multipart
create/upload-part/complete operations, and uses `AbortMultipartUpload` for abort. Therefore the
reported action set covers the statically identified command families without introducing broad
`s3:*` access. D2 must still prove the actual AWS authorization behavior and fail safely if any
required operation is denied.

## Lifecycle and browser CORS

| Field | Evidence | Disposition |
| --- | --- | --- |
| Lifecycle rule | `kittachat-demo-cleanup` | Applies to all objects |
| Incomplete multipart cleanup | Abort after 7 days | Recorded cleanup control |
| Completed object deletion | Disabled | Completed objects are retained by this rule |
| Expired delete-marker cleanup | Disabled | No delete-marker cleanup claimed |
| Allowed origin | Exact Railway-generated public edge origin | `PENDING_D2`; wildcard origin is not approved |
| Browser method | `PUT` | Intended presigned upload method |
| Exposed header | `ETag` | Final CORS read-back and browser proof are D2-bound |

## Credential and live-validation boundary

AWS access-key and secret-key values are not present in Git, chat, or evidence. The access key is
not created at S1; credential creation and final Railway secret binding remain subject to the
established D2 boundary.

The following remain `PENDING_D2`:

- Railway-to-S3 connectivity and AWS SDK credential authentication;
- `PutObject`, `GetObject`, `DeleteObject`, and multipart initiate/upload/complete/abort;
- presigned browser `PUT`, final-origin CORS, and readable `ETag`;
- image-worker read/process/write/cleanup behavior; and
- rejection of object access outside `uploads/*` and `avatars/*`.

This evidence supports S1 resource/security readiness only. It does not enable upload by itself,
authorize credential creation, authorize deployment, or describe the bucket as production storage.
