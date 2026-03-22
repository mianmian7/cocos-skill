import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { getComponentInfo } from "../tool-utils.js";

import { buildTsForComponent } from "../definitions/ts-gen.js";
import { extractComponentPropertyDefinitions } from "../definitions/component-definition.js";

async function buildComponentDefinitions(args: {
  componentUuids: string[];
  includeTooltips: boolean;
  hideInternalProps: boolean;
  includeTs: boolean;
}) {
  const components: any[] = [];
  const warnings: string[] = [];

  for (const componentUuid of args.componentUuids) {
    try {
      const info = await getComponentInfo(componentUuid, true, args.includeTooltips);
      if (info.error) {
        warnings.push(`Component ${componentUuid}: ${info.error}`);
        continue;
      }

      const definition: any = {
        uuid: componentUuid,
        type: info.type || "Unknown",
        properties: extractComponentPropertyDefinitions(info, {
          includeTooltips: args.includeTooltips,
          hideInternalProps: args.hideInternalProps,
        }),
      };

      if (args.includeTs) {
        definition.ts = buildTsForComponent(definition);
      }

      components.push(definition);
    } catch (error) {
      warnings.push(
        `Error building definition for component ${componentUuid}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { components, warnings };
}

export function registerGetComponentDefinitionsTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_component_definitions",
    {
      title: "Get Component Definitions",
      description:
        "Returns component property definitions (path -> type), optional tooltips/enums, and optional TypeScript fragments to help AI avoid hallucinating property names/types.",
      inputSchema: {
        componentUuids: z.array(z.string()).describe("Array of component UUIDs"),
        includeTooltips: z.boolean().default(false).describe("Include translated tooltips when available"),
        hideInternalProps: z.boolean().default(true).describe("Filter out internal/private properties"),
        includeTs: z.boolean().default(false).describe("Include TypeScript fragments (path union + type map)"),
      },
    },
    async (args) =>
      runToolWithContext(
        {
          toolName: "get_component_definitions",
          operation: "get-component-definitions",
          effect: "read",
          packageName: packageJSON.name,
        },
        async () => {
          const result = await buildComponentDefinitions(args);
          return {
            data: { components: result.components },
            warnings: result.warnings,
          };
        }
      )
  );
}
