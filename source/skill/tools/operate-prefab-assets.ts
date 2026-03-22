import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import {
  executePrefabAssetOperation,
  type OperatePrefabAssetsArgs,
} from "./operate-prefab-assets-helpers.js";

const OPERATE_PREFAB_ASSETS_SCHEMA = {
  operation: z.enum(["batch_create", "open_for_editing", "save_and_close", "close_without_saving"]),
  assetToOpenUrlOrUuid: z
    .string()
    .optional()
    .describe("Asset URL or UUID to open for editing (e.g., 'db://assets/MyPrefab.prefab' or UUID)"),
  creationOptions: z
    .array(
      z.object({
        nodeUuid: z.string(),
        assetPath: z.string().describe("Target asset path for the new prefab (e.g., 'db://assets/MyPrefab.prefab')"),
        removeOriginal: z.boolean().describe("Whether to remove the original node after creating prefab"),
      })
    )
    .optional()
    .describe("Options for creating prefabs from nodes"),
};

function buildOperationOutcome(result: { notes: string[]; errors: string[] }) {
  return {
    success: result.errors.length === 0,
    data: {
      notes: result.notes,
    },
    errors: result.errors,
  };
}

function buildRuntimePolicy(args: OperatePrefabAssetsArgs) {
  if (args.operation !== "batch_create") {
    return {
      effect: "mutating-scene" as const,
    };
  }

  const mutatesScene = args.creationOptions?.some((option) => option.removeOriginal) ?? false;
  return {
    effect: mutatesScene ? ("mutating-scene" as const) : ("mutating-asset" as const),
    snapshotOnSuccess: mutatesScene,
  };
}

export function registerOperatePrefabAssetsTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_prefab_assets",
    {
      title: "Create, Open or Close Prefabs",
      description: "Prefab operations: create, edit, save, close",
      inputSchema: OPERATE_PREFAB_ASSETS_SCHEMA,
    },
    async (args: OperatePrefabAssetsArgs) =>
      runToolWithContext(
        {
          toolName: "operate_prefab_assets",
          operation: args.operation,
          packageName: packageJSON.name,
          ...buildRuntimePolicy(args),
        },
        async (context) =>
          buildOperationOutcome(
            await executePrefabAssetOperation({
              ...args,
              request: context.request,
              callSceneScript: context.callSceneScript,
            })
          )
      )
  );
}
