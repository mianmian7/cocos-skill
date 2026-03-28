#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const skillDir = path.join(root, "static", "skill-template", "cocos-skill");
const skillFile = path.join(skillDir, "SKILL.md");

const requiredMarkers = [
  "<!-- cocos-skill:managed-body:start -->",
  "<!-- cocos-skill:managed-body:end -->",
  "<!-- cocos-skill:local-notes:start -->",
  "<!-- cocos-skill:local-notes:user:start -->",
  "<!-- cocos-skill:local-notes:user:end -->",
  "<!-- cocos-skill:local-notes:end -->",
];

const MAX_REFERENCE_LINES = 120;
const referenceSourceExceptions = new Set([
  "references/00-workflows.md",
  "references/12-experience-capture.md",
]);
const requiredReferenceMarkers = new Map([
  [
    "references/12-experience-capture.md",
    [
      "<!-- cocos-skill:experience-capture:user:start -->",
      "<!-- cocos-skill:experience-capture:user:end -->",
    ],
  ],
]);
const FORBIDDEN_TEMPLATE_PROVENANCE = /(官方类型来源|来源说明|工具来源|@cocos\/creator-types)/;
const FORBIDDEN_TEMPLATE_CJK = /[\u3400-\u9FFF]/;

function fail(message) {
  console.error(`ERROR: ${message}`);
  process.exitCode = 1;
}

function read(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

function extractReferences(markdown) {
  const matches = [...markdown.matchAll(/`(references\/[^`]+\.md)`/g)];
  return [...new Set(matches.map((match) => match[1]))].sort();
}

const skill = read(skillFile);
if (!skill.startsWith("---\nname: cocos-skill\n")) {
  fail("SKILL.md frontmatter must start with name: cocos-skill");
}

if (!/description:\s*Use when /m.test(skill)) {
  fail("SKILL.md description must start with 'Use when'");
}

for (const marker of requiredMarkers) {
  if (!skill.includes(marker)) {
    fail(`SKILL.md is missing marker: ${marker}`);
  }
}

const referenced = extractReferences(skill);
const onDisk = fs.readdirSync(path.join(skillDir, "references"))
  .filter((file) => file.endsWith(".md"))
  .map((file) => `references/${file}`)
  .sort();

for (const relativePath of referenced) {
  if (!fs.existsSync(path.join(skillDir, relativePath))) {
    fail(`SKILL.md references missing file: ${relativePath}`);
  }
}

for (const relativePath of onDisk) {
  if (!referenced.includes(relativePath)) {
    fail(`Unrouted reference file: ${relativePath}`);
  }
}

for (const relativePath of onDisk) {
  const absolutePath = path.join(skillDir, relativePath);
  const content = read(absolutePath);
  const lineCount = content.split("\n").length;
  if (lineCount > MAX_REFERENCE_LINES) {
    fail(`Reference file exceeds ${MAX_REFERENCE_LINES} lines: ${relativePath} (${lineCount})`);
  }

  if (!referenceSourceExceptions.has(relativePath) && FORBIDDEN_TEMPLATE_PROVENANCE.test(content)) {
    fail(`Bundled skill reference should not include provenance metadata: ${relativePath}`);
  }

  for (const marker of requiredReferenceMarkers.get(relativePath) ?? []) {
    if (!content.includes(marker)) {
      fail(`Reference file is missing marker ${marker}: ${relativePath}`);
    }
  }

  if (FORBIDDEN_TEMPLATE_CJK.test(content)) {
    fail(`Bundled skill reference should stay English-only: ${relativePath}`);
  }
}

if (FORBIDDEN_TEMPLATE_PROVENANCE.test(skill)) {
  fail("SKILL.md should not include provenance metadata");
}

if (FORBIDDEN_TEMPLATE_CJK.test(skill)) {
  fail("SKILL.md should stay English-only");
}

if (!process.exitCode) {
  console.log("Skill template validation passed.");
}
