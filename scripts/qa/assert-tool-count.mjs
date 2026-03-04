import fs from "node:fs";

const text = fs.readFileSync("source/http/http-tool-server.ts", "utf8");
const registerCalls = (text.match(/register[A-Za-z]+Tool\(/g) || []).length;
if (registerCalls < 19) {
  console.error(`[FAIL] registered tools < 19, actual=${registerCalls}`);
  process.exit(1);
}
console.log("[PASS] 19 tools kept with skill path");
