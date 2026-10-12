# 8. Cross-job cache sharing via actions/cache

- Status: Accepted
- Date: 2026-10-11

## Context

The runner tool cache used by `@actions/tool-cache` is local to a runner. On GitHub-hosted runners each job gets a fresh VM, so a matrix or a set of parallel jobs downloads and verifies the same go-task release once per job. Self-hosted runners keep the tool cache across runs, so they are unaffected.

Issue #88 asked us to consider sharing a resolved version across jobs to reduce total download/checksum time and to evaluate the impact on GitHub rate limits.

Alternatives considered:

1. **Do nothing / document a user-managed `actions/cache` wrapper.** Fragile — users would need to know the internal tool-cache layout and the sibling `.complete` marker file.
2. **Build `@actions/cache` into the action with an opt-in `cache` input.** Adds a dependency but gives a clean, tested UX similar to `setup-node`/`setup-go`.
3. **Default `cache` to `true`.** Rejected: caching consumes the repository's 10 GB GitHub Actions cache quota, and not every workflow needs it.

## Decision

Add a `cache` input (default `false`). When `cache: true`:

1. **Before downloading**, try `actions/cache.restoreCache` with key `setup-task-<os>-<arch>-<resolved-version>-`. The trailing `-` terminates the version: the cache service matches keys by prefix, so without it a request for `3.51.1` could restore a cached `3.51.10` entry. A prefix-matched (non-identical) key is treated as a miss.
2. **After restoring**, re-run `@actions/tool-cache.find()` so the `.complete` marker semantics stay authoritative.
3. **After a fresh install** (tool-cache miss + cache miss), save the tool directory and its sibling `.complete` marker to `actions/cache` with the same key.
4. **Save is best-effort**: a parallel matrix job may have saved the same key first (`ReserveCacheError`), and quota/network failures only warn, never fail the job.

Cache paths are:

- `${RUNNER_TOOL_CACHE}/task/<version>/<arch>`
- `${RUNNER_TOOL_CACHE}/task/<version>/<arch>.complete`

The marker must be cached/restored alongside the directory, because `@actions/tool-cache.find()` checks for the sibling `.complete` file.

## Consequences

- **Across separate workflow runs, `cache: true` eliminates repeated downloads.** Within a single workflow run, the benefit is only realized if a cache entry already exists (from a previous run) or if jobs are explicitly serialized (e.g. via `needs`) so a prime job saves before others restore. Concurrently starting matrix jobs on a fresh cache all miss the restore and each download once; one job's save then benefits later runs.
- **The GitHub API call that resolves `latest` / ranges is not removed.** That call is required to compute the cache key. Rate-limit exposure on `api.github.com` is unchanged.
- **Release-asset and checksum-file downloads are reduced.** This improves reliability for the unauthenticated-asset path and lowers egress to GitHub's asset CDN, which is the failure mode this action was originally created to harden.
- **Cache entries are trusted once saved.** We save only after the archive has passed SHA256 verification. When `skip-checksum: true` is used, the cross-job cache save is skipped so an unverified binary is never shared with other jobs. Restored entries are not re-verified — that would defeat the purpose by re-fetching the checksums file.
- **Cache quota is consumed only when the feature is enabled.** Default workflows pay no extra cost.
- **New dependency:** `@actions/cache` is added to the bundle.
- **Self-hosted runners:** `cache: true` is redundant but harmless; the runner tool cache already persists, so the first `tc.find()` will hit and skip both restore and save.
