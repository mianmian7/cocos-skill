import test from "node:test";
import assert from "node:assert/strict";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const templateDir = path.join(repoRoot, "static", "skill-template", "cocos-skill");
const skillFile = path.join(templateDir, "SKILL.md");
const workflowsFile = path.join(templateDir, "references", "00-workflows.md");
const matrixRelativePath = "references/12-acceptance-matrix.md";
const matrixFile = path.join(templateDir, matrixRelativePath);

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

test("workflow acceptance matrix reference should exist", () => {
  assert.equal(fs.existsSync(matrixFile), true);
});

test("SKILL.md should route verification guidance to the acceptance matrix reference", () => {
  assert.match(read(skillFile), new RegExp(`\`${matrixRelativePath}\``));
});

test("00-workflows should route readback choices to the acceptance matrix reference", () => {
  assert.match(read(workflowsFile), new RegExp(`\`${matrixRelativePath}\``));
});

test("workflow acceptance matrix should cover node, component, asset, and scene readbacks", () => {
  const matrix = read(matrixFile);

  assert.match(matrix, /^## Nodes$/m);
  assert.match(matrix, /^## Components$/m);
  assert.match(matrix, /^## Assets$/m);
  assert.match(matrix, /^## Scenes$/m);
});
