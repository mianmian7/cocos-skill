import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import os from "os";
import path from "path";

import { cleanDistDirectory } from "../clean-dist.mjs";

test("cleanDistDirectory should remove stale files inside dist and recreate the directory", async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-clean-dist-"));
  const distDir = path.join(tempRoot, "dist");
  const nestedDir = path.join(distDir, "nested");

  fs.mkdirSync(nestedDir, { recursive: true });
  fs.writeFileSync(path.join(distDir, "old.js"), "stale");
  fs.writeFileSync(path.join(nestedDir, "old.txt"), "stale");

  await cleanDistDirectory(tempRoot);

  assert.equal(fs.existsSync(distDir), true);
  assert.deepEqual(fs.readdirSync(distDir), []);
});
