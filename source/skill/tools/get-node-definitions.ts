import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { buildTsForNode } from "../definitions/ts-gen.js";
import { extractNodePropertyDefinitions } from "../definitions/node-definition.js";

type EditorRequest = (channel: string, command: string, ...args: unknown[]) => Promise<unknown>;

async function buildNodeDefinitions(
  request: EditorRequest,
  args: {
    nodeUuids: string[];
    includeTooltips: boolean;
    hideInternalProps: boolean;
    includeTs: boolean;
  }
) {
  const nodes: any[] = [];
  const warnings: string[] = [];

  for (const nodeUuidEncoded of args.nodeUuids) {
    try {
      const nodeUuid = decodeUuid(nodeUuidEncoded);
      const dump = await request("scene", "query-node", nodeUuid);
      if (!dump) {
        warnings.push(`Node ${nodeUuidEncoded}: not found`);
        continue;
      }

      const properties = extractNodePropertyDefinitions(dump, {
        includeTooltips: args.includeTooltips,
        hideInternalProps: args.hideInternalProps,
      });

      const definition: any = {
        uuid: encodeUuid(nodeUuid),
        properties,
      };

      if (args.includeTs) {
        definition.ts = buildTsForNode({ uuid: definition.uuid, properties });
      }

      nodes.push(definition);
    } catch (error) {
      warnings.push(
        `Error building definition for node ${nodeUuidEncoded}: ${error instanceof Error ? error.message : String(error)}`
      );
    }
  }

  return { nodes, warnings };
}

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
        hideInternalProps: z.boolean().default(true).describe("Filter out internal/private properties. If false, include underscore-prefixed paths like __comps__/__children__ for troubleshooting."),
        includeTs: z.boolean().default(false).describe("Include TypeScript fragments (path union + type map)"),
      },
    },
    async (args) =>
      runToolWithContext(
        {
          toolName: "get_node_definitions",
          operation: "get-node-definitions",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const result = await buildNodeDefinitions(request, args);
          return {
            data: { nodes: result.nodes },
            warnings: result.warnings,
          };
        }
      )
  );
}
