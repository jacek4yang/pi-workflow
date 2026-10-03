import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { Text } from "@earendil-works/pi-tui";
import { Type } from "typebox";
import { schema, prepare } from "./src/schema.js";
import { edit } from "./src/edit.js";
import { registerRun } from "./src/run.js";
export default function workflow(pi: ExtensionAPI) {
  registerRun(pi);
  pi.registerTool({
    name: "edit",
    label: "edit",
    description:
      "Strict single-file edits: replace edits[{old,replacement,count?}], range edits[{start,end,text}] with base SHA-256 (UTF-16), or apply_patch patch (one matching Update File). snapshot returns base/units and optional offset/limit text. No fuzzy matching.",
    promptSnippet:
      "Edit existing files using exact replace, guarded ranges or strict local Codex patches",
    promptGuidelines: [
      "Use edit for existing-file changes; write only for new files or intentional complete rewrites. Choose the smallest suitable edit format; respect stale-base failures.",
    ],
    parameters: schema,
    prepareArguments: prepare,
    renderCall(args) {
      return new Text("edit " + args.path + " [" + args.format + "]", 0, 0);
    },
    renderResult(result, { expanded }) {
      const content = result.content
        .filter((c) => c.type === "text")
        .map((c) => c.text)
        .join("\n");
      return new Text(
        content +
          (expanded && result.details
            ? "\n" + JSON.stringify(result.details)
            : ""),
        0,
        0,
      );
    },
    outputSchema: Type.Object(
      { status: Type.String(), path: Type.String(), base: Type.String() },
      { additionalProperties: true },
    ),
    async execute(_id, args, signal, _update, ctx) {
      return edit(args, ctx.cwd, signal);
    },
  });
}
