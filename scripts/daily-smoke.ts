import assert from "node:assert/strict";
import { writeFileSync, readFileSync } from "node:fs";
import { getAgentDir, SessionManager } from "@earendil-works/pi-coding-agent";
import { join } from "node:path";
import { harness, textOf, jsonOf } from "../test/harness.js";
const h = await harness({ daily: true });
try {
  let s = await h.make();
  async function call(name: string, args: object) {
    const r = await h.call(s, args, name);
    assert.equal(r.isError, false, textOf(r));
    return r;
  }
  await s.reload();
  writeFileSync(join(h.dir, "smoke.txt"), "alpha\n");
  await call("read", { path: "smoke.txt" });
  await call("grep", { path: "smoke.txt", pattern: "alpha" });
  await call("find", { pattern: "smoke.txt" });
  await call("ls", { path: "." });
  await call("edit", {
    path: "smoke.txt",
    format: "replace",
    edits: [{ old: "alpha", replacement: "beta" }],
  });
  await call("edit", {
    path: "smoke.txt",
    format: "apply_patch",
    patch:
      "*** Begin Patch\n*** Update File: smoke.txt\n@@\n-beta\n+gamma\n*** End Patch",
  });
  const snapshot = jsonOf(
    await call("edit", { path: "smoke.txt", format: "snapshot", limit: 100 }),
  );
  await call("edit", {
    path: "smoke.txt",
    format: "range",
    base: snapshot.base,
    edits: [{ start: 0, end: 5, text: "delta" }],
  });
  await call("write", { path: "created.txt", content: "native" });
  await call("codebuffer", {
    code: 'return tools.edit({path:"smoke.txt",format:"replace",edits:[{old:"delta",replacement:"nested"}]});',
  });
  await call("codebuffer", {
    code: 'return Promise.all([tools.read({path:"created.txt"}),tools.read({path:"smoke.txt"})]);',
  });
  await call("workflow", {
    run: ["printf", "workflow-ok"],
    cwd: h.dir,
    route: "direct",
  });
  await call("todo", {
    action: "create",
    subject: "Installed stack smoke",
    description: "Checkpoint: deterministic smoke; verify session reopen next",
  });
  const failed = await h.call(s, {
    code: 'text("before");throw Error("expected failure");',
  });
  assert.equal(failed.isError, true);
  const metadata = jsonOf(failed);
  const sessionFile = s.sessionManager.getSessionFile()!;
  s.dispose();
  s = await h.make(SessionManager.open(sessionFile));
  await s.reload();
  await call("codebuffer", {
    action: "repair",
    ref: metadata.ref,
    base: metadata.base,
    rerun: "from-start",
    edit: {
      format: "replace",
      edits: [
        {
          old: 'throw Error("expected failure");',
          replacement: 'text("after");',
        },
      ],
    },
  });
  assert.match(
    textOf(await call("todo", { action: "list" })),
    /Installed stack smoke/,
  );
  const result = await h.call(s, { command: "exit 7" }, "bash");
  assert.equal(result.isError, true);
  const p = h.payloads.at(-1)!;
  const declarations = p.tools as { name: string; description: string }[];
  const names = declarations.map((t) => t.name);
  for (const n of [
    "read",
    "grep",
    "find",
    "ls",
    "bash",
    "edit",
    "write",
    "workflow",
    "todo",
    "codebuffer",
  ])
    assert(names.includes(n), n);
  assert.equal(names.filter((n) => n === "edit").length, 1);
  assert.equal(new Set(names).size, names.length);
  assert(!names.includes("codemode"));
  assert(!names.includes("ask_user_question")); // hidden without an interactive UI
  assert.match(
    declarations.find((t) => t.name === "edit")!.description,
    /Strict single-file/,
  );
  const report = {
    passed: true,
    reload: true,
    reopen: true,
    providerTools: names,
    toolDeclarationBytes: Buffer.byteLength(JSON.stringify(declarations)),
    systemBytes: Buffer.byteLength(s.systemPrompt),
    codemodeDescriptionBytes: Buffer.byteLength(
      declarations.find((t) => t.name === "codemode")?.description ?? "",
    ),
    editSchemaBytes: Buffer.byteLength(
      JSON.stringify(declarations.find((t) => t.name === "edit")),
    ),
    providerRequestBytes: h.payloads.reduce(
      (n, p) => n + Buffer.byteLength(JSON.stringify(p)),
      0,
    ),
    requests: h.payloads.length,
  };
  writeFileSync(
    "/tmp/adaptive-daily-smoke.json",
    JSON.stringify(report, null, 2),
  );
  console.log(report);
} finally {
  await h.close();
}
