import fs from "node:fs";

const core = fs.readFileSync("source/core/tool-registry.ts", "utf8");
if (core.includes("express") || core.includes("Editor.")) {
  console.error("[FAIL] core depends on adapter/runtime detail");
  process.exit(1);
}
if (core.includes("../adapters") || core.includes("../infra")) {
  console.error("[FAIL] core imports adapters/infra directly");
  process.exit(1);
}

const requiredFiles = [
  "source/adapters/http/http-server.ts",
  "source/adapters/editor/messages.ts",
  "source/infra/config/profile-storage.ts"
];
for (const file of requiredFiles) {
  if (!fs.existsSync(file)) {
    console.error(`[FAIL] missing layered file: ${file}`);
    process.exit(1);
  }
}

const main = fs.readFileSync("source/main.ts", "utf8");
if (!main.includes("./adapters/http/http-server.js")) {
  console.error("[FAIL] main.ts is not using http adapter");
  process.exit(1);
}
if (!main.includes("./adapters/editor/messages.js")) {
  console.error("[FAIL] main.ts is not using editor message adapter");
  process.exit(1);
}

console.log("[PASS] core remains transport-agnostic");
