import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";

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

function matchPattern(text: string, pattern: string): boolean {
  if (!pattern) return true;
  // 将 * 通配符转换为正则表达式
  const regex = new RegExp('^' + pattern.replace(/\*/g, '.*').replace(/\?/g, '.') + '$', 'i');
  return regex.test(text);
}

async function searchNodes(options: SearchOptions): Promise<{
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
  let total = 0;

  try {
    const tree: any = await Editor.Message.request('scene', 'query-node-tree');
    if (!tree) {
      return { results: [], total: 0, hasMore: false };
    }

    // 收集所有匹配的节点
    const allMatches: { uuid: string; name: string; path: string }[] = [];

    const traverse = (node: any, currentPath: string) => {
      const nodePath = currentPath ? `${currentPath}/${node.name}` : node.name;
      
      // 检查名称匹配
      const nameMatch = !namePattern || matchPattern(node.name || '', namePattern);
      // 检查路径匹配
      const pathMatch = !pathPattern || matchPattern(nodePath, pathPattern);

      if (nameMatch && pathMatch) {
        allMatches.push({
          uuid: node.uuid,
          name: node.name || 'Unknown',
          path: nodePath
        });
      }

      // 递归子节点
      if (node.children) {
        for (const child of node.children) {
          traverse(child, nodePath);
        }
      }
    };

    // 遍历所有根节点
    let roots: any[] = [];
    if (Array.isArray(tree)) {
      roots = tree;
    } else if (tree.children) {
      roots = tree.children;
    }

    for (const root of roots) {
      traverse(root, '');
    }

    // 如果需要按组件过滤，需要查询每个节点的详细信息
    if (componentType) {
      for (const match of allMatches) {
        try {
          const nodeInfo: any = await Editor.Message.request('scene', 'query-node', match.uuid);
          if (nodeInfo && nodeInfo.__comps__) {
            const components = nodeInfo.__comps__.map((c: any) => c.type || c.cid || '');
            const hasComponent = components.some((c: string) => 
              c.toLowerCase().includes(componentType.toLowerCase())
            );
            if (hasComponent) {
              total++;
              if (total > offset && results.length < limit) {
                results.push({
                  uuid: match.uuid,
                  name: match.name,
                  path: match.path,
                  components
                });
              }
            }
          }
        } catch {
          // ignore
        }
      }
    } else {
      // 不需要组件过滤，直接分页
      total = allMatches.length;
      const paged = allMatches.slice(offset, offset + limit);
      
      // 获取组件信息
      for (const match of paged) {
        try {
          const nodeInfo: any = await Editor.Message.request('scene', 'query-node', match.uuid);
          const components = nodeInfo?.__comps__?.map((c: any) => c.type || c.cid || '') || [];
          results.push({
            uuid: match.uuid,
            name: match.name,
            path: match.path,
            components
          });
        } catch {
          results.push({
            uuid: match.uuid,
            name: match.name,
            path: match.path,
            components: []
          });
        }
      }
    }
  } catch {
    // ignore
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
    async (args) => {
      const { namePattern, componentType, pathPattern, limit = 50, offset = 0 } = args;

      // 至少需要一个搜索条件
      if (!namePattern && !componentType && !pathPattern) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: "至少需要提供一个搜索条件：namePattern、componentType 或 pathPattern"
            }, null, 2)
          }],
          isError: true
        };
      }

      const result = await searchNodes({
        namePattern,
        componentType,
        pathPattern,
        limit: Math.min(limit, 100),
        offset: Math.max(offset, 0)
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            ...result,
            query: { namePattern, componentType, pathPattern, limit, offset }
          }, null, 2)
        }]
      };
    }
  );
}
