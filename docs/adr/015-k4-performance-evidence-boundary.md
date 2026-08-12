---
status: accepted
---

# K4 performance evidence boundary

K4 produces reproducible performance evidence through a pinned, containerized test runner that sends all measured sidebar, message, and Socket.IO workload through nginx on a K4-owned isolated Compose network. Each run starts with a clean deterministic dataset, separates workload from `single-replica` or `multi-replica` topology, and preserves the existing REST, Socket.IO, legacy conversation-identity, MongoDB, Redis, and RabbitMQ contracts. The runner is not a host runner, has no Docker-management privilege, and K4 adds neither WAN simulation nor benchmark-only routing or affinity.

Only the declared measurement phase produces published numbers. The observation plane may access individual replicas for attribution, internal metrics, and container-scoped resource evidence, but it never creates workload. Message persistence is derived from pre/post Prometheus histogram snapshots and reported as histogram-derived; recipient delivery is a correlated end-to-end `sendMessage`/acknowledgement/`getMessage` result. Multi-replica claims require measurement-phase attribution, and cross-replica delivery additionally proves sender and recipient were on different replicas at the sample time.

Every completed run has immutable source and bundle inventories plus a non-inventoried completion marker. Run state uses the independent axes `artifact_status`, `execution_outcome`, and `qualification_flags`; claim eligibility is derived by claim type. This preserves usable latency evidence while preventing unsupported target, topology, resource, or SUT-ceiling claims.

## Considered Options

- Host-based or direct-backend workload: rejected because runner placement and ingress behavior would differ from the measured topology and could conflict with parallel work.
- One overall pass/fail status: rejected because it would either discard valid evidence or overstate incomplete evidence.
- Reusing prior run volumes: rejected because an implicit dirty dataset invalidates reproducibility.

## Consequences

K4 benchmarks need more explicit setup, provenance, and observation artifacts than an ad-hoc load test. In return, every reported number has a bounded meaning and can be re-derived from the retained source evidence.
