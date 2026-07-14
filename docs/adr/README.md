# Architecture Decision Records

Significant design decisions behind `setup-task`, in
[MADR](https://adr.github.io/madr/)-style short form (Context → Decision →
Consequences). Records are immutable once **Accepted** — supersede with a new
record rather than editing an old one.

| ADR | Decision | Status |
|-----|----------|--------|
| [0001](0001-node24-runtime.md) | Node 24 action runtime | Accepted |
| [0002](0002-authenticated-downloads-by-default.md) | Authenticate GitHub downloads by default | Accepted |
| [0003](0003-mandatory-checksum-verification.md) | Verify SHA256 checksums by default | Accepted |
| [0004](0004-restricted-download-source.md) | Restrict downloads to go-task releases on an allowlisted host | Accepted |
| [0005](0005-archive-only-distribution.md) | Install from archives only, not OS packages | Accepted |
| [0006](0006-dist-built-at-release.md) | Build `dist/` at release time, commit only on tags | Accepted |
| [0007](0007-arduino-setup-task-input-compatibility.md) | Keep inputs compatible with `arduino/setup-task` | Accepted |

To add one: copy the shape of an existing record, take the next number, and open
it at `Status: Proposed`.
