import test from "node:test";
import assert from "node:assert/strict";
import { writeFile, readFile } from "node:fs/promises";
import { harness, textOf, jsonOf } from "./harness.js";
test("real SDK: one enhanced edit, native write, policies and both execution surfaces", async () => {
  const calls: string[] = [];
  const h = await harness({
    factories: [
      (pi) => {
        pi.on("tool_call", (event) => {
          calls.push(event.toolName);
          if (
            event.toolName === "edit" &&
            (event.input as { path?: string }).path === "blocked"
          )
            return { block: true, reason: "fixture denial" };
        });
      },
    ],
  });
  try {
    const s = await h.make();
    const tools = s.getAllTools();
    assert.equal(tools.filter((t) => t.name === "edit").length, 1);
    assert.match(
      tools.find((t) => t.name === "edit")!.description,
      /Strict single-file/,
    );
    assert(!tools.find((t) => t.name === "write")!.description.includes("IR"));
    for (const name of [
      "read",
      "bash",
      "edit",
      "write",
      "codemode",
      "codebuffer",
    ])
      assert(s.getActiveToolNames().includes(name), name);
    await writeFile(h.dir + "/file.txt", "alpha beta");
    let r = await h.call(
      s,
      {
        path: "file.txt",
        format: "replace",
        edits: [{ old: "alpha", replacement: "A" }],
      },
      "edit",
    );
    assert.equal(r.isError, false, textOf(r));
    const payload = h.payloads.findLast((p) =>
      (p.tools as { name: string }[])?.some((t) => t.name === "edit"),
    )!;
    assert.equal(
      (payload.tools as { name: string }[]).filter((t) => t.name === "edit")
        .length,
      1,
    );
    r = await h.call(
      s,
      {
        code: 'text(await tools.edit({path:"file.txt",format:"replace",edits:[{old:"beta",replacement:"B"}]}));',
      },
      "codemode",
    );
    assert.equal(r.isError, false, textOf(r));
    assert.equal(await readFile(h.dir + "/file.txt", "utf8"), "A B");
    r = await h.call(
      s,
      {
        path: "blocked",
        format: "replace",
        edits: [{ old: "x", replacement: "y" }],
      },
      "edit",
    );
    assert.equal(r.isError, true);
    assert.match(textOf(r), /denial/);
    r = await h.call(s, {
      action: "exec",
      source:
        'text(await tools.edit({path:"file.txt",edits:[{oldText:"A",newText:"alpha"}]}));throw Error("repair fixture");',
    });
    assert.equal(r.isError, true);
    const m = jsonOf(r);
    r = await h.call(s, {
      action: "repair",
      ref: m.ref,
      base: m.base,
      rerun: "from-start",
      edit: {
        format: "range",
        edits: [
          {
            start: 0,
            end: 'text(await tools.edit({path:"file.txt",edits:[{oldText:"A",newText:"alpha"}]}));throw Error("repair fixture");'
              .length,
            text: 'text("repaired");',
          },
        ],
      },
    });
    assert.equal(r.isError, false, textOf(r));
    assert(calls.filter((n) => n === "edit").length >= 4);
    for (const [name, args] of [
      ["read", { path: "file.txt" }],
      ["grep", { pattern: "alpha", path: "file.txt" }],
      ["find", { pattern: "*.txt" }],
    ] as const) {
      s.setActiveToolsByName([...s.getActiveToolNames(), name]);
      const result = await h.call(s, args, name);
      assert.equal(result.isError, false, textOf(result));
    }
    const snap = jsonOf(
      await h.call(
        s,
        { path: "file.txt", format: "snapshot", limit: 100 },
        "edit",
      ),
    );
    r = await h.call(
      s,
      {
        path: "file.txt",
        format: "range",
        base: snap.base,
        edits: [{ start: 0, end: 5, text: "gamma" }],
      },
      "edit",
    );
    assert.equal(r.isError, false, textOf(r));
    r = await h.call(
      s,
      {
        path: "file.txt",
        format: "apply_patch",
        patch:
          "*** Begin Patch\n*** Update File: file.txt\n@@\n-gamma B\n+delta B\n*** End of File\n*** End Patch",
      },
      "edit",
    );
    assert.equal(r.isError, false, textOf(r));
    r = await h.call(
      s,
      {
        code: 'const results=await Promise.all([tools.write({path:"file.txt",content:"queued"}),tools.edit({path:"file.txt",format:"replace",edits:[{old:"queued",replacement:"serialized"}]})]);text(results);',
      },
      "codemode",
    );
    assert.equal(r.isError, false, textOf(r));
    assert.equal(await readFile(h.dir + "/file.txt", "utf8"), "serialized");
    r = await h.call(s, { command: "exit 7" }, "bash");
    assert.equal(r.isError, true, "nonzero bash exit must remain visible");
    r = await h.call(
      s,
      { path: "created.txt", content: "native write" },
      "write",
    );
    assert.equal(r.isError, false);
    assert.equal(
      await readFile(h.dir + "/created.txt", "utf8"),
      "native write",
    );
  } finally {
    await h.close();
  }
});
