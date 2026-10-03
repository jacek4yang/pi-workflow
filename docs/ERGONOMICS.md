# Evidence-led execution ergonomics

## Observations

A private seven-day audit covered 20 sessions, 3,340 assistant tool calls and 7,523,415 argument bytes. Only tool-call blocks were processed, not reasoning. Entry IDs were deduplicated. Scripts were parsed without executing them. Only aggregate counts are published in [ergonomics-evidence.json](ergonomics-evidence.json), never raw sessions, commands or credentials.

- 864 authored shell commands contained proxy boilerplate (78,318 assignment bytes).
- 193 had `cd` prefixes (9,180 bytes); 320 had log/tail wrappers.
- 1,108 referenced Git, 600 gh; frequent operations included status/diff, PR checks and run inspection.
- 9,963 `text(await tools...)` occurrences in 2,911 scripts, but no `return tools...` occurrences.
- Python included 584 inline helpers, 362 module invocations and 296 pytest references. These categories overlap; not all Python is project orchestration.
- Cargo test (102), fmt (71), check (17) and clippy (41) motivate ordinary CLI support, not a second Rust DSL.

These are authored occurrences, not verified executed commands; 79 scripts failed static parsing and dynamic command construction is not reconstructed. Historical CodeMode-only exposure biases routing frequencies. Counts cannot establish causal token savings or model capability.

## Design decisions

Direct read/edit/search remain cheapest for simple work. CodeBuffer `{code: "return ..."}` handles composition with native CodeMode semantics and repairable source. `text` is still useful for incremental output. No implicit echo of every tool result and no automatic replay of side effects.

`workflow` accepts normal argv, optional cwd/project and explicit route. It does not invent verbs for every GitHub action, guess commits, install interpreters, resolve failures by trying other routes, or mutate global cwd. Permission hooks see the generated bash command. Logs retain exit status and a private full-output path if clipped. Existing native bash remains available for natural shell pipelines.

A project profile is a short name for a trusted explicit cwd/env/interpreter configuration. Python uses its actual environment and documented test commands; Cargo honors the project's lockfile and manifest. Remote URLs, branch names and mutating subcommands remain explicit. SafeLower's existing Python 3.12 environment and the Rust client's Cargo manifest were inspected read-only; this task does not authorize paid research or business-code changes.

## Deterministic before/after fixture

Real Pi 1.0 SDK and HTTP provider serialization, eight identical logical actions: create/read/tiny edit, parallel inspection, two cwd+route commands, script syntax failure and repair. Baselines are clean CodeBuffer ac9191c / workflow 8d30038 checkouts. New side hides the duplicate raw CodeMode declaration and adds workflow. Optional ask/todo tools are excluded from this comparison (measured separately in stack smoke).

| Metric                                          |  Before |   After |
| ----------------------------------------------- | ------: | ------: |
| Tool argument bytes                             |     824 |     596 |
| Tool result content bytes                       |   1,695 |   1,624 |
| Tool declaration bytes                          |   8,593 |   8,371 |
| Serialized provider request bytes, all requests | 181,175 | 175,266 |
| Provider requests                               |      16 |      16 |

Argument bytes decreased about 28%; full request bytes about 3.3%. **No reduction in model turns, token usage, billing or measured reasoning work is claimed.** This is a deterministic serialization fixture, not a live capability benchmark; timings/UUIDs may cause small byte variation. Native tool schemas, optional companions and actual project output affect economics. The earlier CodeMode-only → adaptive fixture actually increased full request bytes by ~6%; shorter source alone is not evidence of universal savings.

## Validation

- CodeBuffer tests: shorthand, awaited return once, strict mixed-input rejection, syntax repair, legacy lifecycle, effect acknowledgment and retention.
- Workflow tests: literal quoting, scoped routes, unknown profiles, cwd/env/interpreter, native bash policy blocking, nonzero exit status, private clipping logs and nested execution.
- Packaged smoke runs actual installed extension entrypoints, not just local source; stale tarballs fail.
- Stack fixture: all five maintained extensions plus upstream todo/ask; todo survives reload and session reopen; CodeBuffer repair works; headless ask is absent by upstream design.
- UI-boundary fixture: actual ask extension with public SDK dialog adapter, one declared ask tool and a selected answer. This is not a claim of manual visual TUI inspection.

Todo stores a few milestones; one concise checkpoint belongs in the active task's description/metadata, not every tool result. Questions belong at setup, or at an indispensable unresolved decision after independent deterministic work is complete. Neither replaces native compaction or Pi's retry lifecycle.
