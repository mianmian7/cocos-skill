import * as fs from "fs";
import * as path from "path";

export const MANAGED_BODY_BLOCK_START = "<!-- cocos-skill:managed-body:start -->";
export const MANAGED_BODY_BLOCK_END = "<!-- cocos-skill:managed-body:end -->";
export const LOCAL_NOTES_BLOCK_START = "<!-- cocos-skill:local-notes:start -->";
export const LOCAL_NOTES_BLOCK_END = "<!-- cocos-skill:local-notes:end -->";
export const LOCAL_NOTES_USER_BLOCK_START = "<!-- cocos-skill:local-notes:user:start -->";
export const LOCAL_NOTES_USER_BLOCK_END = "<!-- cocos-skill:local-notes:user:end -->";
export const PROGRAM_USER_BLOCK_START = "<!-- cocos-skill:program:user:start -->";
export const PROGRAM_USER_BLOCK_END = "<!-- cocos-skill:program:user:end -->";
export const RUN_LEDGER_USER_BLOCK_START = "<!-- cocos-skill:run-ledger:user:start -->";
export const RUN_LEDGER_USER_BLOCK_END = "<!-- cocos-skill:run-ledger:user:end -->";
const LEGACY_EXPERIENCE_BLOCK_START = "<!-- cocos-skill:experience:start -->";
const LEGACY_EXPERIENCE_BLOCK_END = "<!-- cocos-skill:experience:end -->";
const EXPERIENCE_CAPTURE_USER_BLOCK_START = "<!-- cocos-skill:experience-capture:user:start -->";
const EXPERIENCE_CAPTURE_USER_BLOCK_END = "<!-- cocos-skill:experience-capture:user:end -->";
const LEGACY_EXPERIENCE_TEMPLATE_BODY = [
  "## Experience Capture",
  "",
  "Capture reusable, verified lessons from development, review, debugging, and validation.",
  "",
  "- Keep short rules here; move long rationale, commands, and examples to `references/12-experience-capture.md`.",
  "- Use this schema: `Title`, `Signal`, `Root Cause / Constraints`, `Correct Approach`, `Verification`, `Scope`.",
  "- Skip guesses, one-off noise, and branch-local details.",
].join("\n");

export type SkillTemplateSyncResult = "copied" | "updated" | "skipped";
export type SyncTemplateDirectoryOptions = {
  onDeleted?: (targetPath: string) => void;
  onSynced?: (targetPath: string, result: SkillTemplateSyncResult) => void;
};

type FrontmatterSplit = {
  frontmatter: string | null;
  body: string;
};

type PreservedBlock = {
  start: string;
  end: string;
};

const PRESERVED_BLOCKS: readonly PreservedBlock[] = [
  { start: LOCAL_NOTES_USER_BLOCK_START, end: LOCAL_NOTES_USER_BLOCK_END },
  { start: PROGRAM_USER_BLOCK_START, end: PROGRAM_USER_BLOCK_END },
  { start: RUN_LEDGER_USER_BLOCK_START, end: RUN_LEDGER_USER_BLOCK_END },
  { start: EXPERIENCE_CAPTURE_USER_BLOCK_START, end: EXPERIENCE_CAPTURE_USER_BLOCK_END },
];

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function withTrailingNewline(content: string): string {
  return `${content.replace(/\s*$/, "")}\n`;
}

function splitFrontmatter(content: string): FrontmatterSplit {
  const normalized = normalizeLineEndings(content);
  const lines = normalized.split("\n");
  if (lines[0] !== "---") {
    return { frontmatter: null, body: normalized };
  }

  const endIndex = lines.findIndex((line, index) => index > 0 && line === "---");
  if (endIndex === -1) {
    return { frontmatter: null, body: normalized };
  }

  return {
    frontmatter: lines.slice(0, endIndex + 1).join("\n"),
    body: lines.slice(endIndex + 1).join("\n"),
  };
}

function extractBlock(content: string, start: string, end: string): string | null {
  const normalized = normalizeLineEndings(content);
  const startIndex = normalized.indexOf(start);
  const endIndex = normalized.indexOf(end);
  if (startIndex === -1 || endIndex === -1 || endIndex < startIndex) {
    return null;
  }

  return normalized.slice(startIndex, endIndex + end.length);
}

function extractBlockBody(content: string, start: string, end: string): string | null {
  const block = extractBlock(content, start, end);
  if (!block) {
    return null;
  }

  const normalized = normalizeLineEndings(block);
  const body = normalized.slice(start.length, normalized.length - end.length);
  return body.replace(/^\s*\n?/, "").replace(/\n?\s*$/, "");
}

function replaceBlock(content: string, currentBlock: string, nextBlock: string): string {
  return content.replace(currentBlock, nextBlock);
}

function buildBlock(start: string, end: string, body: string): string {
  return `${start}\n${body.trim()}\n${end}`;
}

function mergeUserBlock(
  sourceContent: string,
  targetContent: string,
  block: PreservedBlock,
  legacyContent: string | null = null,
): string {
  const sourceBlock = extractBlock(sourceContent, block.start, block.end);
  if (!sourceBlock) {
    return sourceContent;
  }

  const targetBlock = extractBlock(targetContent, block.start, block.end);
  if (targetBlock) {
    return replaceBlock(sourceContent, sourceBlock, targetBlock);
  }

  if (!legacyContent || legacyContent.trim().length === 0) {
    return sourceContent;
  }

  return replaceBlock(sourceContent, sourceBlock, buildBlock(block.start, block.end, legacyContent));
}

function extractLegacyExperienceNotes(targetBody: string): string | null {
  const legacyBody = extractBlockBody(targetBody, LEGACY_EXPERIENCE_BLOCK_START, LEGACY_EXPERIENCE_BLOCK_END);
  if (!legacyBody) {
    return null;
  }

  const normalized = legacyBody.trim();
  const template = LEGACY_EXPERIENCE_TEMPLATE_BODY.trim();
  if (!normalized || normalized === template) {
    return null;
  }

  if (!normalized.startsWith(template)) {
    return normalized;
  }

  const extraNotes = normalized.slice(template.length).trim();
  return extraNotes || null;
}

function extractLegacyTrailingNotes(targetBody: string): string | null {
  const normalized = normalizeLineEndings(targetBody);
  const endIndex = normalized.indexOf(LEGACY_EXPERIENCE_BLOCK_END);
  if (endIndex === -1) {
    return null;
  }

  const trailing = normalized.slice(endIndex + LEGACY_EXPERIENCE_BLOCK_END.length).trim();
  return trailing || null;
}

function extractLegacySkillNotes(targetBody: string): string | null {
  if (extractBlock(targetBody, LOCAL_NOTES_USER_BLOCK_START, LOCAL_NOTES_USER_BLOCK_END)) {
    return null;
  }

  const notes = [extractLegacyExperienceNotes(targetBody), extractLegacyTrailingNotes(targetBody)]
    .filter((value): value is string => Boolean(value && value.trim()))
    .filter((value, index, values) => values.indexOf(value) === index);
  if (notes.length === 0) {
    return null;
  }

  return notes.join("\n\n");
}

function mergeLocalNotes(sourceBody: string, targetBody: string): string {
  const sourceNotes = extractBlock(sourceBody, LOCAL_NOTES_BLOCK_START, LOCAL_NOTES_BLOCK_END);
  if (!sourceNotes) {
    return sourceBody;
  }

  const legacyNotes = extractLegacySkillNotes(targetBody);
  const mergedNotes = mergeUserBlock(sourceNotes, targetBody, {
    start: LOCAL_NOTES_USER_BLOCK_START,
    end: LOCAL_NOTES_USER_BLOCK_END,
  }, legacyNotes);
  return replaceBlock(sourceBody, sourceNotes, mergedNotes);
}

function extractLegacyAppendedBlockContent(
  sourceContent: string,
  targetContent: string,
  block: PreservedBlock,
): string | null {
  if (extractBlock(targetContent, block.start, block.end)) {
    return null;
  }

  const sourceBlock = extractBlock(sourceContent, block.start, block.end);
  if (!sourceBlock) {
    return null;
  }

  const sourceWithoutBlock = normalizeLineEndings(replaceBlock(sourceContent, sourceBlock, "")).trimEnd();
  const normalizedTarget = normalizeLineEndings(targetContent).trimEnd();
  if (!normalizedTarget.startsWith(sourceWithoutBlock)) {
    return null;
  }

  const appended = normalizedTarget.slice(sourceWithoutBlock.length).trim();
  return appended || null;
}

function mergeManagedTemplate(sourceContent: string, targetContent: string): string | null {
  let merged = sourceContent;
  let hasManagedBlocks = false;

  for (const block of PRESERVED_BLOCKS) {
    if (!sourceContent.includes(block.start)) {
      continue;
    }

    hasManagedBlocks = true;
    const legacyContent = extractLegacyAppendedBlockContent(sourceContent, targetContent, block);
    merged = mergeUserBlock(merged, targetContent, block, legacyContent);
  }

  return hasManagedBlocks ? withTrailingNewline(merged) : null;
}

function mergeSkillTemplate(sourceContent: string, targetContent: string): string {
  const source = splitFrontmatter(sourceContent);
  const target = splitFrontmatter(targetContent);
  const mergedBody = mergeLocalNotes(source.body, target.body);

  const frontmatter = source.frontmatter ?? target.frontmatter;
  if (!frontmatter) {
    return withTrailingNewline(mergedBody);
  }

  return withTrailingNewline(`${frontmatter}${mergedBody}`);
}

function syncSkillFile(sourcePath: string, targetPath: string): SkillTemplateSyncResult {
  const sourceContent = fs.readFileSync(sourcePath, "utf8");
  const targetContent = fs.readFileSync(targetPath, "utf8");
  const merged = mergeSkillTemplate(sourceContent, targetContent);
  if (normalizeLineEndings(targetContent).trim() === normalizeLineEndings(merged).trim()) {
    return "skipped";
  }

  fs.writeFileSync(targetPath, merged, "utf8");
  return "updated";
}

function syncRegularFile(sourcePath: string, targetPath: string): SkillTemplateSyncResult {
  const sourceBuffer = fs.readFileSync(sourcePath);
  const targetBuffer = fs.readFileSync(targetPath);
  if (sourceBuffer.equals(targetBuffer)) {
    return "skipped";
  }

  const mergedTemplate = mergeManagedTemplate(sourceBuffer.toString("utf8"), targetBuffer.toString("utf8"));
  if (mergedTemplate) {
    if (normalizeLineEndings(targetBuffer.toString("utf8")).trim() === normalizeLineEndings(mergedTemplate).trim()) {
      return "skipped";
    }

    fs.writeFileSync(targetPath, mergedTemplate, "utf8");
    return "updated";
  }

  fs.copyFileSync(sourcePath, targetPath);
  return "updated";
}

export function syncTemplateFile(sourcePath: string, targetPath: string): SkillTemplateSyncResult {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return "copied";
  }

  if (path.basename(targetPath) === "SKILL.md") {
    return syncSkillFile(sourcePath, targetPath);
  }

  return syncRegularFile(sourcePath, targetPath);
}

export function syncSkillTemplateFile(sourcePath: string, targetPath: string): SkillTemplateSyncResult {
  return syncTemplateFile(sourcePath, targetPath);
}

function ensureDirectory(targetDir: string): void {
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }
}

function syncSourceEntries(sourceDir: string, targetDir: string, options: SyncTemplateDirectoryOptions): void {
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      syncTemplateDirectory(sourcePath, targetPath, options);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const result = syncTemplateFile(sourcePath, targetPath);
    if (result !== "skipped") {
      options.onSynced?.(targetPath, result);
    }
  }
}

function deleteStaleEntries(sourceDir: string, targetDir: string, options: SyncTemplateDirectoryOptions): void {
  const sourceNames = new Set(fs.readdirSync(sourceDir));
  const targetNames = fs.existsSync(targetDir) ? fs.readdirSync(targetDir) : [];

  for (const entryName of targetNames) {
    if (sourceNames.has(entryName)) {
      continue;
    }

    const stalePath = path.join(targetDir, entryName);
    fs.rmSync(stalePath, { recursive: true, force: true });
    options.onDeleted?.(stalePath);
  }
}

export function syncTemplateDirectory(
  sourceDir: string,
  targetDir: string,
  options: SyncTemplateDirectoryOptions = {},
): void {
  ensureDirectory(targetDir);
  syncSourceEntries(sourceDir, targetDir, options);
  deleteStaleEntries(sourceDir, targetDir, options);
}
