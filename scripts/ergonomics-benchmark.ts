import assert from "node:assert/strict";
import { resolve } from "node:path";
import { harness, jsonOf, textOf } from "../test/harness.js";
const root = process.env.PI_BASELINE_ROOT;
assert(
  root,
  "PI_BASELINE_ROOT must contain clean old codebuffer/workflow checkouts with dependencies",
);
async function fixture(after: boolean) {
  process.env.PI_CODEBUFFER_TEST_EXTENSION = after
    ? resolve("../pi-codebuffer/index.ts")
    : resolve(root!, "codebuffer/index.ts");
  const h = await harness({
    paths: [after ? resolve("index.ts") : resolve(root!, "workflow/index.ts")],
    hideRaw: after,
  });
  try {
    const s = await h.make();
    let argumentBytes = 0;
    let resultBytes = 0;
    const normalize = (v: unknown) =>
      JSON.stringify(v).replaceAll(h.dir, "/fixture");
    const call = async (name: string, args: object, error = false) => {
      argumentBytes += Buffer.byteLength(normalize(args));
      const r = await h.call(s, args, name);
      resultBytes += Buffer.byteLength(normalize(r.content));
      assert.equal(r.isError, error, textOf(r));
      return r;
    };
    await call("write", { path: "fixture.txt", content: "alpha\nbeta\n" });
    await call("read", { path: "fixture.txt" });
    await call("edit", {
      path: "fixture.txt",
      format: "replace",
      edits: [{ old: "beta", replacement: "gamma" }],
    });
    const source =
      'await Promise.all([tools.read({path:"fixture.txt"}),tools.bash({command:"printf orchestration"})])';
    await call(
      "codebuffer",
      after
        ? { code: `return ${source};` }
        : { action: "exec", source: `text(${source});` },
    );
    for (const value of ["one", "two"]) {
      if (after)
        await call("workflow", {
          run: ["printf", value],
          cwd: h.dir,
          route: "direct",
        });
      else
        await call("bash", {
          command: `cd '${h.dir}' && env -u http_proxy -u https_proxy -u all_proxy -u no_proxy -u HTTP_PROXY -u HTTPS_PROXY -u ALL_PROXY -u NO_PROXY printf '${value}'`,
        });
    }
    const failed = await call(
      "codebuffer",
      after
        ? { code: "return 42;(" }
        : { action: "exec", source: "text(42);(" },
      true,
    );
    const m = jsonOf(failed);
    await call("codebuffer", {
      action: "repair",
      ref: m.ref,
      base: m.base,
      edit: { format: "replace", edits: [{ old: ";(", replacement: ";" }] },
    });
    const last = h.payloads.at(-1)!;
    const tools = last.tools as { name: string; description?: string }[];
    return {
      fixtureToolCalls: 8,
      argumentBytes,
      resultBytes,
      providerRequests: h.payloads.length,
      providerRequestBytes: h.payloads.reduce(
        (n, p) => n + Buffer.byteLength(normalize(p)),
        0,
      ),
      systemPromptBytes: Buffer.byteLength(String(last.instructions)),
      toolDeclarationBytes: Buffer.byteLength(JSON.stringify(tools)),
      tools: tools.map((t) => t.name),
      codemodeDescriptionBytes: Buffer.byteLength(
        tools.find((t) => t.name === "codemode")?.description ?? "",
      ),
      note: "Deterministic real-SDK provider fixture; bytes only, no live reasoning/usage/cost claims; excludes optional ask/todo declarations",
    };
  } finally {
    await h.close();
  }
}
console.log(
  JSON.stringify(
    { before: await fixture(false), after: await fixture(true) },
    null,
    2,
  ),
);
