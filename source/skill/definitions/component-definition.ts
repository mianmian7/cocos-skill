import type { ComponentDescription } from "../tool-utils.js";

export type ComponentPropertyDefinition = {
  path: string;
  type: string;
  tooltip?: string;
  enumValues?: string[];
};

export function extractComponentPropertyDefinitions(
  info: ComponentDescription,
  options: {
    includeTooltips: boolean;
    hideInternalProps: boolean;
  }
): ComponentPropertyDefinition[] {
  const { includeTooltips, hideInternalProps } = options;
  const props = info.properties || {};

  let paths = Object.keys(props);

  if (hideInternalProps) {
    paths = paths.filter(
      (p) =>
        !p.startsWith("_") &&
        !p.includes("__") &&
        !p.toLowerCase().includes("internal") &&
        !p.toLowerCase().includes("debug")
    );
  }

  const definitions = paths
    .map((path) => {
      const meta = props[path] || ({} as any);
      return {
        path,
        type: meta.type || "Unknown",
        tooltip: includeTooltips ? meta.tooltip : undefined,
        enumValues: meta.enumList || undefined,
      } as ComponentPropertyDefinition;
    })
    .sort((a, b) => a.path.localeCompare(b.path));

  return definitions;
}

export function toComponentDefinitionMap(defs: ComponentPropertyDefinition[]): Map<string, ComponentPropertyDefinition> {
  const map = new Map<string, ComponentPropertyDefinition>();
  for (const d of defs) {
    if (!map.has(d.path)) {
      map.set(d.path, d);
    }
  }
  return map;
}
