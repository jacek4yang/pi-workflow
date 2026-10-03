# Measurements

`npm exec -- tsx scripts/benchmark.ts` replays deterministic local-provider fixtures on Pi1.0.0 / Node24.21.0. Same eight model calls: simple read/edit (2), search/edit (3), composed reads (1), failed script/repair (2). The old configuration is CodeMode-only with 3000 inline budget and hidden raw CodeMode; the adaptive configuration is on/zero with enhanced edit and visible raw CodeMode. No paid model request or tokenizer is used.

| Metric                          | Old routing | Adaptive |
| ------------------------------- | ----------: | -------: |
| Model tool calls                |           8 |        8 |
| Full tool name/argument bytes   |        1258 |      932 |
| Result bytes (timing-dependent) |        5803 |     3239 |
| Initial declaration bytes       |        8446 |    10886 |
| All provider request-body bytes |      201154 |   213167 |

Adaptive routing reduced wrapper/source argument bytes but **increased provider request bytes about 6% in this short fixture** because direct declarations cost more. It did not reduce model turns versus already-fused exec. This is a deliberate control/ergonomics tradeoff, not a universal token-saving claim. Full source repair was not regenerated.

Daily installation smoke (all maintained extensions loaded, real SDK, local provider) captured 14 actual provider declarations: 15631 bytes, native CodeMode description1031 bytes, enhanced edit declaration1360 bytes. Full system prompt8778 bytes versus the pre-migration SDK inventory10156 bytes. The combined local policy files shrank5399→3717 UTF-8 bytes. The old runtime tool-metadata inventory is not a provider declaration measurement and must not be compared as if it were.

Dogfood in an isolated real registered-tool session modified this project through five successful edit calls: replace1, apply_patch1, snapshot1, range1, legacy1. Serialized request arguments1294 bytes; one guarded range avoided retransmitting310 bytes of old body. No edit failures or retries in that recorded window. This observation is separate from deterministic replay. Later daily smoke additionally covered direct and nested edits, reload, restart, native write, permission hooks and failed-command visibility.

Counts are bytes, not tokens or bills. Direct calls in the fixture are model requests to edit, not shortcuts to the pure compiler. The task-driving original chat retained its previous tools until its own reload; fresh actual-home sessions were explicitly validated instead of claiming a hot swap.
