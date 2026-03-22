import { toNonEmptyString, toRecord } from "../runtime/tool-coercion.js";
import type { EditorMessageRequest } from "../runtime/tool-context.js";
import { decodeUuid } from "../uuid-codec.js";

type QueryNodeResult = {
  uuid?: unknown;
  __prefab__?: unknown;
  _prefab?: unknown;
  prefab?: unknown;
  children?: QueryNodeResult[];
};

export function normalizePrefabAssetPath(assetPath: string): string {
  const normalizedPath = assetPath.startsWith("db://") ? assetPath : `db://assets/${assetPath}`;
  return normalizedPath.endsWith(".prefab") ? normalizedPath : `${normalizedPath}.prefab`;
}

export async function queryPrefabUuidByPath(
  request: EditorMessageRequest,
  assetPath: string,
  errors: string[]
): Promise<string | null> {
  try {
    const assetInfo = toRecord(await request("asset-db", "query-asset-info", assetPath));
    const prefabUuid = toNonEmptyString(assetInfo?.uuid);
    if (prefabUuid) {
      return prefabUuid;
    }

    errors.push("Prefab creation may have succeeded but could not retrieve prefab UUID");
    return null;
  } catch (error) {
    errors.push(`Prefab creation completed but failed to query prefab info: ${toErrorMessage(error)}`);
    return null;
  }
}

export async function resolvePrefabAsset(
  request: EditorMessageRequest,
  assetToOpenUrlOrUuid: string
): Promise<{ uuid: string; name?: string }> {
  if (assetToOpenUrlOrUuid.startsWith("db://")) {
    return resolvePrefabAssetByUrl(request, assetToOpenUrlOrUuid);
  }

  const prefabUuid = decodeUuid(assetToOpenUrlOrUuid);
  const assetInfo = await request("asset-db", "query-asset-info", prefabUuid);
  return validatePrefabAsset(assetToOpenUrlOrUuid, prefabUuid, assetInfo);
}

async function resolvePrefabAssetByUrl(
  request: EditorMessageRequest,
  assetUrl: string
): Promise<{ uuid: string; name?: string }> {
  const prefabUuid = await request("asset-db", "query-uuid", assetUrl);
  if (!prefabUuid || typeof prefabUuid !== "string") {
    throw new Error(`Prefab asset not found at URL: ${assetUrl}`);
  }

  const assetInfo = await request("asset-db", "query-asset-info", prefabUuid);
  return validatePrefabAsset(assetUrl, prefabUuid, assetInfo);
}

function validatePrefabAsset(
  input: string,
  prefabUuid: string,
  assetInfo: unknown
): { uuid: string; name?: string } {
  const record = toRecord(assetInfo);
  if (!record) {
    throw new Error(`Prefab asset not found for UUID: ${input}`);
  }

  const assetType = toNonEmptyString(record.type);
  const assetUrl = toNonEmptyString(record.url);
  if (assetType !== "cc.Prefab" && !(assetUrl?.endsWith(".prefab") ?? false)) {
    throw new Error(`Asset '${input}' is not a prefab (type: ${assetType ?? "unknown"})`);
  }

  return {
    uuid: prefabUuid,
    name: toNonEmptyString(record.name),
  };
}

export async function queryActivePrefabInfo(request: EditorMessageRequest): Promise<Record<string, unknown> | null> {
  try {
    return toRecord(await request("scene", "query-prefab-info"));
  } catch {
    return null;
  }
}

export async function runPrefabCloseStep(
  request: EditorMessageRequest,
  errors: string[],
  command: "save-scene" | "close-scene",
  prefix: string
): Promise<void> {
  try {
    await request("scene", command);
  } catch (error) {
    errors.push(`${prefix}: ${toErrorMessage(error)}`);
  }
}

function extractUuidValue(input: unknown): string | null {
  if (typeof input === "string") {
    return input;
  }

  const record = toRecord(input);
  if (!record) {
    return null;
  }

  return (
    toNonEmptyString(record.uuid) ??
    extractUuidValue(record.uuid) ??
    toNonEmptyString(record.value) ??
    extractUuidValue(record.value) ??
    null
  );
}

function extractPrefabUuidFromNodeInfo(nodeInfo: unknown): string | null {
  const record = toRecord(nodeInfo);
  const prefabInfo = record?.__prefab__ ?? record?._prefab ?? record?.prefab;
  const prefabRecord = toRecord(prefabInfo);

  return (
    extractUuidValue(prefabRecord?.uuid) ??
    extractUuidValue(prefabRecord?.assetUuid) ??
    extractUuidValue(toRecord(prefabRecord?.asset)?.uuid) ??
    null
  );
}

async function queryNodeInfoSafe(request: EditorMessageRequest, nodeUuid: string): Promise<QueryNodeResult | null> {
  try {
    const nodeInfo = await request("scene", "query-node", nodeUuid);
    return toRecord(nodeInfo) as QueryNodeResult | null;
  } catch {
    return null;
  }
}

function findLinkedNodeUuidInTree(tree: unknown, prefabUuid: string): string | null {
  const treeRecord = toRecord(tree);
  const rootChildren = Array.isArray(treeRecord?.children) ? treeRecord.children : [];
  const stack = [...rootChildren];

  while (stack.length > 0) {
    const node = stack.pop();
    const nodeRecord = toRecord(node);
    if (!nodeRecord) {
      continue;
    }

    if (extractPrefabUuidFromNodeInfo(nodeRecord) === prefabUuid) {
      const nodeUuid = extractUuidValue(nodeRecord.uuid);
      if (nodeUuid) {
        return nodeUuid;
      }
    }

    if (Array.isArray(nodeRecord.children) && nodeRecord.children.length > 0) {
      stack.push(...nodeRecord.children);
    }
  }

  return null;
}

export async function resolveLinkedNodeUuid(
  request: EditorMessageRequest,
  originalNodeUuid: string,
  prefabUuid: string
): Promise<string | null> {
  const originalNode = await queryNodeInfoSafe(request, originalNodeUuid);
  if (originalNode && extractPrefabUuidFromNodeInfo(originalNode) === prefabUuid) {
    return originalNodeUuid;
  }

  const linkedNodeUuid = await resolveLinkedNodeByAssetQuery(request, prefabUuid);
  if (linkedNodeUuid) {
    return linkedNodeUuid;
  }

  try {
    const sceneTree = await request("scene", "query-node-tree");
    return findLinkedNodeUuidInTree(sceneTree, prefabUuid);
  } catch {
    return null;
  }
}

async function resolveLinkedNodeByAssetQuery(
  request: EditorMessageRequest,
  prefabUuid: string
): Promise<string | null> {
  try {
    const candidates = await request("scene", "query-nodes-by-asset-uuid", prefabUuid);
    if (!Array.isArray(candidates)) {
      return null;
    }

    let fallbackCandidate: string | null = null;
    for (const candidate of candidates) {
      if (typeof candidate !== "string") {
        continue;
      }

      fallbackCandidate ??= candidate;
      const candidateInfo = await queryNodeInfoSafe(request, candidate);
      if (candidateInfo && extractPrefabUuidFromNodeInfo(candidateInfo) === prefabUuid) {
        return candidate;
      }
    }

    return fallbackCandidate;
  } catch {
    return null;
  }
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
