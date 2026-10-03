import { harness, jsonOf, textOf } from "../test/harness.js";
import { writeFileSync } from "node:fs";
import assert from "node:assert/strict";
const reports = [];
for (const adaptive of [false, true]) {
  const h = await harness({
    mode: adaptive ? "on" : "only",
    inlineBudget: adaptive ? 0 : 3000,
    hideRaw: !adaptive,
    ...(!adaptive ? { paths: [] } : {}),
  });
  let calls = 0,
    requestBytes = 0,
    resultBytes = 0;
  const stages = [];
  try {
    const s = await h.make();
    s.setActiveToolsByName([...s.getActiveToolNames(), "grep", "find", "ls"]);
    writeFileSync(h.dir + "/file.txt", "alpha\n");
    writeFileSync(h.dir + "/second.txt", "second\n");
    async function call(name: string, args: object, fail = false) {
      calls++;
      requestBytes += Buffer.byteLength(JSON.stringify({ name, args }));
      const r = await h.call(s, args, name);
      resultBytes += Buffer.byteLength(JSON.stringify(r));
      assert.equal(r.isError, fail, textOf(r));
      return r;
    }
    async function primitive(name: string, args: object) {
      return adaptive
        ? call(name, args)
        : call("codebuffer", {
            action: "exec",
            source:
              "text(await tools." + name + "(" + JSON.stringify(args) + "));",
          });
    }
    await primitive("read", { path: "file.txt" });
    await primitive(
      "edit",
      adaptive
        ? {
            path: "file.txt",
            format: "replace",
            edits: [{ old: "alpha", replacement: "beta" }],
          }
        : { path: "file.txt", edits: [{ oldText: "alpha", newText: "beta" }] },
    );
    stages.push({ name: "simple", calls });
    await primitive("find", { pattern: "*.txt" });
    await primitive("grep", { pattern: "beta", path: "file.txt" });
    await primitive(
      "edit",
      adaptive
        ? {
            path: "file.txt",
            format: "replace",
            edits: [{ old: "beta", replacement: "gamma" }],
          }
        : { path: "file.txt", edits: [{ oldText: "beta", newText: "gamma" }] },
    );
    stages.push({ name: "search", calls });
    const source =
      'const results=await Promise.all([tools.read({path:"file.txt"}),tools.read({path:"second.txt"})]);text(results.map(x=>x.length));';
    await call(
      adaptive ? "codemode" : "codebuffer",
      adaptive ? { code: source } : { action: "exec", source },
    );
    stages.push({ name: "medium", calls });
    const failed = jsonOf(
      await call(
        "codebuffer",
        {
          action: "exec",
          source:
            'text(await tools.bash({command:"printf checked"}));throw Error("fixture");',
        },
        true,
      ),
    );
    await call("codebuffer", {
      action: "repair",
      ref: failed.ref,
      base: failed.base,
      rerun: "from-start",
      edit: {
        format: "replace",
        edits: [
          { old: 'throw Error("fixture");', replacement: 'text("fixed");' },
        ],
      },
    });
    stages.push({ name: "repairable", calls });
    const declarations = h.payloads[0]!.tools as {
      name: string;
      description: string;
    }[];
    reports.push({
      adaptive,
      calls,
      requestBytes,
      resultBytes,
      providerRequestBytes: h.payloads.reduce(
        (n, p) => n + Buffer.byteLength(JSON.stringify(p)),
        0,
      ),
      declarationBytes: Buffer.byteLength(JSON.stringify(declarations)),
      declarations: declarations.map((t) => t.name),
      systemBytes: Buffer.byteLength(s.systemPrompt),
      codemodeDescriptionBytes: Buffer.byteLength(
        declarations.find((t) => t.name === "codemode")?.description ?? "",
      ),
      stages,
    });
  } finally {
    await h.close();
  }
}
writeFileSync(
  process.argv[2] ?? "/tmp/workflow-benchmark.json",
  JSON.stringify(reports, null, 2),
);
console.log(reports);
