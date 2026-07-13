# 7. Keep inputs compatible with `arduino/setup-task`

- Status: Accepted
- Date: 2026-06-15

## Context

The target audience is largely existing `arduino/setup-task` users who want
better reliability, security, and maintenance. Migration friction directly
affects adoption (goal G5).

## Decision

Keep the `version` and `repo-token` input names and semantics compatible with
`arduino/setup-task`, so migrating is a `uses:` line swap. Additional inputs
(`architecture`, `check-latest`, `skip-checksum`, `retries`, `retry-base-ms`)
are additive and optional.

## Consequences

- Drop-in replacement for the common case; representative workflows pass
  unchanged.
- The two compatible inputs are effectively a frozen contract — renaming them is
  a breaking change for migrators.
