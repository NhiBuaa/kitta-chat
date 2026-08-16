---
status: accepted
---

# K4 performance evidence boundary

K4 produces reproducible performance evidence through a pinned, containerized test runner that sends all measured sidebar, message, and Socket.IO workload through nginx on a K4-owned isolated Compose network. Each run starts with a clean deterministic dataset, separates workload from `single-replica` or `multi-replica` topology, and preserves the existing REST, Socket.IO, legacy conversation-identity, MongoDB, Redis, and RabbitMQ contracts. The runner is not a host runner, has no Docker-management privilege, and K4 adds neither WAN simulation nor benchmark-only routing or affinity.

Only the declared measurement phase produces published numbers. The observation plane may access individual replicas for attribution, internal metrics, and container-scoped resource evidence, but it never creates workload. Message persistence is derived from pre/post Prometheus histogram snapshots and reported as histogram-derived; recipient delivery is a correlated end-to-end `sendMessage`/acknowledgement/`getMessage` result. Multi-replica claims require measurement-phase attribution, and cross-replica delivery additionally proves sender and recipient were on different replicas at the sample time.

Every completed run has immutable source and bundle inventories plus a non-inventoried completion marker. Run state uses the independent axes `artifact_status`, `execution_outcome`, and `qualification_flags`; claim eligibility is derived by claim type. This preserves usable latency evidence while preventing unsupported target, topology, resource, or SUT-ceiling claims.

## Amendment: resource coverage and load-generator limitation

Authority: [Issue #80 resource coverage and load-generator limitation amendment](https://github.com/NhiBuaa/kitta-chat/issues/80#issuecomment-5275089340).

For each required container, the measurement window is `[measurement_start, measurement_end)` and
cadence slots are anchored at `measurement_start`; the final partial slot counts. Thus
`expected_count = ceil((measurement_end - measurement_start) / interval)`. Each slot is exactly
one of successful, error, or missing. A valid success has one complete raw sample; an error has a
retained collector error but no valid sample; a missing slot has neither. Required coverage is
sufficient only when every required container has at least one success and
`successful / expected >= 0.90`. Missing and error samples are separately retained but both
reduce coverage. Otherwise set `OBSERVATION_INCOMPLETE` and prohibit CPU, memory, and
bottleneck/SUT-ceiling claims.

`LOAD_GENERATOR_LIMITED` requires a model-specific requested-load shortfall plus temporally
overlapping runner cgroup-v2 evidence: CPU throttling with at least 90% normalized runner CPU
utilization for 80% of that overlap, or a positive `memory.events` `oom`/`oom_kill` delta. The
manifest retains source paths, cgroup version, CPU/cpuset/memory limits, shortfall evidence, and
decision window. Generic timeouts, runner error strings, host CPU, and SUT signals cannot set the
flag. Absence of the flag does not itself attribute a ceiling to the SUT.

## Amendment: measurement attribution and observer privilege

Authority: [Issue #80 measurement attribution and observer privilege amendment](https://github.com/NhiBuaa/kitta-chat/issues/80#issuecomment-5275474282).

Topology inventory is not traffic attribution. Sidebar attribution uses measurement-bound nginx
access records and uniquely mapped `upstream_addr`; socket attribution reconstructs authenticated
measured-actor connection lifetimes per `NODE_NAME`; cross-replica delivery uses one authoritative
correlation identifier across sender, acknowledgement, receiver, and delivery evidence. Raw
sources, parser/schema versions, identities, digests, window binding, and completeness diagnostics
are retained. Ambiguous, truncated, or incomplete evidence sets `OBSERVATION_INCOMPLETE` for the
affected claim. `TOPOLOGY_NOT_EXERCISED` is valid only when complete observation proves measured
activity exercised exactly one replica.

The observer application has no raw Docker authority. Docker-backed evidence is served by a
separately isolated helper with a closed observation-only API, current-run ownership/role checks,
fixed metrics/log/stats/identity/cgroup operations, and no generic Docker passthrough, arbitrary
exec/path, or lifecycle mutation. The runner has neither route nor credential to the helper.
Direct replica `/metrics` access over an observation-only internal network is preferred. Failure
to prove the privilege boundary sets `OBSERVATION_INCOMPLETE` and prohibits helper-derived claims.

## Amendment: provenance, report claims, and comparison validation

Authority: [Issue #80](https://github.com/NhiBuaa/kitta-chat/issues/80), [Issue #85](https://github.com/NhiBuaa/kitta-chat/issues/85), and the locked `k4-issue-85-r3` acceptance guide.

The default source-inventory representation is the complete exact persisted bytes of the
source-inventory artifact on disk. An independent verifier hashes those bytes directly with
SHA-256; it does not parse, reserialize, canonicalize, or normalize them. A contract that uses a
different representation or a non-self-referential boundary must name an authoritative schema or
contract. The implementation must not invent that boundary.

Reports must state hardware limits and the measured workload/topology scope. A report may publish
`scalable`, `high-performance`, or `production-ready` only when the applicable profile or
environment manifest, source inventory, and raw-result artifacts are provenance-linked and the
claim stays inside the measured scope. Missing provenance or extrapolation makes the claim
unpublishable; it does not erase unrelated retained latency/error evidence.

Optimization and topology comparisons are separate contracts. Optimization permits one declared
treatment after linked bottleneck evidence while keeping non-treatment conditions equivalent.
Topology comparison permits only the declared topology or replica-count difference. Undeclared
condition changes are rejected rather than silently treated as the allowed difference.

## Considered Options

- Host-based or direct-backend workload: rejected because runner placement and ingress behavior would differ from the measured topology and could conflict with parallel work.
- One overall pass/fail status: rejected because it would either discard valid evidence or overstate incomplete evidence.
- Reusing prior run volumes: rejected because an implicit dirty dataset invalidates reproducibility.

## Consequences

K4 benchmarks need more explicit setup, provenance, and observation artifacts than an ad-hoc load test. In return, every reported number has a bounded meaning and can be re-derived from the retained source evidence.
