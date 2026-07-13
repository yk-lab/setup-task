# 3. Verify SHA256 checksums by default

- Status: Accepted
- Date: 2026-06-15

## Context

go-task publishes `task_checksums.txt` alongside every release, but
`arduino/setup-task` does not use it — downloaded binaries are trusted without
integrity verification, a supply-chain weakness.

## Decision

Fetch `task_checksums.txt` and verify the downloaded asset's SHA256 against it by
default. A mismatch is a *permanent* failure (never retried) and the artifact is
discarded. When the checksums file is genuinely unavailable, continue only if the
consumer opts in with `skip-checksum: true` (which emits a warning); otherwise
fail.

## Consequences

- Tampered or corrupted downloads fail closed (goal G3).
- Checksum mismatches are classified as permanent, distinct from transient
  network errors that retry.
- `skip-checksum` exists as a documented, discouraged escape hatch.
- Checksums come from the same release as the asset, so they defend against
  corruption and in-transit tampering — not a compromised upstream that swaps
  both files. Independent authenticity (signing / provenance) is tracked
  separately (SLSA; see the issue tracker).
