import assert from "node:assert/strict";
import { resolve } from "node:path";
import { SessionManager } from "@earendil-works/pi-coding-agent";
import { harness, textOf, jsonOf } from "../test/harness.js";

// Explicit local extension paths: no provider credentials, real SDK + HTTP fixture.
const companions = JSON.parse(
  process.env.PI_WORKFLOW_COMPANIONS ?? "[]",
) as string[];
assert(
  companions.length >= 2,
  "Pass ask/todo (and optionally other extensions) in PI_WORKFLOW_COMPANIONS",
);
const h = await harness({
  paths: [
    process.env.PI_WORKFLOW_TEST_EXTENSION ?? resolve("index.ts"),
    ...companions,
  ],
  hideRaw: true,
});
try {
  let s = await h.make();
  const created = await h.call(
    s,
    {
      action: "create",
      subject: "Verify stack",
      description: "Checkpoint: SDK fixture only; next verify restart",
      metadata: { checkpoint: "deterministic fixture; no hidden reasoning" },
    },
    "todo",
  );
  assert.equal(created.isError, false, textOf(created));
  assert.match(textOf(created), /Verify stack/);
  const rejected = await h.call(
    s,
    {
      questions: [
        {
          question: "Fixture only?",
          header: "Fixture",
          options: [
            { label: "Yes", description: "yes" },
            { label: "No", description: "no" },
          ],
        },
      ],
    },
    "ask_user_question",
  );
  assert.equal(rejected.isError, true);
  assert.match(textOf(rejected), /not found/); // Upstream intentionally hides ask without UI.
  const failed = await h.call(s, {
    code: 'return tools.workflow({run:["printf","stack-ok"]});(',
  });
  assert.equal(failed.isError, true);
  const m = jsonOf(failed);
  const repaired = await h.call(s, {
    action: "repair",
    ref: m.ref,
    base: m.base,
    edit: { format: "replace", edits: [{ old: ";(", replacement: ";" }] },
  });
  assert.equal(repaired.isError, false, textOf(repaired));
  assert.match(textOf(repaired), /stack-ok/);
  const file = s.sessionManager.getSessionFile()!;
  await s.reload();
  let listed = await h.call(s, { action: "list" }, "todo");
  assert.match(textOf(listed), /Verify stack/);
  s.dispose();
  s = await h.make(SessionManager.open(file));
  listed = await h.call(s, { action: "list" }, "todo");
  assert.match(textOf(listed), /Verify stack/);
  const tools = h.payloads.at(-1)!.tools as { name: string }[];
  for (const name of [
    "edit",
    "write",
    "read",
    "bash",
    "workflow",
    "codebuffer",
    "todo",
  ])
    assert.equal(tools.filter((t) => t.name === name).length, 1, name);
  assert(!tools.some((t) => t.name === "codemode"));
  assert(!tools.some((t) => t.name === "ask_user_question"));
  console.log(
    JSON.stringify({
      pass: true,
      tools: tools.map((t) => t.name),
      toolBytes: Buffer.byteLength(JSON.stringify(tools)),
      requests: h.payloads.length,
      todoSurvivesReloadAndRestart: true,
      headlessQuestionRejected: true,
    }),
  );
} finally {
  await h.close();
}
