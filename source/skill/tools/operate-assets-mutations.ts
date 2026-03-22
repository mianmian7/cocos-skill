import type { EditorMessageRequest } from "../runtime/tool-context.js";
import { encodeUuid } from "../uuid-codec.js";
import { AssetInterpreterManager } from "./asset-interpreters/asset-interpreter-manager";
import {
  buildAlreadyExistsResult,
  detectExistingAsset,
  queryAssetInfoSafe,
} from "./operate-assets-support.js";
import type { OperateAssetsOption } from "./operate-assets-helpers.js";

type NonCreateAssetOperation = "copy" | "delete" | "move" | "get-properties" | "set-properties";

export async function executeNonCreateAssetOperation(
  request: EditorMessageRequest,
  operation: NonCreateAssetOperation,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  switch (operation) {
    case "copy":
      return handleCopyOperation(request, option);
    case "move":
      return handleMoveOperation(request, option);
    case "delete":
      return handleDeleteOperation(request, option);
    case "get-properties":
      return handleGetPropertiesOperation(request, option);
    case "set-properties":
      return handleSetPropertiesOperation(request, option);
  }
}

async function handleCopyOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  if (!option.originalAssetPath || !option.destinationPath) {
    throw new Error("originalAssetPath and destinationPath are required for copy operation");
  }

  const sourceAsset = await queryAssetInfoSafe(request, option.originalAssetPath);
  if (!sourceAsset) {
    throw new Error(`Asset not found: ${option.originalAssetPath}`);
  }

  const existingDestination = await detectExistingAsset(request, option.destinationPath);
  if (existingDestination && !option.overwrite && !option.rename) {
    return buildAlreadyExistsResult("copy", {
      from: option.originalAssetPath,
      to: option.destinationPath,
      existingAsset: existingDestination,
    });
  }

  const copyResult = await request(
    "asset-db",
    "copy-asset",
    option.originalAssetPath,
    option.destinationPath,
    buildMutationOptions(option)
  );
  if (!copyResult || typeof copyResult !== "object" || !("uuid" in copyResult)) {
    return { operation: "copy", from: option.originalAssetPath, to: option.destinationPath, success: false };
  }

  return {
    operation: "copy",
    from: option.originalAssetPath,
    to: option.destinationPath,
    uuid: encodeUuid((copyResult as { uuid: string }).uuid),
  };
}

async function handleMoveOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  if (!option.originalAssetPath || !option.destinationPath) {
    throw new Error("originalAssetPath and destinationPath are required for move operation");
  }

  const sourceAsset = await queryAssetInfoSafe(request, option.originalAssetPath);
  if (!sourceAsset) {
    throw new Error(`Asset not found: ${option.originalAssetPath}`);
  }

  const existingDestination = await detectExistingAsset(request, option.destinationPath);
  if (existingDestination && !option.overwrite && !option.rename) {
    return buildAlreadyExistsResult("move", {
      from: option.originalAssetPath,
      to: option.destinationPath,
      existingAsset: existingDestination,
    });
  }

  const moveResult = await request(
    "asset-db",
    "move-asset",
    option.originalAssetPath,
    option.destinationPath,
    buildMutationOptions(option)
  );
  if (!moveResult || typeof moveResult !== "object" || !("uuid" in moveResult)) {
    return { operation: "move", from: option.originalAssetPath, to: option.destinationPath, success: false };
  }

  return {
    operation: "move",
    from: option.originalAssetPath,
    to: option.destinationPath,
    uuid: encodeUuid((moveResult as { uuid: string }).uuid),
  };
}

async function handleDeleteOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  if (!option.originalAssetPath) {
    throw new Error("originalAssetPath is required for delete operation");
  }

  const assetInfo = await queryAssetInfoSafe(request, option.originalAssetPath);
  if (!assetInfo?.uuid) {
    throw new Error(`Asset not found: ${option.originalAssetPath}`);
  }

  await request("asset-db", "delete-asset", option.originalAssetPath);
  return {
    operation: "delete",
    path: option.originalAssetPath,
    uuid: encodeUuid(assetInfo.uuid),
  };
}

async function handleGetPropertiesOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  if (!option.originalAssetPath) {
    throw new Error("originalAssetPath is required for get-properties operation");
  }

  const assetInfo = await queryAssetInfoSafe(request, option.originalAssetPath);
  if (!assetInfo?.uuid) {
    throw new Error(`Asset not found: ${option.originalAssetPath}`);
  }

  const description = await AssetInterpreterManager.getAssetProperties(
    assetInfo as any,
    option.includeTooltips ?? false,
    option.useAdvancedInspection ?? false
  );
  return {
    operation: "get-properties",
    path: option.originalAssetPath,
    uuid: encodeUuid(assetInfo.uuid),
    importer: assetInfo.importer,
    properties: description.properties || {},
    arrays: description.arrays || {},
    error: description.error,
  };
}

async function handleSetPropertiesOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption
): Promise<Record<string, unknown> | null> {
  if (!option.originalAssetPath) {
    throw new Error("originalAssetPath is required for set-properties operation");
  }
  if (option.originalAssetPath.startsWith("db://internal")) {
    throw new Error("internal assets can't be modifyed");
  }
  if (!option.properties?.length) {
    throw new Error("properties array is required for set-properties operation");
  }

  const assetInfo = await queryAssetInfoSafe(request, option.originalAssetPath);
  if (!assetInfo?.uuid) {
    throw new Error(`Asset not found: ${option.originalAssetPath}`);
  }

  const propertyResults = await AssetInterpreterManager.setAssetProperties(assetInfo as any, option.properties);
  return {
    operation: "set-properties",
    path: option.originalAssetPath,
    uuid: encodeUuid(assetInfo.uuid),
    importer: assetInfo.importer,
    propertyResults,
  };
}

function buildMutationOptions(option: OperateAssetsOption): { overwrite: boolean; rename: boolean } {
  return {
    overwrite: option.overwrite ?? false,
    rename: option.rename ?? false,
  };
}
