import { decodeUuid, encodeUuid } from "../uuid-codec.js";

const MAX_UUID_DECODE_DEPTH = 10;
const MAX_UUID_ENCODE_DEPTH = 10;

type SelectionExecutionResult = {
  handled: boolean;
  result?: unknown;
};

function tryDecodeUuid(value: string): string {
  if (value.length <= 20) {
    return value;
  }

  try {
    return decodeUuid(value);
  } catch {
    return value;
  }
}

function decodeUuidsDeep(value: unknown, depth = 0): unknown {
  if (depth > MAX_UUID_DECODE_DEPTH) {
    return value;
  }

  if (typeof value === "string") {
    return tryDecodeUuid(value);
  }

  if (Array.isArray(value)) {
    return value.map((entry) => decodeUuidsDeep(entry, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = decodeUuidsDeep(entry, depth + 1);
    }
    return result;
  }

  return value;
}

export function processArgs(args: unknown[]): unknown[] {
  return args.map((arg) => decodeUuidsDeep(arg));
}

function toUuidList(value: unknown): string[] {
  if (typeof value === "string") {
    return [value];
  }

  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === "string");
  }

  return [];
}

function getSelectionSnapshot(selectionApi: any, type: string): string[] | null {
  if (typeof selectionApi?.getSelected !== "function") {
    return null;
  }

  try {
    return toUuidList(selectionApi.getSelected(type));
  } catch {
    return null;
  }
}

function updateSelection(selectionApi: any, type: string, uuids: string[]): boolean {
  if (typeof selectionApi?.update !== "function") {
    return false;
  }

  selectionApi.update(type, uuids);
  return true;
}

export function executeSelectionCommand(command: string, args: unknown[]): SelectionExecutionResult {
  const selectionApi = (Editor as any)?.Selection;
  const selectionApiType = typeof selectionApi;
  if (!selectionApi || (selectionApiType !== "object" && selectionApiType !== "function")) {
    return { handled: false };
  }

  if (command === "select" || command === "unselect") {
    const [type, uuidsRaw] = args;
    if (typeof type !== "string") {
      throw new Error(`selection:${command} requires first arg 'type' as string`);
    }

    const uuids = toUuidList(uuidsRaw);
    if (uuids.length === 0) {
      throw new Error(`selection:${command} requires second arg 'uuids' as string[] or string`);
    }

    const fn = selectionApi[command];
    if (typeof fn === "function") {
      fn.call(selectionApi, type, uuids);
      return {
        handled: true,
        result: { type, uuids, count: uuids.length },
      };
    }

    const currentSelection = getSelectionSnapshot(selectionApi, type);
    const nextSelection = command === "select"
      ? Array.from(new Set([...(currentSelection ?? []), ...uuids]))
      : (currentSelection ?? []).filter((uuid) => !uuids.includes(uuid));

    if (currentSelection && updateSelection(selectionApi, type, nextSelection)) {
      return {
        handled: true,
        result: { type, uuids, count: uuids.length },
      };
    }

    return { handled: false };
  }

  if (command === "clear") {
    const [type] = args;
    if (typeof type !== "string") {
      throw new Error("selection:clear requires first arg 'type' as string");
    }

    if (typeof selectionApi.clear === "function") {
      selectionApi.clear(type);
      return {
        handled: true,
        result: { type, cleared: true },
      };
    }

    if (updateSelection(selectionApi, type, [])) {
      return {
        handled: true,
        result: { type, cleared: true },
      };
    }

    return { handled: false };
  }

  return { handled: false };
}

function isLikelyUuid(value: string): boolean {
  return value.length > 30 && value.includes("-");
}

export function encodeUuidsInResult(value: any, depth = 0): any {
  if (depth > MAX_UUID_ENCODE_DEPTH) {
    return value;
  }

  if (typeof value === "string" && isLikelyUuid(value)) {
    try {
      return encodeUuid(value);
    } catch {
      return value;
    }
  }

  if (Array.isArray(value)) {
    return value.map((entry) => encodeUuidsInResult(entry, depth + 1));
  }

  if (typeof value === "object" && value !== null) {
    const result: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value)) {
      result[key] = encodeUuidsInResult(entry, depth + 1);
    }
    return result;
  }

  return value;
}

export function limitNodeTree(tree: any, maxDepth: number, maxNodes: number): any {
  let nodeCount = 0;

  function processNode(node: any, depth: number): any {
    if (nodeCount >= maxNodes) {
      return null;
    }
    nodeCount += 1;

    const limited: Record<string, unknown> = {
      uuid: node.uuid,
      name: node.name,
      childCount: node.children?.length || 0,
    };

    if (depth < maxDepth && Array.isArray(node.children) && node.children.length > 0) {
      const children: unknown[] = [];
      for (const child of node.children) {
        if (nodeCount >= maxNodes) {
          limited.childrenTruncated = true;
          break;
        }

        const processedChild = processNode(child, depth + 1);
        if (processedChild) {
          children.push(processedChild);
        }
      }
      if (children.length > 0) {
        limited.children = children;
      }
    } else if (Array.isArray(node.children) && node.children.length > 0) {
      limited.hasChildren = true;
      limited.childrenOmitted = node.children.length;
    }

    return limited;
  }

  const roots = Array.isArray(tree) ? tree : tree?.children || [];
  if (!Array.isArray(roots)) {
    return tree;
  }

  const nodes: unknown[] = [];
  for (const root of roots) {
    if (nodeCount >= maxNodes) {
      break;
    }

    const processed = processNode(root, 0);
    if (processed) {
      nodes.push(processed);
    }
  }

  return { nodes, totalProcessed: nodeCount, maxDepth, maxNodes };
}

export function simplifyNodeInfo(node: any, summarize: boolean): any {
  if (!node || !summarize) {
    return node;
  }

  const simplified: Record<string, unknown> = {
    uuid: node.uuid,
    name: node.name?.value || node.name,
    active: node.active?.value ?? true,
    position: node.position?.value,
    rotation: node.euler?.value || node.rotation?.value,
    scale: node.scale?.value,
    layer: node.layer?.value,
  };

  if (Array.isArray(node.__comps__)) {
    simplified.components = node.__comps__.map((component: any) => ({
      type: component.type || component.cid,
      enabled: component.enabled?.value ?? true,
      ...(component.color?.value ? { color: component.color.value } : {}),
      ...(component.spriteFrame?.value ? { spriteFrame: component.spriteFrame.value.uuid } : {}),
    }));
  }

  const children = node.__children__ || node.children;
  if (Array.isArray(children)) {
    simplified.childCount = children.length;
  }

  return simplified;
}
