export type NodePropertyDefinition = {
  path: string;
  type: string;
  tooltip?: string;
  enumValues?: string[];
};

function shouldHideInternal(path: string): boolean {
  const p = path.toLowerCase();
  return (
    path.startsWith("_") ||
    path.includes("__") ||
    p.includes("internal") ||
    p.includes("debug")
  );
}

type FlattenOptions = {
  skipUnderscoreKeys: boolean;
  maxArrayLength: number;
};

function flattenDumpProperties(
  dump: any,
  basePath = "",
  out: NodePropertyDefinition[] = [],
  options: FlattenOptions
): NodePropertyDefinition[] {
  if (!dump || typeof dump !== "object") return out;

  // Array: traverse each element with numeric path suffix
  if (Array.isArray(dump)) {
    const maxLen = Math.min(dump.length, options.maxArrayLength);
    for (let i = 0; i < maxLen; i++) {
      flattenDumpProperties(dump[i], basePath ? `${basePath}.${i}` : String(i), out, options);
    }
    return out;
  }

  for (const key of Object.keys(dump)) {
    if (options.skipUnderscoreKeys && key.startsWith("_")) {
      continue;
    }

    const currentPath = basePath ? `${basePath}.${key}` : key;
    const value = (dump as any)[key];

    // Cocos dump leaf: { type, value, tooltip?, enumList?, isArray? }
    if (value && typeof value === "object" && Object.prototype.hasOwnProperty.call(value, "value")) {
      const type = value.type || "Unknown";
      const tooltip = value.tooltip ? String(value.tooltip) : undefined;
      const enumValues = Array.isArray(value.enumList) ? value.enumList : undefined;

      const isComplex =
        value.value &&
        (typeof value.value === "object" || Array.isArray(value.value)) &&
        !["String", "Number", "Boolean", "cc.ValueType", "cc.Object"].includes(type);

      if (isComplex) {
        flattenDumpProperties(value.value, currentPath, out, options);
      } else {
        out.push({ path: currentPath, type, tooltip, enumValues });
      }
      continue;
    }

    if (value && typeof value === "object") {
      flattenDumpProperties(value, currentPath, out, options);
    }
  }

  return out;
}

export function extractNodePropertyDefinitions(
  dump: any,
  options: {
    includeTooltips: boolean;
    hideInternalProps: boolean;
    maxArrayLength?: number;
  }
): NodePropertyDefinition[] {
  const { includeTooltips, hideInternalProps, maxArrayLength } = options;

  let defs = flattenDumpProperties(dump, "", [], {
    // IMPORTANT: only skip underscore-prefixed keys when hideInternalProps=true.
    // When hideInternalProps=false, callers may explicitly want __comps__/__children__ paths.
    skipUnderscoreKeys: hideInternalProps,
    maxArrayLength: typeof maxArrayLength === "number" ? maxArrayLength : 50,
  });

  if (hideInternalProps) {
    defs = defs.filter((d) => !shouldHideInternal(d.path));
  }

  if (!includeTooltips) {
    defs = defs.map((d) => ({ path: d.path, type: d.type, enumValues: d.enumValues }));
  }

  // dedupe by path, keep first
  const map = new Map<string, NodePropertyDefinition>();
  for (const d of defs) {
    if (!map.has(d.path)) map.set(d.path, d);
  }

  return Array.from(map.values()).sort((a, b) => a.path.localeCompare(b.path));
}
