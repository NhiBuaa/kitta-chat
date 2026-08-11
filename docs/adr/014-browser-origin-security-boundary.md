# ADR-014: Shared Fail-Closed Browser Origin Boundary

## Status
Accepted

## Decision
Credentialed REST and Socket.IO share one validated allowlist of exact scheme-host-port origins, while the public app URL used for password-reset links remains a separate configuration concept. Local baselines are `http://localhost:5173` for Vite and `http://localhost` for Docker/nginx; aliases such as `127.0.0.1`, wildcards, and reflected origins are not implicit. A request carrying an unlisted `Origin` is rejected, a request without `Origin` remains valid for same-origin, health-check, and non-browser clients, and missing or invalid deployment origin configuration fails startup.

## Consequences
The origin parser and predicate must be shared by Express and Socket.IO, deployment configuration must name every browser origin explicitly, and tests must cover accepted, rejected, absent, malformed, and alias origins. This trades some local convenience for a consistent credential boundary and prevents the current permissive Express behavior from diverging from Socket.IO.
