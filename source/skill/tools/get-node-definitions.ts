import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { buildTsForNode } from "../definitions/ts-gen.js";
import { extractNodePropertyDefinitions } from "../definitions/node-definition.js";

export function registerGetNodeDefinitionsTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_node_definitions",
    {
      title: "Get Node Definitions",
      description:
        "Returns node property definitions (path -> type) from Cocos Creator node dump. Optional TypeScript fragments. Use before modify_nodes/editor_request set-property to avoid guessing paths/types.",
      inputSchema: {
        nodeUuids: z.array(z.string()).describe("Array of node UUIDs"),
        includeTooltips: z.boolean().default(false).describe("Include tooltip keys when present in dump"),
        hideInternalProps: z.boolean().default(true).describe("Filter out internal/private properties"),
        includeTs: z.boolean().default(false).describe("Include TypeScript fragments (path union + type map)"),
      },
    },
    async (args) => {
      const { nodeUuids, includeTooltips, hideInternalProps, includeTs } = args;

      const nodes: any[] = [];
      const errors: string[] = [];

      for (const nodeUuidEncoded of nodeUuids) {
        try {
          const nodeUuid = decodeUuid(nodeUuidEncoded);
          const dump = await Editor.Message.request("scene", "query-node", nodeUuid);
          if (!dump) {
            errors.push(`Node ${nodeUuidEncoded}: not found`);
            continue;
          }

          const properties = extractNodePropertyDefinitions(dump, {
            includeTooltips,
            hideInternalProps,
          });

          const def: any = {
            uuid: encodeUuid(nodeUuid),
            properties,
          };

          if (includeTs) {
            def.ts = buildTsForNode({ uuid: def.uuid, properties });
          }

          nodes.push(def);
        } catch (e) {
          errors.push(`Error building definition for node ${nodeUuidEncoded}: ${e instanceof Error ? e.message : String(e)}`);
        }
      }

      const result = {
        operation: "get-node-definitions",
        nodes,
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
