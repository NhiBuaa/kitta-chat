# Issue #61 — Nodemailer upstream research evidence

## Question

What published Nodemailer version is required to leave the current audit range, and what upstream v9 compatibility changes are relevant to SMTP TLS, OAuth2 token fetches, HTTP/HTTPS proxy CONNECT, and remote message content?

## Artifact

This is a read-only upstream-evidence note for `D4 Nodemailer major compatibility preflight`. It does not authorize or perform a manifest, lockfile, source, configuration, or policy change.

## Primary sources

1. [npm registry metadata for `nodemailer`](https://registry.npmjs.org/nodemailer) — publisher registry record: dist-tags, published versions, dates, tarballs, and `gitHead` values.
2. [Nodemailer v9.0.0 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.0) — upstream maintainer release notes for the breaking TLS behavior.
3. [Nodemailer v9.0.1 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.1) — upstream maintainer release note for enforcing `disableFileAccess` and `disableUrlAccess` for message-level `raw`.
4. [Nodemailer v9.0.2 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.2) — upstream maintainer release note for rejecting CRLF in HTTP proxy CONNECT destinations.
5. [Nodemailer v9.0.5 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.5) — upstream maintainer release note; the release page marks it Latest.
6. [v9.0.5 mail-message source](https://raw.githubusercontent.com/nodemailer/nodemailer/v9.0.5/lib/mailer/mail-message.js) and [v9.0.5 shared content resolver](https://raw.githubusercontent.com/nodemailer/nodemailer/v9.0.5/lib/shared/index.js) — upstream source for enforcing access options and resolving `path`/`href` content.
7. Local, read-only `npm audit --omit=dev --json` run in `server/` on 2026-08-10 — package-manager advisory aggregation used by the repository's current dependency graph. The command reports the Nodemailer aggregate affected range and its offered fix.
8. [GHSA-p6gq-j5cr-w38f](https://github.com/advisories/GHSA-p6gq-j5cr-w38f) — advisory record for the high-severity raw-message file/URL-access bypass that determines the aggregate v9 floor.
9. Official Nodemailer documentation for [attachments](https://nodemailer.com/message/attachments), [OAuth2](https://nodemailer.com/smtp/oauth2), [SMTP](https://nodemailer.com/smtp), and [proxies](https://nodemailer.com/smtp/proxies) — API documentation corroborating that these are supported feature surfaces.

## Findings

### Published versions and audit reconciliation

- The repository currently declares and resolves Nodemailer `7.0.11` (`server/package.json` and `server/package-lock.json`). The direct declaration is `^7.0.11`; a move to v9 is therefore a major manifest change, not a lock-only refresh.
- The current registry record reports `latest = 9.0.5`; `9.0.0`, `9.0.1`, `9.0.2`, `9.0.3`, `9.0.4`, and `9.0.5` are all published. The registry timestamps place `9.0.1` on 2026-06-17 and `9.0.5` on 2026-08-07. [Registry metadata](https://registry.npmjs.org/nodemailer)
- The current server audit aggregates the Nodemailer findings as affected through `<=9.0.0`, and offers `9.0.5` as its available remediation. It identifies the high-severity message-level `raw` bypass as affected through `<=9.0.0`; the other listed Nodemailer advisories end at earlier v8 floors.
- Therefore the exact minimum published version outside the currently reported aggregate range is **`9.0.1`**. The advisory's patched version is `9.0.1`, and upstream v9.0.1 explicitly records the fix enforcing `disableFileAccess` and `disableUrlAccess` for the message-level `raw` option. [GHSA-p6gq-j5cr-w38f](https://github.com/advisories/GHSA-p6gq-j5cr-w38f), [v9.0.1 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.1)
- Earlier D1 evidence named **`9.0.5`** because the `npm audit` result's `fixAvailable.version` was `9.0.5`, which is now also the registry's latest version. That was an offered current remediation target, not evidence that `9.0.5` was the first published safe floor. [v9.0.5 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.5)
- No evidence conflict was found: the audit's offered `9.0.5` exists in the publisher registry and is a released upstream tag.

### v9 compatibility-relevant upstream behavior

- v9.0.0 makes TLS certificate validation the default for HTTPS requests used to fetch remote content. The release explicitly names attachment `href`/`path` URLs, OAuth2 token endpoints, and HTTP/HTTPS proxy CONNECT. A self-signed, expired, or hostname-mismatched certificate that previously succeeded can fail after the major update. [v9.0.0 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.0)
- The release describes an opt-out with `tls.rejectUnauthorized=false`, either in transport options or a per-attachment `tls` option. This note records the upstream capability only; it does **not** recommend weakening certificate validation.
- The v9.0.5 source still resolves HTTP(S) attachment `path`/`href` content through its network fetcher, and passes a per-content `tls` object to that fetch. It also rejects URL or file access when the corresponding access-control option is set. [shared resolver](https://raw.githubusercontent.com/nodemailer/nodemailer/v9.0.5/lib/shared/index.js)
- Remote `href` attachments are a documented feature; OAuth2 and proxy support are also documented feature surfaces. The v9 TLS change is relevant only when the repository actually uses one of those respective surfaces. [attachments](https://nodemailer.com/message/attachments), [OAuth2](https://nodemailer.com/smtp/oauth2), [proxies](https://nodemailer.com/smtp/proxies)
- v9.0.1 makes the mailer force transporter-level `disableFileAccess` / `disableUrlAccess` into the message data and applies them while resolving message content, including attachments. [mail-message source](https://raw.githubusercontent.com/nodemailer/nodemailer/v9.0.5/lib/mailer/mail-message.js)
- v9.0.2 additionally hardened HTTP proxy CONNECT destinations against CRLF injection. [v9.0.2 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.2)
- v9.0.3 records a hardening change for STARTTLS upgrade and secure-socket handling; this is relevant to SMTP transport regression testing, but the release text does not describe a new configuration API. [v9.0.3 release](https://github.com/nodemailer/nodemailer/releases/tag/v9.0.3)

## Uncertainties

- Upstream sources establish package behavior, not this repository's deployed SMTP certificate chain, OAuth2 token endpoint, proxy, or remote attachment use. Repository configuration and production-provider facts must be examined separately before a mutation decision.
- The audit output gives an aggregate affected range and latest offered fix. It does not itself attest that `9.0.1` is preferred over later safe releases; it only establishes that `9.0.1` is the first published version outside the stated aggregate range.
- The upstream package's broad engine declaration is `node >=6.0.0`; that is not a substitute for confirming the application's own production Node runtime and all operational compatibility conditions.

## Failure state

No research failure or target-publication conflict was observed. The open limitation is scope, not source availability: this note contains no repository call-site or deployment configuration assessment, and it makes no remediation decision.
