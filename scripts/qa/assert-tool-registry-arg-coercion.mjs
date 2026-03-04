import assert from "node:assert/strict";
import { execSync } from "node:child_process";
import { createRequire } from "node:module";
import { rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { z } = require("zod");
const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDir, "../..");
const tempOutDir = path.join(projectRoot, ".ace-tool", "tmp-tsc-test");

function prepareCompiledArtifacts() {
  rmSync(tempOutDir, { recursive: true, force: true });
  execSync(
    `npx tsc -p tsconfig.json --outDir "${tempOutDir}"`,
    { cwd: projectRoot, stdio: "inherit" },
  );
}

prepareCompiledArtifacts();
const { ToolRegistry } = require(path.join(tempOutDir, "core/tool-registry.js"));

async function shouldCoerceStringArgsToSchemaTypes() {
  const registry = new ToolRegistry();

  registry.registerTool(
    "coercion_probe",
    {
      title: "coercion probe",
      description: "coercion probe",
      inputSchema: {
        includeHierarchy: z.boolean(),
        maxDepth: z.number(),
      },
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(args) }],
    }),
  );

  const result = await registry.execute("coercion_probe", {
    includeHierarchy: "false",
    maxDepth: "3",
  });

  assert.equal(result.includeHierarchy, false);
  assert.equal(result.maxDepth, 3);
  assert.equal(typeof result.includeHierarchy, "boolean");
  assert.equal(typeof result.maxDepth, "number");
}

async function shouldRejectInvalidBooleanString() {
  const registry = new ToolRegistry();

  registry.registerTool(
    "coercion_probe_invalid",
    {
      title: "coercion probe invalid",
      description: "coercion probe invalid",
      inputSchema: {
        includeHierarchy: z.boolean(),
      },
    },
    async (args) => ({
      content: [{ type: "text", text: JSON.stringify(args) }],
    }),
  );

  await assert.rejects(
    () =>
      registry.execute("coercion_probe_invalid", {
        includeHierarchy: "not-boolean",
      }),
    /Validation error/,
  );
}

async function run() {
  await shouldCoerceStringArgsToSchemaTypes();
  await shouldRejectInvalidBooleanString();
  console.log("assert-tool-registry-arg-coercion: ok");
}

run().catch((error) => {
  console.error("assert-tool-registry-arg-coercion: failed");
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  rmSync(tempOutDir, { recursive: true, force: true });
});
