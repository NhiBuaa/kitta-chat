# Issue #61 R2 — Rate-Limit Acceptance Evidence

## Status

`R2 — rate-limit acceptance evidence repair: PASS`

Issue #61 remains **NOT READY TO CLOSE**. Row 18 is `DONE` for the approved
rate-limit implementation evidence. The 27 approved numeric policies,
algorithms, capacities, windows, failure contracts, exclusions and `B = 0`
semantics are unchanged.

## Retained acceptance command

Run from the repository root:

```text
npm --prefix server run test:rate-limit:acceptance
```

The command runs `server/scripts/runRateLimitAcceptance.js`, which:

1. starts a pinned `redis:7.0.0` standalone container;
2. starts a pinned `redis:7.0.0` container with three native primary
   `redis-server` processes on ports `7000`, `7001` and `7002`;
3. creates and waits for a full `16384`-slot Cluster with
   `cluster_state:ok`; and
4. runs `node --test --test-concurrency=1
   test/rateLimit/distributedAdmission.test.js` with both Redis endpoints
   supplied, so no Redis acceptance test can be skipped.

The harness refuses to reuse containers with its fixed names and removes only
containers it started. It does not use the repository Compose stack, mutate
application data, or change runtime configuration.

## Acceptance result

The retained run passed:

```text
8 tests; 8 passed; 0 failed; 0 skipped
RATE_LIMIT_ACCEPTANCE=PASS
REDIS_STANDALONE=redis:7.0.0
REDIS_CLUSTER=native-three-primary:redis:7.0.0
```

The four mandatory Redis tests executed:

- `standalone Redis: multi-bucket admission is atomic all-or-none`;
- `standalone Redis: token bucket starts full and does not create an early free burst`;
- `standalone Redis: call correlation charges once and replay does not refresh TTL`;
- `native three-primary Redis Cluster: all stage keys share one slot`.

The added real-Redis concurrency test,
`standalone Redis: concurrent logical call contenders charge once and suppress duplicates`,
uses two independent Redis clients. Two simultaneous `init_pending` admissions
produce exactly one `charged` and one `replay`; two simultaneous correlated
`call_user_consumed` admissions produce exactly one `correlated` and one
`replay`; the quota sorted set remains at one member and the marker ends in
`call_user_consumed` state.

The replay TTL test now reads the runtime correlation key with the exact
caller, callee and client call ID. It asserts the marker exists before replay
and that replay does not increase its remaining TTL.

## Regression and lint

- `node --test --test-concurrency=1`: `442 tests; 437 passed; 0 failed; 5 skipped`.
  The five skips are expected when the explicit Redis acceptance endpoints are
  absent from ordinary local-suite environment; they are not the closure
  acceptance command.
- `npm run lint:ci`: `0 errors; 13 warnings`.
- `npm run lint`: remains blocked by generated `client/.vite-cache`; no cache
  cleanup was performed in R2.
- `git diff --check`: pass.

## Production-scope confirmation

No production limiter, Redis script, key schema, numeric value, Nginx rule,
excluded control, or other Issue #61 workstream changed in R2.
