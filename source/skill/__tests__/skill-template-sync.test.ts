import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ensureManagedExperienceBlock,
  EXPERIENCE_BLOCK_END,
  EXPERIENCE_BLOCK_START,
  extractManagedExperienceBlock,
  syncSkillTemplateFile,
} from "../skill-template-sync.js";

const SOURCE_BLOCK = [
  EXPERIENCE_BLOCK_START,
  "## 经验沉淀",
  "",
  "新模板内容",
  EXPERIENCE_BLOCK_END,
].join("\n");

test("extractManagedExperienceBlock should return the managed block from template content", () => {
  const content = `# Skill\n\n${SOURCE_BLOCK}\n`;

  assert.equal(extractManagedExperienceBlock(content), SOURCE_BLOCK);
});

test("ensureManagedExperienceBlock should append the managed block when target content has no block", () => {
  const target = "# Existing Skill\n\nOriginal content.\n";
  const updated = ensureManagedExperienceBlock(target, SOURCE_BLOCK);

  assert.equal(updated.changed, true);
  assert.match(updated.content, /Original content\./);
  assert.match(updated.content, /## 经验沉淀/);
});

test("syncSkillTemplateFile should replace only the managed block for an existing SKILL file", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-SKILL.md");
  const targetPath = path.join(tempDir, "target-SKILL.md");

  fs.writeFileSync(sourcePath, `# Source Skill\n\n${SOURCE_BLOCK}\n`, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "# Target Skill",
      "",
      "Keep user content.",
      "",
      EXPERIENCE_BLOCK_START,
      "## 经验沉淀",
      "",
      "旧模板内容",
      EXPERIENCE_BLOCK_END,
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncSkillTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Keep user content\./);
  assert.match(synced, /新模板内容/);
  assert.doesNotMatch(synced, /旧模板内容/);
});
