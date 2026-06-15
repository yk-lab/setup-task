# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A GitHub Action (TypeScript, Node 24 runtime) that installs the [go-task](https://github.com/go-task/task) `task` binary onto `PATH`. It is a drop-in, hardened alternative to `arduino/setup-task`: authenticated downloads, SHA256 checksum verification, tool-cache reuse, and retry-with-backoff. The `version` / `repo-token` inputs are intentionally compatible with `arduino/setup-task`.

## Commands

```bash
npm run all          # typecheck + lint + test + build — run before committing
npm run typecheck    # tsc --noEmit
npm run lint         # eslint .   (lint:fix to autofix)
npm run test         # vitest run
npm run test:watch   # vitest in watch mode
npm run build        # ncc bundles src/main.ts -> dist/index.js
npx vitest run tests/version.test.ts            # run a single test file
npx vitest run -t "resolves a semver range"     # run tests matching a name
```

## Critical: `dist/` is committed and must stay in sync

GitHub Actions runs the bundled `dist/index.js` directly (see `action.yml` → `main: dist/index.js`), **not** the TypeScript source. After any change under `src/`, run `npm run build` and commit the regenerated `dist/`. CI (`.github/workflows/ci.yml`) fails the build if `git status --porcelain dist` is non-empty — i.e. if the committed `dist/` doesn't match a fresh build.

## Architecture

`src/main.ts` is the orchestrator. Its `run()` executes a fixed 7-step pipeline, and the rest of `src/` is single-responsibility modules it calls:

1. **Resolve version** — `version.ts` turns a spec (`latest` / exact / semver range) into a concrete version.
2. **Tool-cache lookup** — `@actions/tool-cache.find()`; on hit, skip everything else.
3. **Download** — `download.ts` fetches the release asset (authenticated when a token is present).
4. **Checksum** — `checksum.ts` fetches `task_checksums.txt`, parses it, and verifies SHA256.
5. **Extract + cache** — `install.ts` unpacks; `tc.cacheDir()` stores it.
6. **chmod + `addPath`** — make executable (non-Windows) and expose on `PATH`.
7. **Outputs** — `version`, `task-path`, `cache-hit`.

Key design seams to preserve when editing:

- **`ReleaseApi` interface (`version.ts`)** is the network seam. `version.ts` holds only pure, testable resolution logic; `github.ts` (`createReleaseApi`) is the **only** module that performs HTTP. Keep network access out of `version.ts` so its tests stay HTTP-free.
- **Reliability core (`github.ts` `fetchJson`)**: rejects non-JSON bodies as errors. This is the project's reason for existing — unauthenticated GitHub returns HTML rate-limit pages that broke `arduino/setup-task`. Treat that case as *transient* (retryable) and surface a message pointing at `repo-token`.
- **Retry vs. permanent (`download.ts` `withRetry` + `errors.ts` `PermanentError`)**: `withRetry` does exponential backoff, but `PermanentError` (and HTTP 404, including tool-cache's `httpStatusCode === 404`) bail out immediately with no retry. When adding a new failure mode, decide deliberately which side it falls on — checksum mismatches and 404s are permanent; everything network-ish is transient.
- **Platform mapping (`platform.ts`)**: maps Node `process.platform`/`process.arch` to go-task's asset naming (`task_<os>_<arch>.<ext>`) and validates against a hardcoded `SUPPORTED` matrix mirroring go-task's published assets. Update `SUPPORTED` if upstream adds/drops a target.
- **`constants.ts`** centralizes the upstream repo (`go-task/task`), the `task_checksums.txt` asset name, URL builders, and retry tuning.

## Conventions

- **ESM + Node built-ins**: `import * as fs from 'node:fs'`, `target: ES2022`, `module: ESNext`. Strict TS with `noUnusedLocals`/`noUnusedParameters`.
- **`FR-N` comments** (e.g. `(FR-5)`) reference numbered functional requirements in `要求仕様書.md`. Keep these traceable when touching the behavior they annotate.
- **Tests cover pure logic only** — `version`, `platform`, `checksum` parsing. Network/IO modules (`github`, `download`, `install`, `main`) are validated end-to-end by `.github/workflows/self-test.yml`, which runs the built action across a Linux/macOS/Windows × `latest`/`3.x`/`3.51.1` matrix and asserts `task --version` matches the resolved output.

## Reference docs

`企画書.md` (planning) and `要求仕様書.md` (requirements, source of the `FR-N` numbers) capture the design rationale, in Japanese.
