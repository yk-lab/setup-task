# setup-task

[![CI](https://github.com/yk-lab/setup-task/actions/workflows/ci.yml/badge.svg)](https://github.com/yk-lab/setup-task/actions/workflows/ci.yml)
[![Self-test](https://github.com/yk-lab/setup-task/actions/workflows/self-test.yml/badge.svg)](https://github.com/yk-lab/setup-task/actions/workflows/self-test.yml)
[![codecov](https://codecov.io/gh/yk-lab/setup-task/branch/main/graph/badge.svg)](https://codecov.io/gh/yk-lab/setup-task)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](./LICENSE)

A secure, reliable GitHub Action that installs the [Task](https://github.com/go-task/task) (go-task) binary onto `PATH` — verified downloads, no unauthenticated rate limits.

- 🛡️ **Checksum-verified** — every download is checked against the release `task_checksums.txt` (SHA256)
- 🚫 **Host-pinned** — downloads and their redirects are restricted to GitHub hosts; a redirect to any other host is refused, and the token is never forwarded off `github.com`
- 🔐 **Authenticated by default** — uses `${{ github.token }}` so release lookups don't hit unauthenticated rate limits (the cause of intermittent "could not download" failures)
- 🔁 **Resilient** — retries transient network failures with exponential backoff
- ♻️ **Cached** — uses the runner tool cache to avoid re-downloading
- 🌐 **Proxy-aware** — honours `HTTP_PROXY` / `HTTPS_PROXY` / `NO_PROXY` for installs behind a corporate proxy or on self-hosted runners
- 🟢 **Node 24 runtime** — on the current action runtime, no deprecated Node 16/20 to chase
- 🧩 **Drop-in for `arduino/setup-task`** — the `version` / `repo-token` inputs match, so migrating is a one-line change ([see below](#migrating-from-arduinosetup-task))

## Usage

```yaml
- uses: yk-lab/setup-task@v1
  with:
    version: 3.x            # optional; default: latest
- run: task --version
```

### Migrating from `arduino/setup-task`

`setup-task` is a drop-in replacement — the `version` and `repo-token` inputs match `arduino/setup-task`, so migrating is a one-line change:

```diff
- - uses: arduino/setup-task@v3
+ - uses: yk-lab/setup-task@v1
    with:
      version: 3.x
      repo-token: ${{ secrets.GITHUB_TOKEN }}
```

**Double-check the default `version`.** `arduino/setup-task` defaults to `3.x`; this action defaults to `latest`. If your workflow omitted `version` and relied on that default, set it explicitly so you don't silently jump to a new major.

**What you gain by switching** — none of these ship with `arduino/setup-task`, including its v3.0.0:

- Authenticated release lookups by default — no unauthenticated rate-limit failures
- SHA256 checksum verification of every download
- Host-pinned downloads and redirects (the token never leaves `github.com`)
- Retry-with-backoff on transient failures, plus proxy support

Everything else is unchanged: the extra inputs (`architecture`, `check-latest`, `skip-checksum`, `retries`, `retry-base-ms`) are all optional, and both actions run on the Node 24 runtime.

## Inputs

| Name | Default | Description |
|---|---|---|
| `version` | `latest` | Version to install: exact (`3.51.1`), semver range (`3.x`, `^3.50`), or `latest`. |
| `repo-token` | `${{ github.token }}` | Token for authenticating GitHub API/asset requests. |
| `architecture` | runner's arch | Override the CPU architecture (e.g. `amd64`, `arm64`). |
| `check-latest` | `false` | For ranges, always re-resolve the newest matching release. |
| `skip-checksum` | `false` | Disable SHA256 verification (not recommended). |
| `retries` | `3` | Max retries for transient network failures (version resolve, download, checksum fetch). |
| `retry-base-ms` | `1000` | Initial backoff delay between retries, in milliseconds (doubles each attempt). |

> **Tip:** pin a range like `3.x` (or an exact version) rather than `latest` for reproducible CI.

## Outputs

| Name | Description |
|---|---|
| `version` | The resolved version installed (e.g. `3.51.1`). |
| `task-path` | Absolute path to the `task` executable. |
| `cache-hit` | `true` if restored from the tool cache, else `false`. |

## Supported platforms

| OS | Architectures |
|---|---|
| Linux | `386`, `amd64`, `arm`, `arm64`, `riscv64` |
| macOS | `amd64`, `arm64` |
| Windows | `386`, `amd64`, `arm64` |
| FreeBSD | `386`, `amd64`, `arm`, `arm64` |

## Development

Uses [pnpm](https://pnpm.io) (`corepack enable` provides the pinned version).

```bash
pnpm install
pnpm run all       # typecheck + lint + test + build (bundles dist/)
```

`dist/` is **not** committed: it is built at release time and committed only onto the release tag (consume the action via a tag like `@v1`, not `@main`). CI runs `pnpm run build` to confirm the bundle compiles. See [`RELEASING.md`](./RELEASING.md) for how releases are cut.

See [`企画書.md`](./企画書.md) and [`要求仕様書.md`](./要求仕様書.md) for the design rationale and requirements.

## License

[MIT](./LICENSE)
