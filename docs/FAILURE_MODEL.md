# Failure model

Validation, stale-base, malformed-tail, ambiguity, overlap, unsupported encoding/target and precommit cancellation failures intentionally write nothing. Later operations never see earlier mutations. Errors during actual writes report possible partial changes; reread before retry. No file journal, cross-file transaction or power-loss guarantee.

The public Pi queue serializes cooperating tools and symlink aliases. Hardlinks are rejected; symlink target changes and observable external modifications fail before writing. Noncooperating writers can still race after the final check.

A snapshot is a read-only edit operation with a full SHA-256 identity; it does not reserve the file. `STALE_BASE` means take a new snapshot and reconsider, not retry with a guessed hash. Atomic source edits inside CodeBuffer are a separate backend and do not roll back workspace side effects.

Rollback: remove `git:github.com/jacek4yang/pi-workflow` and reload; native edit returns. Existing file changes remain. Keep configuration backups outside repositories; never restore authentication from task logs.
