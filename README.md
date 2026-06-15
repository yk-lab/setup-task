# setup-task

A GitHub Action that installs the [Task](https://github.com/go-task/task) (go-task) binary and puts it on `PATH`.

Built as a modern, reliable alternative to `arduino/setup-task`:

- 🟢 **Node 24 runtime** — not affected by the Node 20 action-runtime deprecation
- 🔐 **Authenticated by default** — uses `${{ github.token }}` so release lookups don't hit unauthenticated rate limits (the cause of intermittent "could not download" failures)
- 🛡️ **Checksum-verified** — every download is checked against the release `task_checksums.txt` (SHA256)
- ♻️ **Cached** — uses the runner tool cache to avoid re-downloading
- 🔁 **Resilient** — retries transient network failures with exponential backoff
- 🧩 **Drop-in** — `version` / `repo-token` inputs are compatible with `arduino/setup-task`

## Usage

```yaml
- uses: yk-lab/setup-task@v1
  with:
    version: 3.x            # optional; default: latest
- run: task --version
```

### Migrating from `arduino/setup-task`

Replace the `uses:` line — the common inputs are compatible:

```diff
- - uses: arduino/setup-task@v2
+ - uses: yk-lab/setup-task@v1
    with:
      version: 3.x
      repo-token: ${{ secrets.GITHUB_TOKEN }}
```

## Inputs

| Name | Default | Description |
|---|---|---|
| `version` | `latest` | Version to install: exact (`3.51.1`), semver range (`3.x`, `^3.50`), or `latest`. |
| `repo-token` | `${{ github.token }}` | Token for authenticating GitHub API/asset requests. |
| `architecture` | runner's arch | Override the CPU architecture (e.g. `amd64`, `arm64`). |
| `check-latest` | `false` | For ranges, always re-resolve the newest matching release. |
| `skip-checksum` | `false` | Disable SHA256 verification (not recommended). |

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

```bash
npm install
npm run all        # typecheck + lint + test + build (bundles dist/)
```

`dist/` is committed because GitHub Actions run the bundled `dist/index.js` directly. CI fails if it is out of date.

See [`企画書.md`](./企画書.md) and [`要求仕様書.md`](./要求仕様書.md) for the design rationale and requirements.

## License

[MIT](./LICENSE)
