# 5. Install from archives only, not OS packages

- Status: Accepted
- Date: 2026-06-15

## Context

go-task ships several distribution formats: `.tar.gz` / `.zip` archives plus
`.deb` / `.rpm` / `.apk` OS packages. Supporting OS packages means invoking
system package managers with elevated privileges and per-distro logic.

## Decision

Support archive formats only — `.tar.gz` for linux/darwin/freebsd, `.zip` for
windows. Extract, chmod, cache, and add to `PATH`. OS package formats are out of
scope.

## Consequences

- One extraction path across all supported platforms; no privilege escalation.
- The supported OS/arch matrix mirrors go-task's published archive assets; adding
  a target means updating the `OS_MAP` / `ARCH_MAP` (Node → go-task token maps)
  and the `SUPPORTED` matrix in `platform.ts`.
