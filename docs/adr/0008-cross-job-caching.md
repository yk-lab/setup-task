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

1. **On a tool-cache miss**, fetch `task_checksums.txt` as usual, then try `actions/cache.restoreCache` for the **release archive** with key `setup-task-<os>-<arch>-<resolved-version>` and no restore keys. A different version's entry can never be returned: `actions/cache` also scopes every entry by a hash of its paths, and the path embeds the version.
2. **A restored archive is untrusted.** It goes through the same SHA256 check against `task_checksums.txt` as a fresh download, then the normal extract + `tc.cacheDir()`. On a mismatch we warn and download instead.
3. **After a fresh, verified download**, save the archive to `actions/cache` with the same key.
4. **Save and restore are best-effort and never fail the job.** `actions/cache` handles its own failures (a parallel job reserving the key, a read-only token on fork PRs, network/5xx) by logging them at its own level (info / warning / error) and returning `-1` / `undefined`; it throws only `ValidationError`. The wrapper therefore branches on the return value and does not re-classify the library's errors.
5. **`skip-checksum: true` disables the cross-job cache** (restore and save), since there is nothing to verify a restored archive against.

The cached path is `${RUNNER_TEMP}/setup-task-cache/<version>/<asset>`. It must be identical between save and restore (it is part of the entry's version hash), so the archive is copied there from tool-cache's randomly named download path.

### Why the archive, not the extracted tool dir

Anything that can write this repository's default-branch cache scope can plant an entry under the predictable key: GitHub limits that to trusted triggers (`push`, `workflow_dispatch`, `schedule`, …) or an explicit `cache-mode: write`, but a script injection or a compromised dependency in such a run is enough. The restored `task` binary would then run in jobs with more privileges (secrets, `id-token`). Storing a hash next to the entry does not help, because the attacker writes both. The only trusted reference is the release's `task_checksums.txt`, and it hashes the archive, so the archive is what we cache.

### Accepted residual risk: the restore itself

Verification only covers the `task` archive. `@actions/cache` extracts the restored tar with `-P` (absolute paths and `..` kept), so a crafted entry can write arbitrary files on the runner during `restoreCache()`, before we verify anything. GitHub documents this for every cache user ("Cache contents are not signed or verified … Extracted caches may modify files that are subsequently executed"). We accept it, like `actions/cache` and the setup-* actions do, rather than re-implementing the restore on `@actions/cache` internals:

- `cache` defaults to `false`.
- The README tells users not to enable it in release/publishing jobs, which is also what zizmor's `cache-poisoning` audit flags.
- `cache-mode: none` at the workflow/job level disables the restore, because `@actions/cache` honours it.

## Consequences

- **Across separate workflow runs, `cache: true` eliminates repeated downloads.** Within a single workflow run, the benefit is only realized if a cache entry already exists (from a previous run) or if jobs are explicitly serialized (e.g. via `needs`) so a prime job saves before others restore. Concurrently starting matrix jobs on a fresh cache all miss the restore and each download once; one job's save then benefits later runs.
- **The GitHub API call that resolves `latest` / ranges is not removed.** That call is required to compute the cache key. Rate-limit exposure on `api.github.com` is unchanged.
- **Release-asset downloads are reduced; the checksums file is still fetched every time.** It is small, and it is what makes a restored archive trustworthy. This improves reliability for the unauthenticated-asset path and lowers egress to GitHub's asset CDN, which is the failure mode this action was originally created to harden.
- **Cache entries are never trusted.** Only verified archives are saved, and every restore is verified again. A corrupt or tampered entry costs a warning and a download on each run until it is evicted (cache keys are immutable, so it cannot be overwritten).
- **Each job still extracts the archive.** That is local and cheap compared to the download.
- **Cache quota is consumed only when the feature is enabled.** Default workflows pay no extra cost.
- **New dependency:** `@actions/cache` is added to the bundle.
- **Self-hosted runners:** `cache: true` is redundant but harmless for versions already present in the runner tool cache; `tc.find()` will hit and skip both restore and save. A version not yet installed on that runner still goes through the cross-job restore/save path.
