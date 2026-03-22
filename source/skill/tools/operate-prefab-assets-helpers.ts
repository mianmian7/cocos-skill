import type { EditorMessageRequest } from "../runtime/tool-context.js";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { saveSceneNonInteractive } from "./scene-save.js";
import {
  normalizePrefabAssetPath,
  queryActivePrefabInfo,
  queryPrefabUuidByPath,
  resolveLinkedNodeUuid,
  resolvePrefabAsset as resolvePrefabAssetInfo,
  runPrefabCloseStep,
  toErrorMessage,
} from "./operate-prefab-assets-support.js";

type PrefabOperation = "batch_create" | "open_for_editing" | "save_and_close" | "close_without_saving";

type SceneScriptCaller = (method: string, args?: unknown[]) => Promise<unknown>;

type PrefabToolState = {
  notes: string[];
  errors: string[];
};

export interface PrefabCreationOption {
  nodeUuid: string;
  assetPath: string;
  removeOriginal: boolean;
}

export interface OperatePrefabAssetsArgs {
  operation: PrefabOperation;
  assetToOpenUrlOrUuid?: string;
  creationOptions?: PrefabCreationOption[];
}

interface OperatePrefabAssetsContext extends OperatePrefabAssetsArgs {
  request: EditorMessageRequest;
  callSceneScript: SceneScriptCaller;
}

export async function executePrefabAssetOperation(
  context: OperatePrefabAssetsContext
): Promise<PrefabToolState> {
  const state = createPrefabToolState();

  switch (context.operation) {
    case "batch_create":
      await handleBatchCreate(context, state);
      return state;
    case "open_for_editing":
      await handleOpenForEditing(context, state);
      return state;
    case "save_and_close":
      await handlePrefabClose(context.request, state, true);
      return state;
    case "close_without_saving":
      await handlePrefabClose(context.request, state, false);
      return state;
  }
}

function createPrefabToolState(): PrefabToolState {
  return { notes: [], errors: [] };
}

async function handleBatchCreate(context: OperatePrefabAssetsContext, state: PrefabToolState): Promise<void> {
  if (!context.creationOptions?.length) {
    throw new Error("Creation options are required for 'batch_create' operation");
  }

  for (const option of context.creationOptions) {
    await createPrefabFromNode(context, option, state);
  }
}

async function handleOpenForEditing(context: OperatePrefabAssetsContext, state: PrefabToolState): Promise<void> {
  if (!context.assetToOpenUrlOrUuid) {
    throw new Error("Asset URL or UUID is required for 'open_for_editing' operation");
  }

  const prefab = await resolvePrefabAssetInfo(context.request, context.assetToOpenUrlOrUuid);
  const saveResult = await saveSceneNonInteractive(context.request);
  if (!saveResult.success) {
    throw new Error(`Failed to save current scene before opening prefab: ${saveResult.error || "unknown error"}`);
  }

  await context.request("asset-db", "open-asset", prefab.uuid);
  state.notes.push(buildPrefabOpenedNote(prefab));
}

async function handlePrefabClose(
  request: EditorMessageRequest,
  state: PrefabToolState,
  shouldSave: boolean
): Promise<void> {
  const prefabInfo = await queryActivePrefabInfo(request);
  if (!prefabInfo) {
    state.notes.push(
      shouldSave
        ? "No prefab editing session is active; skipped save_and_close."
        : "No prefab editing session is active; skipped close_without_saving."
    );
    return;
  }

  if (shouldSave) {
    await runPrefabCloseStep(request, state.errors, "save-scene", "Error saving prefab before closing");
  }
  await runPrefabCloseStep(request, state.errors, "close-scene", "Error closing prefab");
}

async function createPrefabFromNode(
  context: OperatePrefabAssetsContext,
  option: PrefabCreationOption,
  state: PrefabToolState
): Promise<void> {
  const decodedNodeUuid = await verifySourceNode(context.request, option.nodeUuid);
  const assetPath = normalizePrefabAssetPath(option.assetPath);
  const prefabUuid = await createPrefabAsset(context, decodedNodeUuid, assetPath, state.errors);
  const linkedNodeUuid = prefabUuid
    ? await resolveLinkedNodeUuid(context.request, decodedNodeUuid, prefabUuid)
    : null;

  if (linkedNodeUuid && option.removeOriginal) {
    await removeOriginalNode(context.request, linkedNodeUuid, state.errors);
  }

  appendCreatePrefabNotes({
    state,
    sourceNodeUuid: option.nodeUuid,
    prefabUuid,
    linkedNodeUuid,
    assetPath,
  });
}

async function verifySourceNode(request: EditorMessageRequest, nodeUuid: string): Promise<string> {
  const decodedNodeUuid = decodeUuid(nodeUuid);
  const nodeInfo = await request("scene", "query-node", decodedNodeUuid);
  if (!nodeInfo) {
    throw new Error(`Node with UUID ${nodeUuid} not found`);
  }
  return decodedNodeUuid;
}

async function createPrefabAsset(
  context: OperatePrefabAssetsContext,
  decodedNodeUuid: string,
  assetPath: string,
  errors: string[]
): Promise<string | null> {
  try {
    const creationResult = await context.callSceneScript("createPrefabFromNode", [decodedNodeUuid, assetPath]);
    const prefabUuid = extractPrefabUuid(creationResult);
    if (prefabUuid) {
      return prefabUuid;
    }

    return await queryPrefabUuidByPath(context.request, assetPath, errors);
  } catch (error) {
    errors.push(`Error creating prefab: ${toErrorMessage(error)}`);
    return null;
  }
}

function extractPrefabUuid(value: unknown): string | null {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return null;
  }

  const record = value as { uuid?: unknown };
  return typeof record.uuid === "string" ? record.uuid : null;
}

async function removeOriginalNode(
  request: EditorMessageRequest,
  linkedNodeUuid: string,
  errors: string[]
): Promise<void> {
  try {
    await request("scene", "remove-node", { uuid: linkedNodeUuid });
  } catch (error) {
    errors.push(`Failed to remove original node after prefab creation: ${toErrorMessage(error)}`);
  }
}

function appendCreatePrefabNotes(params: {
  state: PrefabToolState;
  sourceNodeUuid: string;
  prefabUuid: string | null;
  linkedNodeUuid: string | null;
  assetPath: string;
}): void {
  const { state, sourceNodeUuid, prefabUuid, linkedNodeUuid, assetPath } = params;
  if (prefabUuid) {
    state.notes.push(`Prefab from node (UUID: '${sourceNodeUuid}') created, prefab UUID: ${encodeUuid(prefabUuid)}`);
  } else {
    state.errors.push(`Failed to create prefab from node '${sourceNodeUuid}' at path '${assetPath}'`);
  }

  if (linkedNodeUuid) {
    state.notes.push(`Original node has new UUID: ${encodeUuid(linkedNodeUuid)}`);
  }
}
function buildPrefabOpenedNote(prefab: { uuid: string; name?: string }): string {
  return prefab.name
    ? `Prefab ${prefab.name} opened successfully (UUID: ${encodeUuid(prefab.uuid)})`
    : `Prefab opened successfully (UUID: ${encodeUuid(prefab.uuid)})`;
}
