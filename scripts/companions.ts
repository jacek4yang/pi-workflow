import { harness, jsonOf, textOf } from "../test/harness.js";
import assert from "node:assert/strict";
import { SessionManager } from "@earendil-works/pi-coding-agent";
const [companion, generation] = process.argv.slice(2);
if (!companion || !generation)
  throw Error("Pass companion and generation extension entry paths");
for (const companionsFirst of [true, false]) {
  const h = await harness({ companion, generation, companionsFirst });
  try {
    let s = await h.make();
    const r = await h.call(s, {
      action: "exec",
      source: 'throw Error("retain");',
    });
    assert.equal(r.isError, true);
    const m = jsonOf(r);
    await s.compact();
    const file = s.sessionManager.getSessionFile()!;
    s.dispose();
    s = await h.make(SessionManager.open(file));
    const repaired = await h.call(s, {
      action: "repair",
      ref: m.ref,
      base: m.base,
      rerun: "from-start",
      edit: {
        format: "replace",
        edits: [
          { old: 'throw Error("retain");', replacement: 'text("repaired");' },
        ],
      },
    });
    assert.equal(repaired.isError, false, textOf(repaired));
    const checkpoints = h.payloads.filter(
      (p) =>
        Array.isArray(p.input) &&
        p.input.some((i) => i.type === "compaction_trigger"),
    ).length;
    assert(checkpoints > 0, "native typed compaction request exercised");
    console.log({
      companionsFirst,
      checkpointRequests: checkpoints,
      repairAfterRestart: true,
    });
  } finally {
    await h.close();
  }
}
