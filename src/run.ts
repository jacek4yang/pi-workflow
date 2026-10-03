import { mkdtemp, writeFile, readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import {
  getAgentDir,
  type ExtensionAPI,
} from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";

export const runSchema = Type.Object(
  {
    run: Type.Array(Type.String(), { minItems: 1, maxItems: 256 }),
    cwd: Type.Optional(Type.String()),
    project: Type.Optional(Type.String()),
    route: Type.Optional(
      Type.Union([
        Type.Literal("inherit"),
        Type.Literal("direct"),
        Type.Literal("public"),
        Type.Literal("personal"),
      ]),
    ),
    timeout: Type.Optional(Type.Number({ exclusiveMinimum: 0 })),
    lines: Type.Optional(Type.Integer({ minimum: 1, maximum: 2000 })),
  },
  { additionalProperties: false },
);
const proxyKeys = [
  "http_proxy",
  "https_proxy",
  "all_proxy",
  "no_proxy",
  "HTTP_PROXY",
  "HTTPS_PROXY",
  "ALL_PROXY",
  "NO_PROXY",
];
export function quote(s: string): string {
  if (s.includes("\0")) throw new Error("NUL is not a shell argument");
  return "'" + s.replaceAll("'", "'\\''") + "'";
}
export function command(
  run: string[],
  cwd: string,
  route = "inherit",
  proxy?: string,
): string {
  if (!run.length || !run[0] || run[0].startsWith("-") || run[0].includes("="))
    throw new Error("Expected executable and literal arguments");
  let prefix = "";
  if (route !== "inherit") {
    if (!["direct", "public", "personal"].includes(route))
      throw new Error("Unknown route");
    prefix = "env " + proxyKeys.map((k) => "-u " + k).join(" ") + " ";
    if (route !== "direct") {
      if (!proxy)
        throw new Error(
          `Configure routes.${route} in ${join(getAgentDir(), "workflow.json")}`,
        );
      const url = new URL(proxy);
      if (
        !["http:", "https:", "socks5:", "socks5h:"].includes(url.protocol) ||
        url.username ||
        url.password ||
        url.search ||
        url.hash
      )
        throw new Error("Route must be a credential-free proxy URL");
      prefix +=
        [
          "HTTP_PROXY",
          "HTTPS_PROXY",
          "ALL_PROXY",
          "http_proxy",
          "https_proxy",
          "all_proxy",
        ]
          .map((k) => quote(k + "=" + proxy))
          .join(" ") + " ";
    }
  }
  return "cd -- " + quote(cwd) + " && " + prefix + run.map(quote).join(" ");
}
interface Config {
  routes?: Record<string, string>;
  projects?: Record<
    string,
    { cwd: string; python?: string; env?: Record<string, string> }
  >;
}
export function registerRun(pi: ExtensionAPI) {
  pi.registerTool({
    name: "workflow",
    label: "workflow",
    description:
      "Run literal argv with optional cwd and network route; no shell expansion. Git/gh/uv/python/cargo use their ordinary CLI arguments. Inherit environment by default; route/project names from agent workflow.json (project sets cwd/env and optional python executable). Returns exit_code and bounded output (80 lines); clipped logs retained. No automatic retry/install/commit.",
    parameters: runSchema,
    outputSchema: Type.Object(
      {
        output: Type.String(),
        exit_code: Type.Optional(Type.Number()),
        truncated: Type.Boolean(),
        full_output_path: Type.Optional(Type.String()),
      },
      { additionalProperties: true },
    ),
    async execute(_id, args, signal, _update, ctx) {
      // Delegate through Pi: bash-name permission hooks see the exact generated command.
      if (process.platform === "win32")
        throw new Error(
          "workflow argv requires POSIX shell; use native bash/powershell on Windows",
        );
      signal?.throwIfAborted();
      let proxy: string | undefined;
      let cwd = resolve(ctx.cwd, args.cwd ?? ".");
      let run = [...args.run];
      command(run, cwd); // Validate executable before optional env prefix.
      if (args.project && args.cwd)
        throw new Error("Choose project or cwd, not both");
      if (
        args.project ||
        args.route === "public" ||
        args.route === "personal"
      ) {
        const config: Config = JSON.parse(
          await readFile(join(getAgentDir(), "workflow.json"), "utf8"),
        );
        if (args.route === "public" || args.route === "personal") {
          proxy = config.routes?.[args.route];
          if (typeof proxy !== "string")
            throw new Error("Missing configured proxy route");
        }
        if (args.project) {
          const project = Object.hasOwn(config.projects ?? {}, args.project)
            ? config.projects?.[args.project]
            : undefined;
          if (
            !project ||
            typeof project.cwd !== "string" ||
            !project.cwd.startsWith("/")
          )
            throw new Error("Unknown project or non-absolute project cwd");
          cwd = project.cwd;
          if (run[0] === "python" && project.python)
            run[0] = resolve(cwd, project.python);
          const env = Object.entries(project.env ?? {});
          for (const [k, v] of env)
            if (
              !/^[A-Za-z_][A-Za-z_0-9]*$/.test(k) ||
              typeof v !== "string" ||
              proxyKeys.includes(k)
            )
              throw new Error(
                "Invalid project environment; use route for proxies",
              );
          if (env.length)
            run = ["env", ...env.map(([k, v]) => k + "=" + v), ...run];
        }
      }
      const outcome = await ctx.executeTool(
        "bash",
        {
          command: command(run, cwd, args.route, proxy),
          ...(args.timeout === undefined ? {} : { timeout: args.timeout }),
        },
        { signal },
      );
      const result = outcome.result;
      const structured = result.structuredContent as
        | {
            output?: unknown;
            exit_code?: number;
            truncated?: boolean;
            full_output_path?: string;
            wall_time_seconds?: number;
          }
        | undefined;
      if (!structured || typeof structured.output !== "string")
        return { ...result, isError: outcome.isError };
      const original = structured.output;
      const tail = original
        .split("\n")
        .slice(-(args.lines ?? 80))
        .join("\n")
        .slice(-16000);
      const clipped = tail !== original;
      let path = structured.full_output_path;
      if (clipped && !path) {
        const dir = await mkdtemp(join(tmpdir(), "pi-workflow-"));
        path = join(dir, "output.log");
        await writeFile(path, original, { mode: 0o600 });
      }
      const output = {
        ...structured,
        output: tail,
        truncated: !!structured.truncated || clipped,
        ...(path ? { full_output_path: path } : {}),
      };
      return {
        content: [{ type: "text" as const, text: JSON.stringify(output) }],
        details: { exit_code: output.exit_code, full_output_path: path },
        structuredContent: output,
        isError: outcome.isError,
      };
    },
  });
}
