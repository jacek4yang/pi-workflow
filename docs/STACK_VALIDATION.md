# Installed stack validation (Pi 1.0.0 / Node 24.21.0)

All five maintained plugins were removed/reinstalled through `pi install` using unversioned Git sources, not tags. The unchanged native-compaction main was reverified, not given an artificial code change. Upstream ask/todo 2.12.0 were audited and installed separately; their implementations were not copied into workflow.

Local gates: CodeBuffer 35 tests / 38 packaged tests; workflow 9 tests / 3 packaged tests; generation recovery 69; native compaction 135; context prune 17. GitHub checks passed before feature merges. Pruner CI initially exposed a missing lockfile; tracked reproducible Pi 1.0 test dependencies fixed it. Two observed oversized summaries motivated a streamed visible-text cap, with regressions proving originals remain and partial summaries are never committed.

A fresh-shell actual-home SDK fixture passed reload and session reopen. The model request declared 15 unique tools headlessly: direct read/bash/edit/write/grep/find/ls, workflow, CodeBuffer, LSP tools, web search, prune/query and todo. Raw CodeMode was absent; native executor delegation remained functional. Ask is hidden headlessly by upstream design and declared once with a public SDK UI adapter. The adapter selected an answer successfully; no claim of manual visual TUI inspection.

The final actual-home fixture recorded 17,436 tool-declaration bytes, 11,060 system bytes and 1,213,131 cumulative provider-request bytes over 34 fixture requests. These are inventory figures, not a comparison against shorter earlier fixtures. Additional task/UI tools have a context cost.

Configured project smoke also passed: SafeLower's existing Python 3.12 interpreter and Rust client's offline, locked, no-dependencies Cargo metadata. No business code or toolchains were changed.

Both companion load orders exercised typed native compaction, restart and CodeBuffer repair successfully against the installed Git packages. Todo survived reload/reopen. Native write, enhanced edit, direct searching, nested execution and nonzero bash status remained functional.

## Bounded live Astra probe

`PI_WORKFLOW_LIVE=1 node --import tsx scripts/live-stack.ts` opts into a small real-model fixture with tool-policy guards and a three-minute deadline. It uses the configured model/thinking unchanged; this validation used GPT-6 Astra / openai-codex / medium. Run SDK probes with the explicit authenticated network route and Node's `NODE_USE_ENV_PROXY=1` where required. SDK creation is not CLI network setup: two preliminary probes lacked that process setting and failed before any tool call; they are not counted as successful runs.

The corrected probe completed in four assistant responses:

- one CodeBuffer program with top-level return, delegating once to native CodeMode;
- two concurrent reads, one enhanced edit, one workflow command delegating to native bash;
- correct sum and preserved untouched file content;
- zero tool errors or policy blocks; CodeBuffer argument bytes: 267.

Provider-reported usage for this successful probe: input 7,222; output 183; cache-read 18,304; total 25,709 tokens. **This is not an A/B comparison or a billing/reasoning-savings claim.** Only aggregate metrics are printed; no raw reasoning, signatures, credentials or model-generated source are published.

A running original chat is not hot-swapped merely by changing files. Start a fresh Pi process from a fresh shell for the new environment and schemas. Private config backups and rollback instructions are kept outside Git.
