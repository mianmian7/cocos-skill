import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { getComponentInfo } from "../tool-utils";

type EditorRequest = (channel: string, command: string, ...args: unknown[]) => Promise<unknown>;

type QueryNodesArgs = {
  nodeUuid?: string;
  includeProperties?: boolean;
  includeComponents?: boolean;
  includeComponentProperties?: boolean;
  maxDepth?: number;
};

type HierarchyOptions = Required<Omit<QueryNodesArgs, "nodeUuid">>;

function toNodeUuid(node: any): string | undefined {
  return node?.uuid?.value || node?.uuid;
}

async function queryNodeDetails(
  request: EditorRequest,
  node: any,
  warnings: string[]
): Promise<{ nodeUuid: string; nodeDetails: any } | null> {
  const nodeUuid = toNodeUuid(node);
  if (!nodeUuid) {
    warnings.push("Node does not have a valid UUID");
    return null;
  }

  try {
    const nodeDetails = await request("scene", "query-node", nodeUuid);
    return {
      nodeUuid,
      nodeDetails: nodeDetails || node,
    };
  } catch (error) {
    warnings.push(
      `Failed to query node details for ${nodeUuid}: ${error instanceof Error ? error.message : String(error)}`
    );
    return {
      nodeUuid,
      nodeDetails: node,
    };
  }
}

function buildNodeProperties(nodeDetails: any) {
  return {
    position: nodeDetails.position?.value || nodeDetails.position || { x: 0, y: 0, z: 0 },
    eulerAngles: nodeDetails.rotation?.value || nodeDetails.rotation || { x: 0, y: 0, z: 0 },
    scale: nodeDetails.scale?.value || nodeDetails.scale || { x: 1, y: 1, z: 1 },
    enabled: nodeDetails.active?.value ?? nodeDetails.active ?? true,
    layer: nodeDetails.layer?.value || nodeDetails.layer || 0,
    mobility: nodeDetails.mobility?.value || nodeDetails.mobility || 0,
  };
}

function getNodeComponents(node: any, nodeDetails: any) {
  const componentSource = nodeDetails.__comps__ || node.__comps__ || node.components || [];
  if (!Array.isArray(componentSource) || componentSource.length === 0) {
    return [];
  }

  return componentSource.map((component: any) => ({
    uuid: encodeUuid(component.value?.uuid?.value || component.value?.uuid || component.uuid),
    type: component.value?.name?.value || component.value?.name || component.name || component.type,
  }));
}

async function buildDetailedComponents(
  components: Array<{ uuid: string; type: string }>,
  includeComponentProperties: boolean,
  warnings: string[]
) {
  const results: Array<Record<string, unknown>> = [];

  for (const component of components) {
    const componentInfo: Record<string, unknown> = {
      uuid: component.uuid,
      type: component.type,
    };

    if (includeComponentProperties) {
      try {
        const componentDetails = await getComponentInfo(component.uuid, true, false);
        if (componentDetails.properties) {
          componentInfo.properties = componentDetails.properties;
        }
      } catch (error) {
        warnings.push(
          `Failed to get properties for component ${component.uuid}: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    }

    results.push(componentInfo);
  }

  return results;
}

async function buildHierarchy(
  request: EditorRequest,
  node: any,
  options: HierarchyOptions,
  warnings: string[],
  currentDepth = 0
): Promise<Record<string, unknown> | null> {
  const details = await queryNodeDetails(request, node, warnings);
  if (!details) {
    return null;
  }

  const result: Record<string, unknown> = {
    name: details.nodeDetails.name?.value || details.nodeDetails.name || "Unnamed Node",
    uuid: encodeUuid(details.nodeUuid),
  };

  if (options.includeProperties) {
    result.properties = buildNodeProperties(details.nodeDetails);
  }

  const shouldIncludeComponents = options.includeComponents || options.includeComponentProperties;
  if (shouldIncludeComponents) {
    const components = getNodeComponents(node, details.nodeDetails);
    if (components.length > 0) {
      result.components = await buildDetailedComponents(components, options.includeComponentProperties, warnings);
    }
  }

  const shouldIncludeChildren = currentDepth < options.maxDepth;
  const children = node.children || node.__children__ || [];
  if (shouldIncludeChildren && Array.isArray(children) && children.length > 0) {
    const childResults: Array<Record<string, unknown>> = [];
    for (const child of children) {
      const childResult = await buildHierarchy(request, child, options, warnings, currentDepth + 1);
      if (childResult) {
        childResults.push(childResult);
      }
    }

    if (childResults.length > 0) {
      result.children = childResults;
    }
  }

  return result;
}

export function registerQueryNodesTool(server: ToolRegistrar): void {
  server.registerTool(
    "query_nodes",
    {
      title: "Query Node Hierarchy",
      description: `Inspects node hierarchy with configurable detail levels and depth limits.

**Best Practices to avoid excessive data:**
- Start with low maxDepth (1-3) to understand overall structure
- Use nodeUuid to drill into specific branches after getting their UUIDs
- Only enable includeComponents/includeProperties when needed
- For large scenes, query specific nodes rather than entire hierarchy`,
      inputSchema: {
        nodeUuid: z.string().optional().describe("Node UUID (defaults to scene root)"),
        includeProperties: z.boolean().default(false).describe("Include transform properties"),
        includeComponents: z.boolean().default(false).describe("Include component list"),
        includeComponentProperties: z.boolean().default(false).describe("Include component details"),
        maxDepth: z.number().default(2).describe("Hierarchy depth limit. DO NOT specify unless you need deeper than 2 levels. Default 2 is sufficient for initial exploration."),
      }
    },
    async (args: QueryNodesArgs) =>
      runToolWithContext(
        {
          toolName: "query_nodes",
          operation: "query-nodes",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const warnings: string[] = [];
          const options: HierarchyOptions = {
            includeProperties: args.includeProperties ?? false,
            includeComponents: args.includeComponents ?? false,
            includeComponentProperties: args.includeComponentProperties ?? false,
            maxDepth: args.maxDepth ?? 2,
          };
          const decodedUuid = args.nodeUuid ? decodeUuid(args.nodeUuid) : undefined;
          const nodeTree = decodedUuid
            ? await request("scene", "query-node-tree", decodedUuid)
            : await request("scene", "query-node-tree");

          if (!nodeTree) {
            warnings.push(args.nodeUuid ? `Node with UUID ${args.nodeUuid} not found` : "No scene loaded");
            return {
              data: { hierarchy: null },
              warnings,
            };
          }

          return {
            data: {
              hierarchy: await buildHierarchy(request, nodeTree, options, warnings),
            },
            warnings,
          };
        }
      )
  );
}
