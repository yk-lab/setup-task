# 1. Node 24 action runtime

- Status: Accepted
- Date: 2026-06-15

## Context

`arduino/setup-task`, the de-facto action for installing go-task, declares
`using: "node20"`. GitHub forces the Node 24 runtime from 2026-06-16 and removes
Node 20 from runners on 2026-09-16. A thin JS action would likely survive the
forced upgrade, but pairing an unmaintained action (no release since 2024-02)
with a runtime on its way out is a standing liability.

## Decision

Target the `node24` runtime in `action.yml` (`runs.using: "node24"`), and keep
the implementation a thin JS bundle so a future runtime change stays a near
one-line swap.

## Consequences

- No dependency on a runtime scheduled for removal.
- Node 20 is explicitly unsupported; `@types/node` is pinned to the Node 24 line
  in `dependabot.yml` so major bumps don't overshoot the runtime.
- Source targets ES2022 / ESNext with `node:` built-ins.
