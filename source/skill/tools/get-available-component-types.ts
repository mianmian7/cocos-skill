import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { runToolWithContext } from "../runtime/tool-runtime.js";

export function registerGetAvailableComponentTypesTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_available_component_types",
    {
      title: "Get Available Component Types",
      description: "Get available component types",
      inputSchema: {
        nameFilter: z.string().optional().describe("Optional substring to filter component types")
      }
    },
    async ({ nameFilter }) =>
      runToolWithContext(
        {
          toolName: "get_available_component_types",
          operation: "list-component-types",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const result = await request("scene", "execute-scene-script", {
            name: packageJSON.name,
            method: "queryComponentTypes",
            args: [],
          });

          if (!Array.isArray(result)) {
            throw new Error("Unexpected component type query result");
          }

          const componentTypes = result.filter(
            (type): type is string => typeof type === "string" && (!nameFilter || type.includes(nameFilter))
          );

          return {
            data: { componentTypes },
            warnings:
              componentTypes.length === 0
                ? [`No component types found${nameFilter ? ` with name filter '${nameFilter}'` : ""}`]
                : [],
          };
        }
      )
  );
}
