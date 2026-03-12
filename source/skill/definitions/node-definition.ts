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

function flattenDumpProperties(
  dump: any,
  basePath = "",
  out: NodePropertyDefinition[] = []
): NodePropertyDefinition[] {
  if (!dump || typeof dump !== "object") return out;

  for (const key of Object.keys(dump)) {
    if (key.startsWith("_")) continue;

    const currentPath = basePath ? `${basePath}.${key}` : key;
    const value = dump[key];

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
        flattenDumpProperties(value.value, currentPath, out);
      } else {
        out.push({ path: currentPath, type, tooltip, enumValues });
      }
      continue;
    }

    if (value && typeof value === "object" && !Array.isArray(value)) {
      flattenDumpProperties(value, currentPath, out);
    }
  }

  return out;
}

export function extractNodePropertyDefinitions(
  dump: any,
  options: {
    includeTooltips: boolean;
    hideInternalProps: boolean;
  }
): NodePropertyDefinition[] {
  const { includeTooltips, hideInternalProps } = options;

  let defs = flattenDumpProperties(dump);

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
