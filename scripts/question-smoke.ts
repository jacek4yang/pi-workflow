import assert from "node:assert/strict";
import { resolve } from "node:path";
import type { ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { harness, textOf } from "../test/harness.js";
const path = process.env.PI_ASK_EXTENSION;
assert(path, "PI_ASK_EXTENSION required");
let dialogs = 0;
// Public UI boundary fixture, not a claim of visual terminal inspection.
const ui = new Proxy(
  {},
  {
    get: (_t, key) => {
      if (key === "custom") return async () => undefined; // exercise supported RPC backstop
      if (key === "select")
        return async (_title: string, options: string[]) => {
          dialogs++;
          return options[0];
        };
      if (key === "input") return async () => "fixture answer";
      if (key === "onTerminalInput") return () => () => {};
      if (key === "theme")
        return { fg: (_color: string, text: string) => text };
      return () => {};
    },
  },
) as ExtensionUIContext;
const h = await harness({
  paths: [resolve("index.ts"), path],
  uiContext: ui,
  hideRaw: true,
});
try {
  const s = await h.make();
  const result = await h.call(
    s,
    {
      questions: [
        {
          question: "Select fixture?",
          header: "Fixture",
          options: [
            { label: "Yes", description: "Proceed with fixture" },
            { label: "No", description: "Decline fixture" },
          ],
        },
      ],
    },
    "ask_user_question",
  );
  assert.equal(result.isError, false, textOf(result));
  assert.match(textOf(result), /Yes/);
  assert(dialogs > 0);
  const tools = h.payloads.at(-1)!.tools as { name: string }[];
  assert.equal(tools.filter((t) => t.name === "ask_user_question").length, 1);
  console.log(
    JSON.stringify({
      pass: true,
      dialogs,
      askToolDeclaredOnce: true,
      uiBoundary: "public SDK dialog fixture (not visual inspection)",
    }),
  );
} finally {
  await h.close();
}
