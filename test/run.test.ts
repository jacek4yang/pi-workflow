import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { command } from "../src/run.js";
import { harness, textOf } from "./harness.js";

test("argv quotes untrusted values; routes are scoped, explicit and credential-free", () => {
  assert.match(
    command(["printf", "$(touch bad)'"], "/tmp/a b"),
    /'\$\(touch bad\)'/,
  );
  assert.throws(() => command(["-x"], "."));
  assert.throws(() => command(["echo", "\0"], "."));
  assert.throws(() => command(["gh"], ".", "personal"));
  assert.throws(() =>
    command(["gh"], ".", "personal", "http://user:secret@localhost"),
  );
  assert.match(
    command(["gh"], ".", "personal", "http://127.0.0.1:10808"),
    /HTTPS_PROXY=http/,
  );
  assert.match(command(["true"], ".", "direct"), /env -u http_proxy/);
  assert.doesNotMatch(command(["true"], "."), /env/);
});
test(
  "workflow delegates policy-visible bash; literal args, cwd, log and failure semantics",
  { skip: process.platform === "win32" },
  async () => {
    const observed: string[] = [];
    const h = await harness({
      factories: [
        (pi) => {
          pi.on("tool_call", (e) => {
            if (e.toolName === "bash") {
              observed.push(String(e.input.command));
              if (String(e.input.command).includes("deny-fixture"))
                return { block: true, reason: "fixture denied" };
            }
          });
        },
      ],
    });
    try {
      const s = await h.make();
      const call = (args: object) => h.call(s, args, "workflow");
      const literal = "$(touch injected); 'quoted'";
      const ok = await call({
        run: ["printf", "%s", literal],
        cwd: h.dir,
        route: "direct",
      });
      assert.equal(ok.isError, false, textOf(ok));
      assert.equal(JSON.parse(textOf(ok)).output, literal);
      assert(!existsSync(join(h.dir, "injected")));
      const pwd = await call({ run: ["pwd"], cwd: h.dir });
      assert.equal(JSON.parse(textOf(pwd)).output.trim(), h.dir);
      const fail = await call({ run: ["sh", "-c", "printf failure; exit 17"] });
      assert.equal(fail.isError, true);
      assert.equal(JSON.parse(textOf(fail)).exit_code, 17);
      const denied = await call({ run: ["printf", "deny-fixture"] });
      assert.equal(denied.isError, true);
      assert.match(textOf(denied), /fixture denied/);
      const long = await call({
        run: ["node", "-e", "console.log('data\\n'.repeat(100))"],
        lines: 3,
      });
      const output = JSON.parse(textOf(long));
      assert.equal(output.truncated, true);
      assert(
        readFileSync(output.full_output_path, "utf8").length >
          output.output.length,
      );
      const nested = await h.call(s, {
        action: "exec",
        source: 'return tools.workflow({run:["printf","nested"]});',
      });
      assert.equal(nested.isError, false, textOf(nested));
      assert.match(textOf(nested), /nested/);
      assert.equal(observed.length, 6);
      const oldHome = process.env.PI_CODING_AGENT_DIR;
      process.env.PI_CODING_AGENT_DIR = h.dir;
      try {
        writeFileSync(
          join(h.dir, "workflow.json"),
          JSON.stringify({
            projects: {
              fixture: {
                cwd: h.dir,
                python: process.execPath,
                env: { WORKFLOW_FIXTURE: "space ' quote" },
              },
            },
          }),
        );
        const project = await call({
          project: "fixture",
          run: ["python", "-e", "console.log(process.env.WORKFLOW_FIXTURE)"],
        });
        assert.equal(project.isError, false, textOf(project));
        assert.equal(
          JSON.parse(textOf(project)).output.trim(),
          "space ' quote",
        );
        assert.equal(
          (await call({ project: "missing", run: ["pwd"] })).isError,
          true,
        );
        assert.equal(
          (await call({ project: "fixture", cwd: h.dir, run: ["pwd"] }))
            .isError,
          true,
        );
      } finally {
        if (oldHome === undefined) delete process.env.PI_CODING_AGENT_DIR;
        else process.env.PI_CODING_AGENT_DIR = oldHome;
      }
    } finally {
      await h.close();
    }
  },
);
