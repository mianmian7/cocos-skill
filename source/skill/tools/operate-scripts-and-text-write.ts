import * as fs from "fs";
import type { ScriptsTextContext } from "./operate-scripts-and-text-support.js";
import {
  adjustUrlForClassName,
  extractComponentNames,
  getNewComponentsOnly,
  isTypeScriptTarget,
  resolveAssetPath,
  toErrorMessage,
  validateTypeScriptContent,
  type FileOperationResult,
  type WriteMode,
} from "./operate-scripts-and-text-support.js";

export async function writeFile(
  context: ScriptsTextContext,
  options: {
    urlOrUuid: string;
    content: string;
    mode?: WriteMode;
    insertLine?: number;
  }
): Promise<FileOperationResult> {
  try {
    const target = buildWriteTarget(options.urlOrUuid, options.content);
    const validation = validateTargetContent(target.targetUrl, options.content);
    if (!validation.valid) {
      return { success: false, error: validation.error };
    }

    const resolved = await resolveAssetPath(context.request, target.targetUrl);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }
    if (resolved.isReadOnly) {
      return { success: false, error: `Cannot write to read-only asset: ${resolved.url}` };
    }

    const mode = options.mode ?? "overwrite";
    const data = !resolved.filePath
      ? await createAssetFromWrite(context, resolved.url, target, options.content)
      : await writeExistingAsset(context, resolved.filePath, resolved.url, target, {
          content: options.content,
          mode,
          insertLine: options.insertLine,
        });
    return { success: true, data };
  } catch (error) {
    return { success: false, error: `Error writing file: ${toErrorMessage(error)}` };
  }
}

function buildWriteTarget(urlOrUuid: string, content: string): { targetUrl: string; fileNameChanged: boolean } {
  const adjustment = adjustUrlForClassName({ urlOrUuid, content });
  return {
    targetUrl: adjustment.adjustedUrl,
    fileNameChanged: adjustment.wasChanged,
  };
}

function validateTargetContent(targetUrl: string, content: string): { valid: boolean; error?: string } {
  if (!isTypeScriptTarget(targetUrl)) {
    return { valid: true };
  }
  return validateTypeScriptContent(content);
}

async function createAssetFromWrite(
  context: ScriptsTextContext,
  resolvedUrl: string | undefined,
  target: { targetUrl: string; fileNameChanged: boolean },
  content: string
): Promise<Record<string, unknown>> {
  if (!resolvedUrl) {
    throw new Error("Cannot create asset without URL");
  }
  await context.request("asset-db", "create-asset", resolvedUrl, content);
  await context.request("asset-db", "refresh-asset", resolvedUrl);
  return buildWriteData(context, {
    urlOrUuid: target.fileNameChanged ? target.targetUrl : resolvedUrl,
    targetUrl: target.targetUrl,
    content,
    mode: "create",
  });
}

async function writeExistingAsset(
  context: ScriptsTextContext,
  resolvedPath: string,
  assetUrl: string | undefined,
  target: { targetUrl: string; fileNameChanged: boolean },
  options: {
    content: string;
    mode: WriteMode;
    insertLine?: number;
  }
): Promise<Record<string, unknown>> {
  const writeMetadata = applyWriteMode({
    resolvedPath,
    content: options.content,
    mode: options.mode,
    insertLine: options.insertLine,
  });
  return buildWriteData(context, {
    urlOrUuid: assetUrl ?? target.targetUrl,
    targetUrl: target.targetUrl,
    content: options.content,
    mode: options.mode,
    fileNameChanged: target.fileNameChanged,
    ...writeMetadata,
  });
}

function applyWriteMode(options: {
  resolvedPath: string;
  content: string;
  mode: WriteMode;
  insertLine?: number;
}): { totalLines?: number; insertedAt?: number } {
  switch (options.mode) {
    case "insert":
      return writeInsertMode(options);
    case "append":
      return writeAppendMode(options);
    case "prepend":
      return writePrependMode(options);
    default:
      fs.writeFileSync(options.resolvedPath, options.content, "utf8");
      return {};
  }
}

function writeInsertMode(options: {
  resolvedPath: string;
  content: string;
  insertLine?: number;
}): { totalLines?: number; insertedAt?: number } {
  if (!fs.existsSync(options.resolvedPath)) {
    fs.writeFileSync(options.resolvedPath, options.content, "utf8");
    return {};
  }

  const existingLines = fs.readFileSync(options.resolvedPath, "utf8").split("\n");
  const insertIndex = clampInsertIndex(existingLines.length, options.insertLine);
  existingLines.splice(insertIndex, 0, ...options.content.split("\n"));
  fs.writeFileSync(options.resolvedPath, existingLines.join("\n"), "utf8");
  return {
    totalLines: existingLines.length,
    insertedAt: options.insertLine,
  };
}

function clampInsertIndex(existingLineCount: number, insertLine?: number): number {
  const requestedLine = typeof insertLine === "number" ? insertLine : existingLineCount + 1;
  return Math.max(0, Math.min(requestedLine - 1, existingLineCount));
}

function writeAppendMode(options: { resolvedPath: string; content: string }): { totalLines?: number; insertedAt?: number } {
  fs.appendFileSync(options.resolvedPath, `\n${options.content}`, "utf8");
  return {};
}

function writePrependMode(options: { resolvedPath: string; content: string }): { totalLines?: number; insertedAt?: number } {
  const existingContent = fs.existsSync(options.resolvedPath) ? fs.readFileSync(options.resolvedPath, "utf8") : "";
  const content = existingContent ? `${options.content}\n${existingContent}` : options.content;
  fs.writeFileSync(options.resolvedPath, content, "utf8");
  return {};
}

async function buildWriteData(
  context: ScriptsTextContext,
  options: {
    urlOrUuid: string;
    targetUrl: string;
    content: string;
    mode: string;
    fileNameChanged?: boolean;
    totalLines?: number;
    insertedAt?: number;
  }
): Promise<Record<string, unknown>> {
  const detectedComponents = isTypeScriptTarget(options.targetUrl) ? extractComponentNames(options.content) : [];
  const newComponents = await getNewComponentsOnly(context.callSceneScript, detectedComponents);
  return {
    linesWritten: options.content.split("\n").length,
    mode: options.mode,
    assetUrl: options.targetUrl,
    ...(typeof options.totalLines === "number" ? { totalLines: options.totalLines } : {}),
    ...(typeof options.insertedAt === "number" ? { insertedAt: options.insertedAt } : {}),
    ...(options.fileNameChanged ? { originalUrl: options.urlOrUuid, adjustedUrl: options.targetUrl } : {}),
    ...(newComponents.length > 0 ? { newComponentsAvailable: newComponents } : {}),
  };
}
