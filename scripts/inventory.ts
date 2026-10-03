import {
  createAgentSession,
  SessionManager,
  DefaultResourceLoader,
  SettingsManager,
  getAgentDir,
  createCodemodeExtension,
} from "@earendil-works/pi-coding-agent";
import { writeFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
const cwd = mkdtempSync(join(tmpdir(), "workflow-inventory-"));
try {
  const settings = SettingsManager.create(cwd);
  const loader = new DefaultResourceLoader({
    cwd,
    agentDir: getAgentDir(),
    settingsManager: settings,
    extensionFactories: [createCodemodeExtension({})],
  });
  await loader.reload();
  const { session, extensionsResult } = await createAgentSession({
    cwd,
    resourceLoader: loader,
    settingsManager: settings,
    sessionManager: SessionManager.inMemory(cwd),
  });
  await session.bindExtensions({
    onError: (e) => {
      throw Error(e.error);
    },
  });
  const tools = session.agent.state.tools;
  const result = {
    active: session.getActiveToolNames(),
    systemBytes: Buffer.byteLength(session.systemPrompt),
    toolBytes: Buffer.byteLength(JSON.stringify(tools)),
    tools: tools.map((t) => ({
      name: t.name,
      bytes: Buffer.byteLength(JSON.stringify(t)),
      descriptionBytes: Buffer.byteLength(t.description ?? ""),
    })),
    errors: extensionsResult.errors,
  };
  writeFileSync(process.argv[2]!, JSON.stringify(result, null, 2));
  console.log(JSON.stringify(result));
  session.dispose();
} finally {
  rmSync(cwd, { recursive: true, force: true });
}
