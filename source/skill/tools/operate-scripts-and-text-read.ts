import * as fs from "fs";
import * as path from "path";
import type { EditorMessageRequest } from "../runtime/tool-context.js";
import {
  resolveAssetPath,
  toErrorMessage,
  type FileOperationResult,
} from "./operate-scripts-and-text-support.js";

export async function readFile(
  request: EditorMessageRequest,
  options: {
    urlOrUuid: string;
    startLine?: number;
    endLine?: number;
    contextLines?: number;
  }
): Promise<FileOperationResult> {
  try {
    const resolved = await resolveAssetPath(request, options.urlOrUuid);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }
    if (!resolved.filePath) {
      return { success: false, error: `Asset does not exist: ${options.urlOrUuid}` };
    }

    const content = fs.readFileSync(resolved.filePath, "utf8");
    const lines = content.split("\n");
    if (typeof options.startLine !== "number") {
      return buildFullReadResult(lines, content, resolved.url);
    }
    return buildRangeReadResult(lines, resolved.url, {
      startLine: options.startLine,
      endLine: options.endLine,
      contextLines: options.contextLines,
    });
  } catch (error) {
    return { success: false, error: `Error reading file: ${toErrorMessage(error)}` };
  }
}

function buildFullReadResult(
  lines: string[],
  content: string,
  assetUrl?: string
): FileOperationResult {
  return {
    success: true,
    data: {
      content,
      totalLines: lines.length,
      assetUrl,
    },
  };
}

function buildRangeReadResult(
  lines: string[],
  assetUrl: string | undefined,
  options: {
    startLine: number;
    endLine?: number;
    contextLines?: number;
  }
): FileOperationResult {
  const start = Math.max(0, options.startLine - 1);
  const end = typeof options.endLine === "number" ? Math.min(lines.length, options.endLine) : lines.length;
  const selectedLines = lines.slice(start, end);
  const context = buildRangeContext(lines, start, end, options.contextLines ?? 0);
  return {
    success: true,
    data: {
      content: selectedLines.join("\n"),
      totalLines: lines.length,
      requestedRange: { startLine: options.startLine, endLine: end },
      ...(context ? { context } : {}),
      assetUrl,
    },
  };
}

function buildRangeContext(
  lines: string[],
  start: number,
  end: number,
  contextLines: number
): { before: string[]; after: string[] } | undefined {
  if (contextLines <= 0) {
    return undefined;
  }
  return {
    before: lines.slice(Math.max(0, start - contextLines), start),
    after: lines.slice(end, Math.min(lines.length, end + contextLines)),
  };
}

export async function getFileInfo(
  request: EditorMessageRequest,
  options: { urlOrUuid: string }
): Promise<FileOperationResult> {
  try {
    const resolved = await resolveAssetPath(request, options.urlOrUuid);
    if (!resolved.valid) {
      return { success: false, error: resolved.error };
    }
    if (!resolved.filePath) {
      return buildMissingFileInfoResult(resolved.url, resolved.isReadOnly);
    }

    const stats = fs.statSync(resolved.filePath);
    const content = fs.readFileSync(resolved.filePath, "utf8");
    return {
      success: true,
      data: {
        exists: true,
        path: resolved.filePath,
        assetUrl: resolved.url,
        isReadOnly: resolved.isReadOnly,
        size: stats.size,
        modified: stats.mtime,
        created: stats.birthtime,
        extension: path.extname(resolved.filePath),
        isDirectory: stats.isDirectory(),
        isFile: stats.isFile(),
        lineCount: content.split("\n").length,
        characterCount: content.length,
      },
    };
  } catch (error) {
    return { success: false, error: `Error getting file info: ${toErrorMessage(error)}` };
  }
}

function buildMissingFileInfoResult(
  assetUrl?: string,
  isReadOnly?: boolean
): FileOperationResult {
  return {
    success: true,
    data: {
      exists: false,
      assetUrl,
      isReadOnly,
    },
  };
}
