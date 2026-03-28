import * as fs from "fs";
import * as path from "path";

export const EXPERIENCE_BLOCK_START = "<!-- cocos-skill:experience:start -->";
export const EXPERIENCE_BLOCK_END = "<!-- cocos-skill:experience:end -->";

export type SkillTemplateSyncResult = "copied" | "updated" | "skipped";

function normalizeLineEndings(content: string): string {
  return content.replace(/\r\n/g, "\n");
}

function withTrailingNewline(content: string): string {
  return `${content.replace(/\s*$/, "")}\n`;
}

export function extractManagedExperienceBlock(content: string): string | null {
  const normalized = normalizeLineEndings(content);
  const start = normalized.indexOf(EXPERIENCE_BLOCK_START);
  const end = normalized.indexOf(EXPERIENCE_BLOCK_END);

  if (start === -1 || end === -1 || end < start) {
    return null;
  }

  return normalized.slice(start, end + EXPERIENCE_BLOCK_END.length);
}

export function ensureManagedExperienceBlock(
  targetContent: string,
  managedBlock: string,
): { content: string; changed: boolean } {
  const normalizedTarget = normalizeLineEndings(targetContent);
  const normalizedBlock = normalizeLineEndings(managedBlock).trim();
  const existingBlock = extractManagedExperienceBlock(normalizedTarget);

  if (existingBlock) {
    if (existingBlock.trim() === normalizedBlock) {
      return { content: withTrailingNewline(normalizedTarget), changed: false };
    }

    const updated = normalizedTarget.replace(existingBlock, normalizedBlock);
    return { content: withTrailingNewline(updated), changed: true };
  }

  const separator = normalizedTarget.trim().length === 0 ? "" : "\n\n";
  return {
    content: withTrailingNewline(`${normalizedTarget.trimEnd()}${separator}${normalizedBlock}`),
    changed: true,
  };
}

export function syncSkillTemplateFile(sourcePath: string, targetPath: string): SkillTemplateSyncResult {
  if (!fs.existsSync(targetPath)) {
    fs.mkdirSync(path.dirname(targetPath), { recursive: true });
    fs.copyFileSync(sourcePath, targetPath);
    return "copied";
  }

  const managedBlock = extractManagedExperienceBlock(fs.readFileSync(sourcePath, "utf8"));
  if (!managedBlock) {
    return "skipped";
  }

  const targetContent = fs.readFileSync(targetPath, "utf8");
  const updated = ensureManagedExperienceBlock(targetContent, managedBlock);
  if (!updated.changed) {
    return "skipped";
  }

  fs.writeFileSync(targetPath, updated.content, "utf8");
  return "updated";
}
