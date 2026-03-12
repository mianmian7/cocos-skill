import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { getComponentInfo } from "../tool-utils.js";

import { buildTsForComponent } from "../definitions/ts-gen.js";
import { extractComponentPropertyDefinitions } from "../definitions/component-definition.js";

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
    async (args) => {
      const { componentUuids, includeTooltips, hideInternalProps, includeTs } = args;

      const components: any[] = [];
      const errors: string[] = [];

      for (const componentUuid of componentUuids) {
        try {
          const info = await getComponentInfo(componentUuid, true, includeTooltips);
          if (info.error) {
            errors.push(`Component ${componentUuid}: ${info.error}`);
            continue;
          }

          const type = info.type || "Unknown";

          const properties = extractComponentPropertyDefinitions(info, {
            includeTooltips,
            hideInternalProps,
          });

          const def: any = {
            uuid: componentUuid,
            type,
            properties,
          };

          if (includeTs) {
            def.ts = buildTsForComponent(def);
          }

          components.push(def);
        } catch (e) {
          errors.push(
            `Error building definition for component ${componentUuid}: ${e instanceof Error ? e.message : String(e)}`
          );
        }
      }

      const result = {
        operation: "get-component-definitions",
        components,
        errors: errors.length > 0 ? errors : undefined,
      };

      return {
        content: [
          {
            type: "text",
            text: JSON.stringify(result),
          },
        ],
      };
    }
  );
}
