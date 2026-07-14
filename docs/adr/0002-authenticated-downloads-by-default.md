# 2. Authenticate GitHub downloads by default

- Status: Accepted
- Date: 2026-06-15

## Context

Resolving go-task releases hits the GitHub API. Unauthenticated requests share
the runner IP's 60 req/h rate limit; once exhausted the API returns an HTML
error page (the "Unicorn" page) instead of JSON. An action that parses that as
JSON/binary fails with a confusing error — a transient failure hit in a real
pnpm-monorepo CI, where `arduino/setup-task@v2` grabbed a 404 and Lint went red.
`arduino/setup-task` leaves authentication off by default, so the trap is easy
to spring.

## Decision

Authenticate by default: use `repo-token` if provided, otherwise the ambient
`GITHUB_TOKEN`, for both API calls and asset downloads. With no token available
at all, continue but `warning` about the rate-limit risk. Treat a non-JSON/HTML
response as a *transient* failure and retry it; permanent failures — HTTP 404
(including tool-cache's) and checksum mismatches — fail immediately without
consuming retries.

## Consequences

- The most common transient failure mode is avoided out of the box (goal G1).
- The token is masked (`core.setSecret`) and dropped on cross-origin redirects,
  so it never leaks off `github.com` (see [ADR 0004](0004-restricted-download-source.md)).
- Consumers pass `repo-token: ${{ github.token }}` for the authenticated path;
  the default token usually suffices.
