# Releasing

Releases are cut with the **Release** workflow
(`.github/workflows/release.yml`), triggered manually. It builds the bundle,
bakes it onto the release tag, and moves the `v<major>` / `v<major>.<minor>`
moving tags — so consumers can pin `@v1`.

## Cut a release

1. Land everything you want in the release on `main` (green CI).
2. **Actions → Release → Run workflow**, on `main`, and enter the version as a
   full tag with the leading `v`, e.g. `v1.0.0`. Pre-release tags (`-rc`,
   `-beta`, …) are **rejected**: the workflow always advances the stable `v1` /
   `v1.0` moving tags, so releasing a pre-release through it would drag `@v1`
   consumers onto an unfinished build.
3. Run it. The workflow:
   - `pnpm install --frozen-lockfile` + `pnpm run build` with the pinned
     pnpm/Node, so the bundle is reproducible;
   - creates the tag, commits `action.yml` + `dist/index.js` onto it, and
     force-updates the moving `v1` / `v1.0` tags to match
     ([`JasonEtco/build-and-tag-action`], SHA-pinned);
   - publishes the GitHub Release **last**, on the already-baked tag, with
     auto-generated notes — so a failed build never leaves a published release
     pointing at code without `dist/`;
   - smoke-tests the result by checking out `@v1` and confirming the action is
     packaged (`action.yml` + a parseable `dist/index.js`).
4. Confirm the run's job summary and that `uses: yk-lab/setup-task@v1` resolves.

> If a run fails partway (e.g. the bake step errored, leaving a `vX.Y.Z` tag but
> no published release), just **re-run the workflow with the same version** — tag
> creation and release publishing are idempotent, so the bake fast-forwards the
> leftover tag onto the fresh build and heals the half-finished state. The tag is
> protected against deletion, so re-running (not deleting) is the recovery path.

`dist/` is **never committed to `main`** (it is `.gitignore`d); it exists only
on the tags the workflow writes. That is why the action must be consumed via a
tag, never `@main`.

## Why the tag ruleset only protects `v*.*.*`

The **Protect immutable release tags (v\*.\*.\*)** ruleset applies `deletion` +
`non_fast_forward` to immutable version tags (`v1.0.0`, `v2.3.1`, …) but **not**
to the moving `v1` / `v1.0` tags — those are meant to move every release, which
is a non-fast-forward update the ruleset would otherwise block.

The immutable version tag stays protected even though the workflow force-updates
it to bake in `dist/`: that update points the tag at a commit whose parent is the
release commit, i.e. a **fast-forward**, which `non_fast_forward` permits. Moving
`v1` to an unrelated release commit is non-fast-forward, hence it is left out of
the protected pattern.

> If a future release fails because the `v*.*.*` force-update is rejected, add
> the release workflow's identity (`github-actions[bot]`, or a dedicated GitHub
> App) as a **bypass actor** on the ruleset — don't drop the protection.

## First-time GitHub Marketplace listing

Publishing to Marketplace is a **one-time manual step** that can't be automated
(it needs 2FA and accepting the Marketplace agreement):

1. Open the first release, **Edit**, tick **Publish this Action to the GitHub
   Marketplace**, pick a category, and update.
2. Subsequent releases are listed automatically.

[`JasonEtco/build-and-tag-action`]: https://github.com/JasonEtco/build-and-tag-action
