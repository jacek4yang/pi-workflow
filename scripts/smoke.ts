import { mkdtempSync, writeFileSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
const home = mkdtempSync(join(tmpdir(), "workflow-install-"));
function run(command: string, args: string[], cwd: string, env = process.env) {
  const r = spawnSync(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell: process.platform === "win32",
  });
  if (r.status !== 0) throw Error(command + " exit " + r.status);
}
try {
  writeFileSync(
    join(home, "package.json"),
    JSON.stringify({ private: true, type: "module" }),
  );
  run(
    "npm",
    [
      "install",
      "--ignore-scripts",
      "--allow-git=all",
      resolve(
        process.argv[2] ??
          `pi-workflow-${JSON.parse(readFileSync("package.json", "utf8")).version}.tgz`,
      ),
      "@earendil-works/pi-coding-agent@1.0.0",
      "typebox@1.3.27",
    ],
    home,
  );
  for (const file of ["index.ts", "src/run.ts"]) {
    if (
      readFileSync(join(home, "node_modules/pi-workflow", file), "utf8") !==
      readFileSync(file, "utf8")
    )
      throw new Error(`Stale tarball: ${file}; run npm pack again`);
  }
  run(
    "node",
    ["--import", "tsx", "--test", "test/sdk.test.ts", "test/run.test.ts"],
    process.cwd(),
    {
      ...process.env,
      PI_WORKFLOW_TEST_EXTENSION: join(
        home,
        "node_modules/pi-workflow/index.ts",
      ),
    },
  );
  console.log("packaged tool replacement passed");
} finally {
  rmSync(home, { recursive: true, force: true });
}
