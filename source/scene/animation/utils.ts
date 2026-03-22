import { asNonEmptyString } from "./value-coercion.js";

export function getCc(): any {
  const cc = (globalThis as any)["cc"];
  if (!cc) {
    throw new Error("cc is not available in scene context");
  }
  return cc;
}

export function findNodeByUuid(root: any, uuid: string): any | null {
  if (!root || typeof uuid !== "string" || uuid.length === 0) {
    return null;
  }

  const stack: any[] = [root];
  while (stack.length > 0) {
    const node = stack.pop();
    if (node?.uuid === uuid) {
      return node;
    }

    const children = node?.children;
    if (Array.isArray(children) && children.length > 0) {
      for (let i = children.length - 1; i >= 0; i -= 1) {
        stack.push(children[i]);
      }
    }
  }

  return null;
}

export function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

export function mapClipStatuses(statuses: unknown): Array<{ clip: { name?: string; uuid?: string }; weight: number }> {
  if (!statuses || typeof statuses !== "object") {
    return [];
  }

  const iterable = statuses as any;
  const result: Array<{ clip: { name?: string; uuid?: string }; weight: number }> = [];
  for (const entry of iterable) {
    const clip = entry?.clip;
    const clipName = asNonEmptyString(clip?.name);
    const clipUuid = asNonEmptyString(clip?.uuid);
    const weight = asNumber(entry?.weight) ?? 0;
    result.push({
      clip: {
        ...(clipName ? { name: clipName } : {}),
        ...(clipUuid ? { uuid: clipUuid } : {}),
      },
      weight,
    });
  }
  return result;
}

