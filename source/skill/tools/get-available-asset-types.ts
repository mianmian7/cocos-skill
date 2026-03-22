import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { runToolWithContext } from "../runtime/tool-runtime.js";

export function registerGetAvailableAssetTypesTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_available_asset_types",
    {
      title: "Get Available Asset Types",
      description: "Get available asset types",
      inputSchema: {
        // No input parameters needed
      }
    },
    async () =>
      runToolWithContext(
        {
          toolName: "get_available_asset_types",
          operation: "list-asset-types",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const result = await request("scene", "execute-scene-script", {
            name: packageJSON.name,
            method: "queryAssetTypes",
            args: [],
          });

          if (!Array.isArray(result)) {
            throw new Error("Unexpected asset type query result");
          }

          const assetTypes = result.filter((type): type is string => typeof type === "string");
          return {
            data: { assetTypes },
            warnings: assetTypes.length === 0 ? ["No asset types found"] : [],
          };
        }
      )
  );
}
