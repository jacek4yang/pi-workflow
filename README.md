# pi-workflow: strict edit and compact execution

Two compact tools for Pi 1.0.1 / Node 24: strict single-file `edit` and literal-argv `workflow` execution. **Native write is unchanged.** No project DSL, automatic dependency installation, retry loop or workspace transactions.

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

Choose direct tools for simple operations. CodeBuffer's `{code}` is a compact front end to native CodeMode for orchestration, with retained source and `repair` on failure. CodeBuffer does not own workspace file persistence.

## Workflow: normal CLI, less boilerplate

```js
workflow({ run: ["git", "status", "--short"], cwd: "/project" });
workflow({
  run: ["gh", "pr", "checks", "3"],
  project: "plugin",
  route: "personal",
});
workflow({
  run: ["python", "-m", "pytest", "tests/test_example.py", "-q"],
  project: "python-app",
});
workflow({
  run: ["cargo", "test", "--locked"],
  project: "rust-app",
  timeout: 120,
});
```

Arguments are literal (no shell expansion/pipes); use native bash when shell syntax is natural. `cwd` is per-call, not shared process state. `project` and `cwd` are mutually exclusive. Defaults: active cwd, inherited environment, last 80 output lines (at most 16000 characters). Nonzero exit codes stay errors; clipped output has a private log path. No automatic retries or guessed success. Logs may contain command-produced secrets: do not publish them; remove them when no longer needed.

Optional private `~/.pi/agent/workflow.json` (or `PI_CODING_AGENT_DIR/workflow.json`):

```json
{
  "routes": {
    "public": "http://127.0.0.1:10809",
    "personal": "http://127.0.0.1:10808"
  },
  "projects": {
    "python-app": {
      "cwd": "/project/python-app",
      "python": ".venv/bin/python",
      "env": { "PYTHONPATH": "/project/python-app/src" }
    },
    "rust-app": { "cwd": "/project/rust-app" },
    "plugin": { "cwd": "/project/plugin" }
  }
}
```

Projects are explicit shortcuts, not auto-detected trust or authorization. Only literal `python` selects the configured interpreter; `uv`, `cargo`, `gh`, `git` and other executables keep their normal semantics. Nothing installs dependencies or modifies business code on discovery. Use the project's documented commands and lockfiles, not guessed universal recipes. `route:direct` clears proxy/bypass variables; public/personal set only the configured credential-free proxy. No fallback route or hidden credential loading. **HTTP proxy variables do not proxy Git SSH**: use an explicit HTTPS remote and existing credential helper when needed.

Execution delegates to public `ctx.executeTool("bash",...)`: both `workflow` and the exact generated `bash` command remain visible to permission hooks. `workflow` CLI quoting currently requires POSIX; on Windows use native bash/PowerShell. Enhanced editing remains cross-platform.

## Long tasks

Optional upstream `@juicesharp/rpiv-todo` supplies branch/session-backed task state; `@juicesharp/rpiv-ask-user-question` supplies interactive clarification (hidden headlessly). Keep a few milestone tasks, not a todo per tool call. Store one concise checkpoint in the active task description/metadata: decisions, evidence references, remaining work and next action. Do not duplicate transcripts or hidden reasoning. Ask at task setup; mid-task ask only for an indispensable answer after completing independent deterministic work. Neither tool owns compaction, retries or authorization.

See [measured command patterns](docs/ERGONOMICS.md).

See [architecture](docs/ARCHITECTURE.md), [testing](docs/TESTING.md), and [failure model](docs/FAILURE_MODEL.md).
