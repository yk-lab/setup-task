# 6. Build `dist/` at release time, commit only on tags

- Status: Accepted
- Date: 2026-06-15

## Context

GitHub Actions runs the bundled `dist/index.js`, not the TypeScript source, so a
consumed ref must contain `dist/`. Committing the bundle on every source change
floods PRs with generated-file churn and invites drift between source and bundle.

## Decision

Keep `dist/` out of `main` (gitignored). Build it at release time and commit it
onto the release tag only, via the manual Release workflow. Consumers reference a
tag (`uses: yk-lab/setup-task@v1`), never `@main`. Move the `v1` / `v1.0` tags on
each release, and always rebuild with the pinned pnpm version so the tagged
bundle is reproducible.

## Consequences

- Source PRs carry no `dist/` churn and need no freshness check; CI still builds
  to confirm the bundle compiles.
- `@main` is unusable on purpose — it has no `dist/`.
- Release is the only step that produces a runnable bundle (see `RELEASING.md`).
