# pi-workflow: enhanced edit

Strict, compact single-file editing for Pi 1.0.0 / Node 24. The extension replaces the model-facing `edit`; **write is unchanged**. No Git/build/workflow orchestration or multi-file transactions.

```sh
pi install git:github.com/jacek4yang/pi-workflow
```

Reload Pi after installing. This Git source intentionally tracks the default branch. The pure kernel is imported from `pi-codebuffer/editing`, installed as a Git dependency: one versioned canonical IR, no fork and no reverse dependency. npm versions that restrict Git dependencies need `--allow-git=all` for tarball installs; the Git checkout carries a project-scoped `.npmrc` allowing direct Git dependencies.

## Use

```js
edit({
  path: "src/a.ts",
  format: "replace",
  edits: [{ old: "one", replacement: "two" }],
});
edit({
  path: "src/a.ts",
  format: "apply_patch",
  patch:
    "*** Begin Patch\n*** Update File: src/a.ts\n@@\n-one\n+two\n*** End Patch",
});
edit({ path: "src/a.ts", format: "snapshot", offset: 0, limit: 1000 });
// Use the returned full base hash and UTF-16 half-open coordinates:
edit({
  path: "src/a.ts",
  format: "range",
  base: "<full SHA-256>",
  edits: [{ start: 0, end: 100, text: "replacement" }],
});
```

Exact matching is unique by default; `count` explicitly verifies repeated matches. Every operation targets the same immutable base. No fuzzy matching, stale rebasing or incremental replacement matching. Range requires a full base hash; snapshot returns bound text, coordinates and hash. A prior unrelated `read` is not automatically bound: use the snapshot for range planning. Snapshot limit defaults to zero (metadata only), at most 16000 UTF-16 units.

Legacy `{path,edits:[{oldText,newText}]}` and `{path,oldText,newText}` normalize to the same compiler. New callers should use the compact interface. `tools.edit(...)` in native CodeMode exposes structured status/base/after metadata; normal model output is a short summary, not a giant diff. Expanded UI details contain bounded splice excerpts, not a full unified patch.

## Guarantees and boundaries

One file per call. Public Pi mutation queue covers read → compile → validate → write, coordinating with native write/edit. All validation completes before intentional writes. Path resolution uses the active cwd; ordinary symlinks are followed and their identity rechecked; inode/mode are preserved through positional in-place writes. Hardlinks, special files, invalid UTF-8, NUL, surrogate splits and files over 256 KiB are rejected. BOM and untouched text are preserved. Patch line matching supports LF/CRLF, rejects mixed newlines; exact/range changes are literal. Patch envelopes must update exactly the outer lexical resolved path (no aliases, moves, create/delete or multi-file envelopes).

The filesystem layer is NOT crash-atomic: I/O failures or process death during writes may leave partial content. Cancellation before commit makes no intentional write; once writes begin they settle without pretending cancellation rolled back. Unrelated external writers are not serialized. Recheck after a write failure. Pi tool-call hooks see `edit`; this is not a general permission sandbox. Auth/session internals, `.ssh` and `.git` paths are blocked.

Choose direct tools for simple operations, native CodeMode for local orchestration, CodeBuffer exec/repair for nontrivial repairable source. CodeBuffer does not own workspace file persistence.

See [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), and [failure model](docs/FAILURE_MODEL.md).
