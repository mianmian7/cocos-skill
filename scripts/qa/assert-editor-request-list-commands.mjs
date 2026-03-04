import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const tempOutDir = path.join(projectRoot, ".ace-tool", "tmp-tsc-editor-request-test");

function prepareCompiledArtifacts() {
  rmSync(tempOutDir, { recursive: true, force: true });
  execSync(
    `npx tsc -p tsconfig.json --outDir "${tempOutDir}"`,
    { cwd: projectRoot, stdio: "inherit" },
  );
}

prepareCompiledArtifacts();
const { ToolRegistry } = require(path.join(tempOutDir, "core/tool-registry.js"));
const { registerEditorRequestTool } = require(path.join(tempOutDir, "skill/tools/editor-request.js"));

async function shouldListCommandsWithoutChannelAndCommand() {
  const registry = new ToolRegistry();
  registerEditorRequestTool(registry);

  const result = await registry.execute("editor_request", {
    listCommands: true,
  });

  assert.equal(result.success, true);
  assert.ok(result.availableCommands);
  assert.ok(Array.isArray(result.channels));
  assert.equal(typeof result.totalCount, "number");
}

async function shouldRejectMissingCommandWhenNotListing() {
  const registry = new ToolRegistry();
  registerEditorRequestTool(registry);

  const result = await registry.execute("editor_request", {
    channel: "scene",
  });

  assert.equal(result.success, false);
  assert.match(result.error, /channel and command are required/i);
}

async function run() {
  await shouldListCommandsWithoutChannelAndCommand();
  await shouldRejectMissingCommandWhenNotListing();
  console.log("assert-editor-request-list-commands: ok");
}

run().catch((error) => {
  console.error("assert-editor-request-list-commands: failed");
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  rmSync(tempOutDir, { recursive: true, force: true });
});
