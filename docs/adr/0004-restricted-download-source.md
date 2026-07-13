# 4. Restrict downloads to go-task releases on an allowlisted host

- Status: Accepted
- Date: 2026-06-15

## Context

Two tempting alternatives weaken supply-chain posture: accepting an arbitrary
download URL, and the official `curl | sh` installer (a remote script piped
straight into a shell). Both widen the trust boundary well beyond "the go-task
release we intend to install".

## Decision

Download only go-task's official GitHub releases. Do not accept arbitrary URLs,
and do not shell out to `curl | sh`. Validate every redirect hop's host against
an explicit allowlist — `github.com`, `api.github.com`,
`release-assets.githubusercontent.com`, and `objects.githubusercontent.com`,
with no wildcards; an untrusted host is a permanent failure. Because even these trusted
hosts could be hijacked or hang, cap every response's size and time.

## Consequences

- The set of hosts the action will talk to is fixed and auditable.
- A CDN rename (as GitHub has done once) fails loudly until the new host is added
  to the allowlist — deliberate, over trusting a `*.githubusercontent.com`
  suffix that also serves arbitrary user content.
- No private mirrors / arbitrary sources. A future fallback source is tracked as
  an enhancement in the issue tracker.
