import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MAX_FILE_BYTES = 1024 * 1024;

const legacyWord = `m${"cp"}`;
const legacyPrefix = `M${legacyWord[0].toUpperCase()}${legacyWord.slice(1)}`;
const legacySdk = `modelcontext${"protocol"}`;
const legacyRoute = `/co${"cos"}/`;

const IGNORED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  ".cursor",
  ".kiro",
  ".ace-tool",
  "release",
  "@types",
  "@cocos"
]);

const IGNORED_FILES = new Set([
  "scripts/qa/assert-no-legacy-identifiers.mjs"
]);

const BLOCKED_PATTERNS = [
  { label: "legacy-word", regex: new RegExp(`\\b${legacyWord}\\b`, "i") },
  { label: "legacy-name", regex: new RegExp(`cocos-${legacyWord}`, "i") },
  { label: "legacy-sdk", regex: new RegExp(legacySdk, "i") },
  { label: "legacy-route", regex: new RegExp(legacyRoute, "i") },
  { label: "legacy-id", regex: new RegExp(`\\b${legacyPrefix}[A-Za-z0-9_]*`) }
];

function shouldSkipFile(relativePath) {
  if (IGNORED_FILES.has(relativePath)) {
    return true;
  }

  const stat = fs.statSync(relativePath);
  return stat.size > MAX_FILE_BYTES;
}

function collectFiles(dirPath, bucket) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });

  for (const entry of entries) {
    if (IGNORED_DIRS.has(entry.name)) {
      continue;
    }

    const fullPath = path.join(dirPath, entry.name);
    const relativePath = path.relative(ROOT, fullPath).replace(/\\/g, "/");

    if (entry.isDirectory()) {
      collectFiles(fullPath, bucket);
      continue;
    }

    if (!entry.isFile() || shouldSkipFile(relativePath)) {
      continue;
    }

    bucket.push(relativePath);
  }
}

function checkFile(filePath) {
  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);
  const hits = [];

  lines.forEach((line, index) => {
    BLOCKED_PATTERNS.forEach(({ label, regex }) => {
      if (regex.test(line)) {
        hits.push(`${filePath}:${index + 1} [${label}] ${line.trim()}`);
      }
    });
  });

  return hits;
}

const files = [];
collectFiles(ROOT, files);

const violations = files.flatMap((filePath) => checkFile(filePath));

if (violations.length > 0) {
  console.error("[FAIL] legacy identifiers detected:");
  violations.forEach((item) => console.error(item));
  process.exit(1);
}

console.log("[PASS] no legacy identifiers found");
