import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { encodeUuid } from "../uuid-codec.js";

/**
 * search_nodes - 场景节点搜索工具
 * 
 * 按条件搜索场景中的节点：
 * - 按名称模式匹配（支持 * 通配符）
 * - 按组件类型过滤
 * - 按路径模式匹配
 * - 分页支持
 */

interface SearchResult {
  uuid: string;
  name: string;
  path: string;
  components: string[];
}

interface SearchOptions {
  namePattern?: string;      // 名称匹配（支持 * 通配符）
  componentType?: string;    // 包含指定组件
  pathPattern?: string;      // 路径匹配（支持 * 通配符）
  limit?: number;            // 返回数量限制
  offset?: number;           // 分页偏移
}

type EditorRequest = (channel: string, command: string, ...args: unknown[]) => Promise<unknown>;

function matchPattern(text: string, pattern: string): boolean {
  if (!pattern) return true;
  // 将 * 通配符转换为正则表达式
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return regex.test(text);
}

function collectMatches(node: any, currentPath: string, options: SearchOptions, matches: Array<{ uuid: string; name: string; path: string }>): void {
  const nodeName = node?.name || "Unknown";
  const nodePath = currentPath ? `${currentPath}/${nodeName}` : nodeName;
  const nodeUuid = node?.uuid;

  const nameMatch = !options.namePattern || matchPattern(nodeName, options.namePattern);
  const pathMatch = !options.pathPattern || matchPattern(nodePath, options.pathPattern);
  if (nodeUuid && nameMatch && pathMatch) {
    matches.push({
      uuid: nodeUuid,
      name: nodeName,
      path: nodePath,
    });
  }

  if (Array.isArray(node?.children)) {
    for (const child of node.children) {
      collectMatches(child, nodePath, options, matches);
    }
  }
}

async function getNodeComponents(request: EditorRequest, nodeUuid: string): Promise<string[]> {
  try {
    const nodeInfo: any = await request("scene", "query-node", nodeUuid);
    if (!Array.isArray(nodeInfo?.__comps__)) {
      return [];
    }
    return nodeInfo.__comps__.map((component: any) => component.type || component.cid || "");
  } catch {
    return [];
  }
}

async function searchNodes(
  request: EditorRequest,
  options: SearchOptions
): Promise<{
  results: SearchResult[];
  total: number;
  hasMore: boolean;
}> {
  const {
    namePattern,
    componentType,
    pathPattern,
    limit = 50,
    offset = 0
  } = options;

  const results: SearchResult[] = [];
  const tree: any = await request("scene", "query-node-tree");
  if (!tree) {
    return { results: [], total: 0, hasMore: false };
  }

  const allMatches: Array<{ uuid: string; name: string; path: string }> = [];
  const roots = Array.isArray(tree) ? tree : [tree];
  for (const root of roots) {
    collectMatches(root, "", { namePattern, pathPattern }, allMatches);
  }

  const filteredMatches: Array<{ uuid: string; name: string; path: string; components: string[] }> = [];
  for (const match of allMatches) {
    const components = await getNodeComponents(request, match.uuid);
    const hasComponent = !componentType
      || components.some((entry) => entry.toLowerCase().includes(componentType.toLowerCase()));

    if (hasComponent) {
      filteredMatches.push({
        ...match,
        components,
      });
    }
  }

  const total = filteredMatches.length;
  const paged = filteredMatches.slice(offset, offset + limit);
  for (const match of paged) {
    results.push({
      uuid: encodeUuid(match.uuid),
      name: match.name,
      path: match.path,
      components: match.components,
    });
  }

  return {
    results,
    total,
    hasMore: offset + results.length < total
  };
}

export function registerSearchNodesTool(server: ToolRegistrar): void {
  server.registerTool(
    'search_nodes',
    {
      title: "Search Nodes",
      description: `按条件搜索场景中的节点。

**支持的搜索条件：**
- namePattern: 名称匹配（支持 * 通配符，如 "Enemy*"、"*Button*"）
- componentType: 包含指定组件（如 "Sprite"、"RigidBody"）
- pathPattern: 路径匹配（如 "Canvas/*"、"*/Enemies/*"）

**分页支持：**
- limit: 返回数量限制（默认 50，最大 100）
- offset: 分页偏移

**使用示例：**
1. 查找所有名称包含 "Enemy" 的节点
2. 查找所有带 Sprite 组件的节点
3. 查找 Canvas 下的所有按钮

**大场景处理：**
- 先用 search_nodes 找到目标节点
- 再用 editor_request + query-node 获取详情
- 或用 editor_request + set-property 修改`,
      inputSchema: {
        namePattern: z.string().optional().describe("名称匹配模式（支持 * 通配符，如 'Enemy*'）"),
        componentType: z.string().optional().describe("包含指定组件类型（如 'Sprite'、'RigidBody'）"),
        pathPattern: z.string().optional().describe("路径匹配模式（如 'Canvas/*'）"),
        limit: z.number().min(1).max(100).default(50).describe("返回数量限制（1-100）"),
        offset: z.number().min(0).default(0).describe("分页偏移")
      }
    },
    async (args) =>
      runToolWithContext(
        {
          toolName: "search_nodes",
          operation: "search-nodes",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const { namePattern, componentType, pathPattern, limit = 50, offset = 0 } = args;
          const query = { namePattern, componentType, pathPattern, limit, offset };

          if (!namePattern && !componentType && !pathPattern) {
            return {
              success: false,
              data: {
                results: [],
                total: 0,
                hasMore: false,
                query,
              },
              errors: ["至少需要提供一个搜索条件：namePattern、componentType 或 pathPattern"],
            };
          }

          const result = await searchNodes(request, {
            namePattern,
            componentType,
            pathPattern,
            limit: Math.min(limit, 100),
            offset: Math.max(offset, 0),
          });

          return {
            data: {
              ...result,
              query,
            },
            warnings: result.total === 0 ? ["No nodes found matching the provided filters"] : [],
          };
        }
      )
  );
}
