# Contributing

Thanks for considering a contribution to `setup-task`!

## Development

Requires Node 24+ and [pnpm](https://pnpm.io) (this repo enforces pnpm; the
pinned version is in `package.json`'s `packageManager` field — `corepack enable`
will provide it).

```bash
pnpm install
pnpm run all      # typecheck + lint + test + build — run before pushing
pnpm test         # vitest (test:watch for watch mode)
pnpm run lint     # eslint  (lint:fix to autofix)
```

> Dependency installs honour a supply-chain cooldown (`minimumReleaseAge` in
> `pnpm-workspace.yaml`): versions published in the last 3 days are not used.

### `dist/` is not committed

The bundled `dist/index.js` is built at release time and committed only onto the
release tag, so source branches stay clean — do **not** commit `dist/` (it is
`.gitignore`d). `pnpm run build` is still useful locally to confirm the bundle
compiles; CI builds it too. Consume the action via a tag (`@v1`), not `@main`.

## Pull requests

- Branch from `main` and open a PR — direct pushes to `main` are blocked.
- `main` uses **squash merge**; keep each PR focused on one change.
- Make sure `pnpm run all` is green and `dist/` has been rebuilt.
- Reference any related issue (e.g. `Closes #123`).

See [CLAUDE.md](./CLAUDE.md) for the architecture overview and design rationale.
