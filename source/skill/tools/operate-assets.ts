import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import {
  ASSET_TEMPLATE_URLS,
  type OperateAssetsArgs,
  executeOperateAssetsOperation,
} from "./operate-assets-helpers.js";

const OPERATE_ASSETS_SCHEMA = {
  operation: z.enum(["create", "copy", "delete", "move", "get-properties", "set-properties"]),
  operationOptions: z.array(
    z.object({
      originalAssetPath: z.string().describe("Source path (for copy/delete/move/get/set operations)").optional(),
      destinationPath: z.string().describe("Target path (for create/copy/move operations)").optional(),
      newAssetType: z
        .enum(Object.keys(ASSET_TEMPLATE_URLS) as [string, ...string[]])
        .describe("Asset type for create")
        .optional(),
      overwrite: z.boolean().describe("Overwrite if exists").optional().default(false),
      rename: z.boolean().describe("Auto-rename on conflict").optional().default(false),
      properties: z
        .array(
          z.object({
            propertyPath: z.string(),
            propertyType: z.string(),
            propertyValue: z.any(),
          })
        )
        .describe("Properties for set operation")
        .optional(),
      includeTooltips: z.boolean().describe("Include property tooltips").optional().default(false),
      useAdvancedInspection: z.boolean().describe("Advanced property inspection").optional().default(false),
    })
  ),
};

function buildRuntimePolicy(operation: OperateAssetsArgs["operation"]) {
  return {
    effect: operation === "get-properties" ? ("read" as const) : ("mutating-asset" as const),
  };
}

function buildFailedMutationError(result: Record<string, unknown>): string | null {
  if (result.success !== false) {
    return null;
  }

  const operation = typeof result.operation === "string" ? result.operation : "asset mutation";
  if (typeof result.path === "string") {
    return `${operation} failed for ${result.path}: asset-db returned an invalid result`;
  }
  if (typeof result.from === "string" && typeof result.to === "string") {
    return `${operation} failed from ${result.from} to ${result.to}: asset-db returned an invalid result`;
  }
  return `${operation} failed: asset-db returned an invalid result`;
}

function collectOperationErrors(result: {
  results: Record<string, unknown>[];
  errors: string[];
}): string[] {
  const errors = [...result.errors];
  for (const item of result.results) {
    const failure = buildFailedMutationError(item);
    if (failure && !errors.includes(failure)) {
      errors.push(failure);
    }
  }
  return errors;
}

function buildOperationOutcome(result: {
  results: Record<string, unknown>[];
  errors: string[];
  newComponentsAvailable: string[];
}) {
  const errors = collectOperationErrors(result);
  return {
    success: errors.length === 0,
    data: {
      results: result.results,
      ...(result.newComponentsAvailable.length > 0
        ? { newComponentsAvailable: result.newComponentsAvailable }
        : {}),
    },
    errors,
  };
}

export function registerOperateAssetsTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_assets",
    {
      title: "Operate Assets",
      description: "Batch asset operations: create, copy, move, delete, get/set properties.",
      inputSchema: OPERATE_ASSETS_SCHEMA,
    },
    async (args: OperateAssetsArgs) =>
      runToolWithContext(
        {
          toolName: "operate_assets",
          operation: args.operation,
          packageName: packageJSON.name,
          ...buildRuntimePolicy(args.operation),
        },
        async ({ request }) =>
          buildOperationOutcome(
            await executeOperateAssetsOperation({
              ...args,
              request,
            })
          )
      )
  );
}
