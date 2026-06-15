# Contributing

Thanks for considering a contribution to `setup-task`!

## Development

Requires Node 24+.

```bash
npm install
npm run all      # typecheck + lint + test + build — run before pushing
npm test         # vitest (test:watch for watch mode)
npm run lint     # eslint  (lint:fix to autofix)
```

### `dist/` is committed — keep it in sync

GitHub Actions runs the bundled `dist/index.js` directly, so it is checked into
the repository. After any change under `src/`, run `npm run build` and commit
the regenerated `dist/`. CI fails if the committed `dist/` does not match a
fresh build.

## Pull requests

- Branch from `main` and open a PR — direct pushes to `main` are blocked.
- `main` uses **squash merge**; keep each PR focused on one change.
- Make sure `npm run all` is green and `dist/` has been rebuilt.
- Reference any related issue (e.g. `Closes #123`).

See [CLAUDE.md](./CLAUDE.md) for the architecture overview and design rationale.
