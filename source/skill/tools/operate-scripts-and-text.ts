import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import {
  executeOperateScriptsAndText,
  type OperateScriptsAndTextArgs,
} from "./operate-scripts-and-text-helpers.js";

const OPERATE_SCRIPTS_AND_TEXT_SCHEMA = {
  operation: z.enum(["read", "write", "search", "replace", "info"]).describe("File operation type"),
  urlOrUuid: z.string().describe("Asset UUID or db:// format URL"),
  startLine: z.number().optional().describe("Starting line number for reading (1-based)"),
  endLine: z.number().optional().describe("Ending line number for reading (1-based)"),
  contextLines: z
    .number()
    .optional()
    .default(0)
    .describe("Number of context lines to include before/after the requested range"),
  content: z.string().optional().describe("Content to write (required for write operation)"),
  writeMode: z
    .enum(["overwrite", "append", "prepend", "insert"])
    .optional()
    .default("overwrite")
    .describe("Write mode: overwrite entire file, append to end, prepend to start, or insert at specific line"),
  insertLine: z.number().optional().describe("Line number for insert mode (1-based)"),
  searchPattern: z.string().optional().describe("Pattern to search for (required for search operation)"),
  caseSensitive: z.boolean().optional().default(false).describe("Case sensitive search"),
  wholeWord: z.boolean().optional().default(false).describe("Match whole words only"),
  useRegex: z.boolean().optional().default(false).describe("Treat pattern as regular expression"),
  maxResults: z.number().optional().describe("Maximum number of search results to return"),
  replaceText: z.string().optional().describe("Replacement text (required for replace operation)"),
  replaceAll: z.boolean().optional().default(false).describe("Replace all occurrences (false = replace first only)"),
};

function buildRuntimePolicy(operation: OperateScriptsAndTextArgs["operation"]) {
  return {
    effect: operation === "write" || operation === "replace" ? ("mutating-asset" as const) : ("read" as const),
  };
}

export function registerOperateScriptsAndTextTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_scripts_and_text",
    {
      title: "Advanced File Operations",
      description: "File operations: read, write, search, replace text.",
      inputSchema: OPERATE_SCRIPTS_AND_TEXT_SCHEMA,
    },
    async (args: OperateScriptsAndTextArgs) =>
      runToolWithContext(
        {
          toolName: "operate_scripts_and_text",
          operation: args.operation,
          packageName: packageJSON.name,
          ...buildRuntimePolicy(args.operation),
        },
        async ({ request, callSceneScript }) =>
          executeOperateScriptsAndText({
            ...args,
            request,
            callSceneScript,
          })
      )
  );
}
