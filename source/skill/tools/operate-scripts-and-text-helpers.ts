import { getFileInfo, readFile } from "./operate-scripts-and-text-read.js";
import { replaceInFile } from "./operate-scripts-and-text-replace.js";
import { searchFile } from "./operate-scripts-and-text-search.js";
import {
  validateAssetAccess,
  type FileOperationResult,
  type ScriptsTextContext,
  type TextOperation,
  type WriteMode,
} from "./operate-scripts-and-text-support.js";
import { writeFile } from "./operate-scripts-and-text-write.js";

export interface OperateScriptsAndTextArgs extends ScriptsTextContext {
  operation: TextOperation;
  urlOrUuid: string;
  startLine?: number;
  endLine?: number;
  contextLines?: number;
  content?: string;
  writeMode?: WriteMode;
  insertLine?: number;
  searchPattern?: string;
  caseSensitive?: boolean;
  wholeWord?: boolean;
  useRegex?: boolean;
  maxResults?: number;
  replaceText?: string;
  replaceAll?: boolean;
}

export async function executeOperateScriptsAndText(
  args: OperateScriptsAndTextArgs
): Promise<Record<string, unknown>> {
  const result = await runOperation(args);
  return toOutcome(result);
}

async function runOperation(args: OperateScriptsAndTextArgs): Promise<FileOperationResult> {
  if (args.operation === "info") {
    return getFileInfo(args.request, { urlOrUuid: args.urlOrUuid });
  }

  const access = await validateAssetAccess(args.request, {
    urlOrUuid: args.urlOrUuid,
    operation: args.operation === "read" || args.operation === "search" ? "read" : "write",
  });
  if (!access.valid) {
    return { success: false, error: access.error };
  }

  switch (args.operation) {
    case "read":
      return readFile(args.request, args);
    case "write":
      return runWriteOperation(args);
    case "search":
      return runSearchOperation(args);
    case "replace":
      return runReplaceOperation(args);
    default:
      return { success: false, error: `Unsupported operation: ${args.operation satisfies never}` };
  }
}

function runWriteOperation(args: OperateScriptsAndTextArgs): Promise<FileOperationResult> {
  if (typeof args.content !== "string") {
    return Promise.resolve({ success: false, error: "content parameter is required for write operation" });
  }
  return writeFile(args, {
    urlOrUuid: args.urlOrUuid,
    content: args.content,
    mode: args.writeMode,
    insertLine: args.insertLine,
  });
}

function runSearchOperation(args: OperateScriptsAndTextArgs): Promise<FileOperationResult> {
  if (typeof args.searchPattern !== "string") {
    return Promise.resolve({ success: false, error: "searchPattern parameter is required for search operation" });
  }
  return searchFile(args.request, {
    urlOrUuid: args.urlOrUuid,
    pattern: args.searchPattern,
    caseSensitive: args.caseSensitive,
    wholeWord: args.wholeWord,
    regex: args.useRegex,
    contextLines: args.contextLines,
    maxResults: args.maxResults,
  });
}

function runReplaceOperation(args: OperateScriptsAndTextArgs): Promise<FileOperationResult> {
  if (typeof args.searchPattern !== "string" || typeof args.replaceText !== "string") {
    return Promise.resolve({
      success: false,
      error: "searchPattern and replaceText parameters are required for replace operation",
    });
  }
  return replaceInFile(args, {
    urlOrUuid: args.urlOrUuid,
    searchText: args.searchPattern,
    replaceText: args.replaceText,
    replaceAll: args.replaceAll,
    caseSensitive: args.caseSensitive,
    wholeWord: args.wholeWord,
    regex: args.useRegex,
  });
}

function toOutcome(result: FileOperationResult): Record<string, unknown> {
  if (result.success) {
    return {
      success: true,
      data: result.data ?? {},
      errors: [],
    };
  }

  return {
    success: false,
    data: result.data ?? {},
    errors: [
      {
        code: "file_operation_error",
        message: result.error ?? "Unknown file operation error",
      },
    ],
  };
}
