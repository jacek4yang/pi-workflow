// Opt-in bounded live validation. Output contains aggregate metrics only, never reasoning/auth/source.
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import {
  createAgentSession,
  createCodemodeExtension,
  DefaultResourceLoader,
  getAgentDir,
  SessionManager,
  SettingsManager,
} from "@earendil-works/pi-coding-agent";
if (process.env.PI_WORKFLOW_LIVE !== "1")
  throw Error("PI_WORKFLOW_LIVE=1 required");
const root = await mkdtemp(join(tmpdir(), "workflow-live-"));
await Promise.all([
  writeFile(join(root, "a.txt"), "17\n"),
  writeFile(join(root, "b.txt"), "25\n"),
  writeFile(join(root, "notes.txt"), "status: TODO\nkeep this line\n"),
]);
const calls: Record<string, number> = {};
let codeBytes = 0,
  returnPrograms = 0,
  errors = 0,
  blocked = 0;
const settings = SettingsManager.create(root);
const loader = new DefaultResourceLoader({
  cwd: root,
  agentDir: getAgentDir(),
  settingsManager: settings,
  extensionFactories: [
    createCodemodeExtension(settings.getSettings().codemode),
    (pi) => {
      pi.on("tool_call", (e) => {
        calls[e.toolName] = (calls[e.toolName] ?? 0) + 1;
        const allowed = [
          "read",
          "edit",
          "codebuffer",
          "codemode",
          "workflow",
          "bash",
        ];
        const reject = () => {
          blocked++;
          return {
            block: true,
            reason:
              "Live fixture permits only its three files and printf command",
          };
        };
        if (
          !allowed.includes(e.toolName) ||
          Object.values(calls).reduce((a, b) => a + b, 0) > 20
        )
          return reject();
        if (e.toolName === "read" || e.toolName === "edit") {
          if (
            typeof e.input.path !== "string" ||
            !["a.txt", "b.txt", "notes.txt"].some(
              (p) => resolve(root, p) === resolve(root, String(e.input.path)),
            )
          )
            return reject();
        }
        if (
          e.toolName === "workflow" &&
          JSON.stringify(e.input.run) !==
            JSON.stringify(["printf", "stack-live"])
        )
          return reject();
        if (
          e.toolName === "bash" &&
          e.input.command !== `cd -- '${root}' && 'printf' 'stack-live'`
        )
          return reject();
        if (e.toolName === "codebuffer") {
          codeBytes += Buffer.byteLength(JSON.stringify(e.input));
          const code = e.input.code ?? e.input.source;
          if (typeof code === "string" && /\breturn\b/.test(code))
            returnPrograms++;
        }
      });
    },
  ],
});
let session:
  Awaited<ReturnType<typeof createAgentSession>>["session"] | undefined;
let timer: ReturnType<typeof setTimeout> | undefined;
try {
  await loader.reload();
  assert.deepEqual(loader.getExtensions().errors, []);
  ({ session } = await createAgentSession({
    cwd: root,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: SessionManager.inMemory(root),
  }));
  assert.equal(session.model?.provider, "openai-codex");
  assert.equal(session.model?.id, "gpt-6-astra");
  assert.equal(session.thinkingLevel, "medium");
  await session.bindExtensions({
    onError: (e) => {
      throw Error(e.error);
    },
  });
  session.subscribe((e) => {
    if (e.type === "tool_execution_end" && e.isError) errors++;
  });
  timer = setTimeout(() => {
    void session?.abort();
  }, 180000);
  await session.prompt(
    'Bounded stack smoke only: in one CodeBuffer program read a.txt and b.txt concurrently and report their sum. Change TODO to DONE in notes.txt with enhanced edit, preserving all other text. Run workflow with run ["printf","stack-live"] and no optional fields. Do not access anything outside this fixture, use the network, ask questions, create tasks, or run other commands. Finish with the sum and verification result. Do not intentionally introduce a failure.',
  );
  console.log(
    JSON.stringify({
      diagnostic: true,
      calls,
      errors,
      blocked,
      assistants: session.messages
        .filter((m) => m.role === "assistant")
        .map((m) => ({
          stopReason: m.stopReason,
          errorClass: [
            "auth",
            "unauthorized",
            "proxy",
            "ECONN",
            "429",
            "incomplete",
            "failed",
            "stream",
            "timeout",
            "abort",
            "Unsupported",
            "model",
            "signature",
          ].filter((word) =>
            (m.errorMessage ?? "").toLowerCase().includes(word.toLowerCase()),
          ),
        })),
      answerPresent: !!session.getLastAssistantText(),
    }),
  );
  assert.equal(
    await readFile(join(root, "notes.txt"), "utf8"),
    "status: DONE\nkeep this line\n",
  );
  assert.match(session.getLastAssistantText() ?? "", /42/);
  assert(calls.codebuffer > 0);
  assert(calls.workflow > 0);
  assert.equal(blocked, 0);
  const totals = {
    input: 0,
    output: 0,
    cacheRead: 0,
    cacheWrite: 0,
    totalTokens: 0,
  };
  let responses = 0;
  for (const m of session.messages)
    if (m.role === "assistant") {
      responses++;
      for (const k of Object.keys(totals) as (keyof typeof totals)[])
        totals[k] += m.usage[k] ?? 0;
    }
  console.log(
    JSON.stringify(
      {
        passed: true,
        provider: session.model?.provider,
        model: session.model?.id,
        thinking: session.thinkingLevel,
        calls,
        codeBytes,
        returnPrograms,
        errors,
        blocked,
        responses,
        reportedUsage: totals,
        note: "Single live smoke; not an A/B savings or billing measurement",
      },
      null,
      2,
    ),
  );
} finally {
  if (timer) clearTimeout(timer);
  session?.dispose();
  await rm(root, { recursive: true, force: true });
}
