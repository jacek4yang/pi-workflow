# Testing

Node24 / Pi1.0.0. `npm ci --ignore-scripts`; `npm run check`; `npm run format:check`; `npm pack --json`; `npm exec -- tsx scripts/smoke.ts`. Tarball smoke installs into a temporary home and runs actual registered tools through the real SDK/local deterministic provider; it makes no paid model request. Test harness adapted from pi-codebuffer (same maintainer, MIT).

Unit cases cover exact/legacy inputs, immutable multi-edit validation, missing/ambiguous/overlap/malformed edits, no-op, snapshot/range/Unicode/empty/EOF, LF/CRLF/BOM/mixed-newline policy, strict patch path/tail, queued native write, cancellation, inode/mode, symlinks/hardlinks and invalid UTF-8. SDK checks edit replacement, provider declarations, policy denials, CodeMode nested calls, original write and CodeBuffer repair.

Linux is the primary validated target. Windows CI tests ordinary file semantics (symlink creation omitted where developer privileges are unavailable); CodeBuffer scratch itself remains unsupported on Windows, so its SDK execution test is a Linux gate. No claim about network filesystems, ACL transactions or power-loss durability.
