import * as fs from "fs";
import * as path from "path";
import type { EditorMessageRequest } from "../runtime/tool-context.js";
import { encodeUuid } from "../uuid-codec.js";
import type { PropertySetSpec } from "./asset-interpreters/interface";
import {
  ASSET_TEMPLATE_URLS,
  buildAlreadyExistsResult,
  detectExistingAsset,
  processTypeScriptTemplate,
  type AssetInfoLike,
  type AssetTemplateDefinition,
} from "./operate-assets-support.js";
import { executeNonCreateAssetOperation } from "./operate-assets-mutations.js";

type AssetOperation = "create" | "copy" | "delete" | "move" | "get-properties" | "set-properties";

type AssetOperationResult = {
  results: Record<string, unknown>[];
  errors: string[];
  newComponentsAvailable: string[];
};

export { ASSET_TEMPLATE_URLS } from "./operate-assets-support.js";

export interface OperateAssetsOption {
  originalAssetPath?: string;
  destinationPath?: string;
  newAssetType?: string;
  overwrite?: boolean;
  rename?: boolean;
  properties?: PropertySetSpec[];
  includeTooltips?: boolean;
  useAdvancedInspection?: boolean;
}

export interface OperateAssetsArgs {
  operation: AssetOperation;
  operationOptions: OperateAssetsOption[];
}

interface OperateAssetsContext extends OperateAssetsArgs {
  request: EditorMessageRequest;
}

export async function executeOperateAssetsOperation(
  context: OperateAssetsContext
): Promise<AssetOperationResult> {
  const state = createAssetOperationState();

  for (const option of context.operationOptions) {
    const result = await executeSingleAssetOperation(context, option, state);
    if (result) {
      state.results.push(result);
    }
  }

  return state;
}

function createAssetOperationState(): AssetOperationResult {
  return {
    results: [],
    errors: [],
    newComponentsAvailable: [],
  };
}

async function executeSingleAssetOperation(
  context: OperateAssetsContext,
  option: OperateAssetsOption,
  state: AssetOperationResult
): Promise<Record<string, unknown> | null> {
  try {
    switch (context.operation) {
      case "create":
        return handleCreateOperation(context.request, option, state);
      case "copy":
      case "move":
      case "delete":
      case "get-properties":
      case "set-properties":
        return executeNonCreateAssetOperation(context.request, context.operation, option);
    }
  } catch (error) {
    state.errors.push(`${context.operation} failed: ${toErrorMessage(error)}`);
    return null;
  }
}

async function handleCreateOperation(
  request: EditorMessageRequest,
  option: OperateAssetsOption,
  state: AssetOperationResult
): Promise<Record<string, unknown> | null> {
  if (!option.destinationPath) {
    state.errors.push("destinationPath is required for create operation");
    return null;
  }
  if (!option.newAssetType) {
    state.errors.push("newAssetType is required for create operation");
    return null;
  }

  const template = ASSET_TEMPLATE_URLS[option.newAssetType];
  if (!template) {
    state.errors.push(`Invalid asset type: ${option.newAssetType}`);
    return null;
  }

  const finalPath = option.destinationPath.replace(/\.[^.]*$/, "") + template.ext;
  const existingAsset = await detectExistingAsset(request, finalPath);
  if (existingAsset && !option.overwrite && !option.rename) {
    return buildAlreadyExistsResult("create", { path: finalPath, existingAsset });
  }

  if (template.url) {
    return createAssetFromTemplate(request, finalPath, template, option, existingAsset, state);
  }

  return createEmptyAsset(request, finalPath, option.newAssetType, option);
}

async function createAssetFromTemplate(
  request: EditorMessageRequest,
  finalPath: string,
  template: AssetTemplateDefinition,
  option: OperateAssetsOption,
  existingAsset: AssetInfoLike | null,
  state: AssetOperationResult
): Promise<Record<string, unknown>> {
  if (!finalPath.endsWith(".ts")) {
    return copyTemplateAsset(request, template.url, finalPath, option);
  }

  return createTypeScriptAsset(request, finalPath, template.url, option, existingAsset, state);
}

async function createTypeScriptAsset(
  request: EditorMessageRequest,
  finalPath: string,
  templateUrl: string,
  option: OperateAssetsOption,
  existingAsset: AssetInfoLike | null,
  state: AssetOperationResult
): Promise<Record<string, unknown>> {
  const templateInfo = await request("asset-db", "query-asset-info", templateUrl);
  const templateFilePath = getTemplateFilePath(templateInfo);
  if (!templateFilePath || !fs.existsSync(templateFilePath)) {
    return copyTemplateAsset(request, templateUrl, finalPath, option);
  }

  const templateContent = fs.readFileSync(templateFilePath, "utf8");
  const requestedFileName = path.basename(finalPath, ".ts");
  const processed = processTypeScriptTemplate(templateContent, requestedFileName);
  const actualPath = buildAdjustedTypeScriptPath(finalPath, processed.finalFileName, processed.fileNameChanged);
  const existingAdjustedAsset = actualPath === finalPath ? existingAsset : await detectExistingAsset(request, actualPath);
  if (existingAdjustedAsset && !option.overwrite && !option.rename) {
    return buildAlreadyExistsResult("create", {
      path: actualPath,
      existingAsset: existingAdjustedAsset,
      originalPath: finalPath,
      adjustedPath: actualPath,
    });
  }

  const createResult = await request("asset-db", "create-asset", actualPath, processed.content, buildMutationOptions(option));
  await request("asset-db", "refresh-asset", actualPath);
  if (!createResult || typeof createResult !== "object" || !("uuid" in createResult)) {
    return { operation: "create", path: actualPath, success: false };
  }

  state.newComponentsAvailable.push(processed.className);
  return {
    operation: "create",
    path: actualPath,
    uuid: encodeUuid((createResult as { uuid: string }).uuid),
    ...(processed.fileNameChanged
      ? {
          originalPath: finalPath,
          adjustedPath: actualPath,
          reason: "File renamed to match class name",
        }
      : {}),
  };
}

function getTemplateFilePath(templateInfo: unknown): string | null {
  if (!templateInfo || typeof templateInfo !== "object" || Array.isArray(templateInfo)) {
    return null;
  }

  const record = templateInfo as { file?: unknown };
  return typeof record.file === "string" ? record.file : null;
}

function buildAdjustedTypeScriptPath(
  finalPath: string,
  finalFileName: string,
  fileNameChanged: boolean
): string {
  if (!fileNameChanged) {
    return finalPath;
  }

  return path.dirname(finalPath) === "."
    ? `${finalFileName}.ts`
    : `${path.dirname(finalPath)}/${finalFileName}.ts`;
}

async function copyTemplateAsset(
  request: EditorMessageRequest,
  templateUrl: string,
  finalPath: string,
  option: OperateAssetsOption
): Promise<Record<string, unknown>> {
  const copyResult = await request("asset-db", "copy-asset", templateUrl, finalPath, buildMutationOptions(option));
  if (!copyResult || typeof copyResult !== "object" || !("uuid" in copyResult)) {
    return { operation: "create", path: finalPath, success: false };
  }

  return {
    operation: "create",
    path: finalPath,
    uuid: encodeUuid((copyResult as { uuid: string }).uuid),
  };
}

async function createEmptyAsset(
  request: EditorMessageRequest,
  finalPath: string,
  newAssetType: string,
  option: OperateAssetsOption
): Promise<Record<string, unknown>> {
  const createResult = await request(
    "asset-db",
    "create-asset",
    finalPath,
    newAssetType === "Folder" ? null : "",
    buildMutationOptions(option)
  );
  if (!createResult || typeof createResult !== "object" || !("uuid" in createResult)) {
    return { operation: "create", path: finalPath, success: false };
  }

  return {
    operation: "create",
    path: finalPath,
    uuid: encodeUuid((createResult as { uuid: string }).uuid),
  };
}

function buildMutationOptions(option: OperateAssetsOption): { overwrite: boolean; rename: boolean } {
  return {
    overwrite: option.overwrite ?? false,
    rename: option.rename ?? false,
  };
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
