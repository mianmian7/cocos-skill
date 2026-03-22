import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { getComponentInfo } from "../tool-utils";

async function queryComponents(args: {
  componentUuids: string[];
  includeTooltips: boolean;
  hideInternalProps: boolean;
}) {
  const components: any[] = [];
  const warnings: string[] = [];

  for (const componentUuid of args.componentUuids) {
    try {
      const componentInfo = await getComponentInfo(componentUuid, true, args.includeTooltips);
      if (componentInfo.error) {
        warnings.push(`Component ${componentUuid}: ${componentInfo.error}`);
        continue;
      }

      const result: any = {
        uuid: componentUuid,
        type: componentInfo.type || "Unknown",
      };

      if (componentInfo.properties && Object.keys(componentInfo.properties).length > 0) {
        let propertyPaths = Object.keys(componentInfo.properties);
        if (args.hideInternalProps) {
          propertyPaths = propertyPaths.filter(
            (propertyPath) =>
              !propertyPath.startsWith("_")
              && !propertyPath.includes("__")
              && !propertyPath.includes("internal")
              && !propertyPath.includes("debug")
          );
        }

        result.properties = propertyPaths.map((propertyPath) => {
          const property = componentInfo.properties?.[propertyPath];
          return {
            path: propertyPath,
            type: property?.type || "Unknown",
            value: property?.value,
            ...(args.includeTooltips && property?.tooltip ? { tooltip: property.tooltip } : {}),
            ...(property?.enumList?.length ? { enumValues: property.enumList } : {}),
          };
        });
      }

      components.push(result);
    } catch (error) {
      warnings.push(`Error querying component ${componentUuid}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  return { components, warnings };
}

export function registerQueryComponentsTool(server: ToolRegistrar): void {
  server.registerTool(
    "query_components",
    {
      title: "Query Component Properties",
      description: "Returns component property details with types, values, and tooltips.",
      inputSchema: {
        componentUuids: z.array(z.string()).describe("Array of component UUIDs to query"),
        includeTooltips: z.boolean().default(false).describe("Get property descriptions/tooltips"),
        hideInternalProps: z.boolean().default(false).describe("Filter out internal properties")
      }
    },
    async (args) =>
      runToolWithContext(
        {
          toolName: "query_components",
          operation: "query-components",
          effect: "read",
          packageName: packageJSON.name,
        },
        async () => {
          const result = await queryComponents(args);
          return {
            data: { components: result.components },
            warnings: result.warnings,
          };
        }
      )
  );
}
