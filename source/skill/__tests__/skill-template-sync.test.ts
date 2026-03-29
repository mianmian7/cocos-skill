import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  LOCAL_NOTES_BLOCK_END,
  LOCAL_NOTES_BLOCK_START,
  LOCAL_NOTES_USER_BLOCK_END,
  LOCAL_NOTES_USER_BLOCK_START,
  MANAGED_BODY_BLOCK_END,
  MANAGED_BODY_BLOCK_START,
  syncTemplateDirectory,
  syncTemplateFile,
  syncSkillTemplateFile,
} from "../skill-template-sync.js";
const SOURCE_SKILL = [
  "---",
  "name: cocos-skill",
  "description: Use when editing a Cocos Creator project through cocos-skill HTTP APIs.",
  "---",
  "",
  MANAGED_BODY_BLOCK_START,
  "# Cocos Skill",
  "",
  "新模板主体内容。",
  MANAGED_BODY_BLOCK_END,
  "",
  LOCAL_NOTES_BLOCK_START,
  "## Project Notes",
  "",
  "This section is preserved during template sync.",
  "",
  LOCAL_NOTES_USER_BLOCK_START,
  "- Add project-specific notes here.",
  LOCAL_NOTES_USER_BLOCK_END,
  LOCAL_NOTES_BLOCK_END,
  "",
].join("\n");
const LEGACY_EXPERIENCE_BLOCK_START = "<!-- cocos-skill:experience:start -->";
const LEGACY_EXPERIENCE_BLOCK_END = "<!-- cocos-skill:experience:end -->";
const LEGACY_EXPERIENCE_TEMPLATE_BODY = [
  "## Experience Capture",
  "",
  "Capture reusable, verified lessons from development, review, debugging, and validation.",
  "",
  "- Keep short rules here; move long rationale, commands, and examples to `references/12-experience-capture.md`.",
  "- Use this schema: `Title`, `Signal`, `Root Cause / Constraints`, `Correct Approach`, `Verification`, `Scope`.",
  "- Skip guesses, one-off noise, and branch-local details.",
].join("\n");
const EXPERIENCE_CAPTURE_USER_BLOCK_START = "<!-- cocos-skill:experience-capture:user:start -->";
const EXPERIENCE_CAPTURE_USER_BLOCK_END = "<!-- cocos-skill:experience-capture:user:end -->";
const PROGRAM_USER_BLOCK_START = "<!-- cocos-skill:program:user:start -->";
const PROGRAM_USER_BLOCK_END = "<!-- cocos-skill:program:user:end -->";
const RUN_LEDGER_USER_BLOCK_START = "<!-- cocos-skill:run-ledger:user:start -->";
const RUN_LEDGER_USER_BLOCK_END = "<!-- cocos-skill:run-ledger:user:end -->";
const SOURCE_EXPERIENCE_CAPTURE = [
  "# 12 — Experience Capture",
  "",
  "Bundled shell v2.",
  "",
  "## Maintenance",
  "",
  "- Append incrementally inside the preserved user block; do not rewrite unrelated lessons.",
  "",
  EXPERIENCE_CAPTURE_USER_BLOCK_START,
  "### Add a lesson here.",
  EXPERIENCE_CAPTURE_USER_BLOCK_END,
  "",
].join("\n");
const LEGACY_EXPERIENCE_CAPTURE = SOURCE_EXPERIENCE_CAPTURE
  .replace(
    [
      EXPERIENCE_CAPTURE_USER_BLOCK_START,
      "### Add a lesson here.",
      EXPERIENCE_CAPTURE_USER_BLOCK_END,
      "",
    ].join("\n"),
    "",
  )
  .trimEnd()
  .concat("\n");
const SOURCE_PROGRAM = [
  "# Cocos Skill Program",
  "",
  "Bundled program shell v2.",
  "",
  "## Project Workflow Overrides",
  "",
  "Keep project-specific workflow rules inside the user block below.",
  "",
  PROGRAM_USER_BLOCK_START,
  "## Baseline",
  "",
  "- Record the first live readback before mutating anything.",
  PROGRAM_USER_BLOCK_END,
  "",
].join("\n");
const SOURCE_RUN_LEDGER = [
  "# Cocos Skill Run Ledger",
  "",
  "Bundled run ledger shell v1.",
  "",
  "## Attempts",
  "",
  "Use this file to track baseline, attempts, verification, and decisions for one live-editor task.",
  "",
  RUN_LEDGER_USER_BLOCK_START,
  "## Run Context",
  "",
  "- Task:",
  RUN_LEDGER_USER_BLOCK_END,
  "",
].join("\n");
test("syncSkillTemplateFile should migrate a legacy SKILL file to the latest managed template body", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source", "SKILL.md");
  const targetPath = path.join(tempDir, "target", "SKILL.md");

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(sourcePath, SOURCE_SKILL, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "---",
      "name: cocos-skill",
      "description: Old description.",
      "---",
      "",
      "# Old Skill",
      "",
      "旧版主体内容。",
    ].join("\n"),
    "utf8",
  );

  const result = syncSkillTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Use when editing a Cocos Creator project/);
  assert.match(synced, /新模板主体内容/);
  assert.match(synced, new RegExp(MANAGED_BODY_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.match(synced, new RegExp(LOCAL_NOTES_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(synced, /旧版主体内容/);
});
test("syncSkillTemplateFile should preserve local notes while refreshing the managed body", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source", "SKILL.md");
  const targetPath = path.join(tempDir, "target", "SKILL.md");

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(sourcePath, SOURCE_SKILL, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "---",
      "name: cocos-skill",
      "description: Old description.",
      "---",
      "",
      MANAGED_BODY_BLOCK_START,
      "# Cocos Skill",
      "",
      "旧模板主体内容。",
      MANAGED_BODY_BLOCK_END,
      "",
      LOCAL_NOTES_BLOCK_START,
      "## Project Notes",
      "",
      "Old shell text.",
      "",
      LOCAL_NOTES_USER_BLOCK_START,
      "- 项目自己的备注要保留。",
      LOCAL_NOTES_USER_BLOCK_END,
      LOCAL_NOTES_BLOCK_END,
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncSkillTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /新模板主体内容/);
  assert.match(synced, /This section is preserved during template sync/);
  assert.match(synced, /项目自己的备注要保留/);
  assert.doesNotMatch(synced, /旧模板主体内容/);
  assert.doesNotMatch(synced, /Old shell text/);
});
test("syncSkillTemplateFile should migrate legacy experience notes into the local-notes user block", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source", "SKILL.md");
  const targetPath = path.join(tempDir, "target", "SKILL.md");

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(sourcePath, SOURCE_SKILL, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "---",
      "name: cocos-skill",
      "description: Old description.",
      "---",
      "",
      "# Old Skill",
      "",
      "旧版主体内容。",
      "",
      LEGACY_EXPERIENCE_BLOCK_START,
      LEGACY_EXPERIENCE_TEMPLATE_BODY,
      "",
      "- 场景切换前先 `query-dirty`，脏场景先保存。",
      LEGACY_EXPERIENCE_BLOCK_END,
      "",
      "### Extra Lesson",
      "",
      "长备注也要保留。",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncSkillTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /query-dirty/);
  assert.match(synced, /长备注也要保留/);
  assert.match(synced, new RegExp(LOCAL_NOTES_USER_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(synced, /cocos-skill:experience:start/);
  assert.doesNotMatch(synced, /Keep short rules here/);
});
test("syncTemplateFile should overwrite non-SKILL template files when bundled content changes", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-reference.md");
  const targetPath = path.join(tempDir, "target-reference.md");

  fs.writeFileSync(sourcePath, "# Routed Reference\n\nnew bundled content\n", "utf8");
  fs.writeFileSync(targetPath, "# Routed Reference\n\nold copied content\n", "utf8");

  const result = syncTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /new bundled content/);
  assert.doesNotMatch(synced, /old copied content/);
});
test("syncTemplateFile should preserve the experience-capture user block while refreshing bundled shell text", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-reference.md");
  const targetPath = path.join(tempDir, "target-reference.md");

  fs.writeFileSync(sourcePath, SOURCE_EXPERIENCE_CAPTURE, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "# 12 — Experience Capture",
      "",
      "Old shell text.",
      "",
      EXPERIENCE_CAPTURE_USER_BLOCK_START,
      "### Live project lesson",
      "",
      "Preserve this note.",
      EXPERIENCE_CAPTURE_USER_BLOCK_END,
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Bundled shell v2/);
  assert.match(synced, /Preserve this note/);
  assert.doesNotMatch(synced, /Old shell text/);
});
test("syncTemplateFile should migrate legacy appended experience-capture lessons into the new user block", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-reference.md");
  const targetPath = path.join(tempDir, "target-reference.md");

  fs.writeFileSync(sourcePath, SOURCE_EXPERIENCE_CAPTURE, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      LEGACY_EXPERIENCE_CAPTURE.trimEnd(),
      "",
      "### Scene Save Order",
      "",
      "Always save before switching scenes in this project.",
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Scene Save Order/);
  assert.match(synced, /Always save before switching scenes/);
  assert.match(synced, new RegExp(EXPERIENCE_CAPTURE_USER_BLOCK_START.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("syncSkillTemplateFile should refresh the local-notes shell while keeping the default user slot", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source", "SKILL.md");
  const targetPath = path.join(tempDir, "target", "SKILL.md");

  fs.mkdirSync(path.dirname(sourcePath), { recursive: true });
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(sourcePath, SOURCE_SKILL, "utf8");
  fs.writeFileSync(
    targetPath,
    SOURCE_SKILL.replace(
      "This section is preserved during template sync.",
      "Old shell text.",
    ),
    "utf8",
  );

  const result = syncSkillTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /This section is preserved during template sync/);
  assert.match(synced, /Add project-specific notes here/);
  assert.doesNotMatch(synced, /Old shell text/);
  assert.match(synced, new RegExp(LOCAL_NOTES_BLOCK_END.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
test("syncTemplateFile should preserve the program user block while refreshing bundled program shell text", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-program.md");
  const targetPath = path.join(tempDir, "target-program.md");

  fs.writeFileSync(sourcePath, SOURCE_PROGRAM, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "# Cocos Skill Program",
      "",
      "Old program shell text.",
      "",
      PROGRAM_USER_BLOCK_START,
      "## Verification",
      "",
      "- Re-run query_nodes after every write.",
      PROGRAM_USER_BLOCK_END,
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Bundled program shell v2/);
  assert.match(synced, /Re-run query_nodes after every write/);
  assert.doesNotMatch(synced, /Old program shell text/);
});
test("bundled skill template should route workflow guidance through PROGRAM.md without experience-capture reference", () => {
  const templateDir = path.join(process.cwd(), "static", "skill-template", "cocos-skill");
  const skill = fs.readFileSync(path.join(templateDir, "SKILL.md"), "utf8");
  const workflows = fs.readFileSync(path.join(templateDir, "references", "00-workflows.md"), "utf8");
  const programPath = path.join(templateDir, "PROGRAM.md");
  const experienceCapturePath = path.join(templateDir, "references", "12-experience-capture.md");

  assert.equal(fs.existsSync(programPath), true);
  assert.match(skill, /`PROGRAM\.md`/);
  assert.match(workflows, /`PROGRAM\.md`/);
  assert.doesNotMatch(skill, /references\/12-experience-capture\.md/);
  assert.equal(fs.existsSync(experienceCapturePath), false);
});
test("syncTemplateFile should preserve the run-ledger user block while refreshing bundled ledger shell text", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourcePath = path.join(tempDir, "source-run-ledger.md");
  const targetPath = path.join(tempDir, "target-run-ledger.md");

  fs.writeFileSync(sourcePath, SOURCE_RUN_LEDGER, "utf8");
  fs.writeFileSync(
    targetPath,
    [
      "# Cocos Skill Run Ledger",
      "",
      "Old ledger shell text.",
      "",
      RUN_LEDGER_USER_BLOCK_START,
      "## Attempts",
      "",
      "- Decision: keep",
      RUN_LEDGER_USER_BLOCK_END,
      "",
    ].join("\n"),
    "utf8",
  );

  const result = syncTemplateFile(sourcePath, targetPath);
  const synced = fs.readFileSync(targetPath, "utf8");

  assert.equal(result, "updated");
  assert.match(synced, /Bundled run ledger shell v1/);
  assert.match(synced, /Decision: keep/);
  assert.doesNotMatch(synced, /Old ledger shell text/);
});
test("bundled skill template should expose RUN_LEDGER.md as the live workflow log template", () => {
  const templateDir = path.join(process.cwd(), "static", "skill-template", "cocos-skill");
  const skill = fs.readFileSync(path.join(templateDir, "SKILL.md"), "utf8");
  const program = fs.readFileSync(path.join(templateDir, "PROGRAM.md"), "utf8");
  const runLedgerPath = path.join(templateDir, "RUN_LEDGER.md");

  assert.equal(fs.existsSync(runLedgerPath), true);
  assert.match(skill, /`RUN_LEDGER\.md`/);
  assert.match(program, /`RUN_LEDGER\.md`/);
});
test("syncTemplateDirectory should delete stale bundled files that no longer exist in source", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-sync-"));
  const sourceDir = path.join(tempDir, "source");
  const targetDir = path.join(tempDir, "target");
  const sourceReference = path.join(sourceDir, "references", "00-workflows.md");
  const targetReference = path.join(targetDir, "references", "00-workflows.md");
  const staleReference = path.join(targetDir, "references", "12-experience-capture.md");

  fs.mkdirSync(path.dirname(sourceReference), { recursive: true });
  fs.mkdirSync(path.dirname(targetReference), { recursive: true });
  fs.writeFileSync(path.join(sourceDir, "SKILL.md"), SOURCE_SKILL, "utf8");
  fs.writeFileSync(sourceReference, "# Routed Reference\n\ncurrent bundled file\n", "utf8");
  fs.writeFileSync(path.join(targetDir, "SKILL.md"), SOURCE_SKILL, "utf8");
  fs.writeFileSync(targetReference, "# Routed Reference\n\nold bundled file\n", "utf8");
  fs.writeFileSync(staleReference, "# 12 — Experience Capture\n\nstale bundled file\n", "utf8");

  syncTemplateDirectory(sourceDir, targetDir);

  assert.equal(fs.existsSync(path.join(targetDir, "SKILL.md")), true);
  assert.equal(fs.existsSync(targetReference), true);
  assert.equal(fs.existsSync(staleReference), false);
});
