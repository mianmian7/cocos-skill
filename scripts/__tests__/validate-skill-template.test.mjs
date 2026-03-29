import test from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "child_process";
import fs from "fs";
import os from "os";
import path from "path";
import { fileURLToPath, pathToFileURL } from "url";

import { validateSkillTemplateDirectory } from "../qa/validate-skill-template.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateDir = path.join(repoRoot, "static", "skill-template", "cocos-skill");
const validatorModuleUrl = pathToFileURL(path.join(repoRoot, "scripts", "qa", "validate-skill-template.mjs")).href;

function copyTemplateFixture() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-template-qa-"));
  fs.cpSync(templateDir, tempDir, { recursive: true });
  return tempDir;
}

function replaceOrThrow(filePath, searchValue, replaceValue) {
  const original = fs.readFileSync(filePath, "utf8");
  const updated = original.replace(searchValue, replaceValue);

  assert.notEqual(updated, original, `Expected fixture mutation to change ${path.basename(filePath)}`);
  fs.writeFileSync(filePath, updated);
}

test("importing validate-skill-template module should not run CLI output", () => {
  const result = spawnSync(
    process.execPath,
    ["--input-type=module", "--eval", `import ${JSON.stringify(validatorModuleUrl)};`],
    { cwd: repoRoot, encoding: "utf8" },
  );

  assert.equal(result.status, 0);
  assert.equal(result.stdout.trim(), "");
  assert.equal(result.stderr.trim(), "");
});

test("validateSkillTemplateDirectory should fail when SKILL.md no longer references PROGRAM.md", () => {
  const fixtureDir = copyTemplateFixture();
  const skillFile = path.join(fixtureDir, "SKILL.md");

  replaceOrThrow(
    skillFile,
    /`PROGRAM\.md`/g,
    "`REMOVED_PROGRAM.md`",
  );

  const errors = validateSkillTemplateDirectory(fixtureDir);

  assert.ok(errors.includes("SKILL.md must reference `PROGRAM.md` for large live-editor tasks"));
});

test("validateSkillTemplateDirectory should fail when SKILL.md no longer references RUN_LEDGER.md", () => {
  const fixtureDir = copyTemplateFixture();
  const skillFile = path.join(fixtureDir, "SKILL.md");

  replaceOrThrow(
    skillFile,
    /`RUN_LEDGER\.md`/g,
    "`REMOVED_RUN_LEDGER.md`",
  );

  const errors = validateSkillTemplateDirectory(fixtureDir);

  assert.ok(errors.includes("SKILL.md must reference `RUN_LEDGER.md` for multi-attempt live tasks"));
});

test("validateSkillTemplateDirectory should fail when PROGRAM.md no longer references RUN_LEDGER.md", () => {
  const fixtureDir = copyTemplateFixture();
  const programFile = path.join(fixtureDir, "PROGRAM.md");

  replaceOrThrow(
    programFile,
    /`RUN_LEDGER\.md`/g,
    "`REMOVED_RUN_LEDGER.md`",
  );

  const errors = validateSkillTemplateDirectory(fixtureDir);

  assert.ok(errors.includes("PROGRAM.md must reference `RUN_LEDGER.md` for multi-attempt tracking"));
});
