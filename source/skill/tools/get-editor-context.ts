import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";

/**
 * get_editor_context - 编辑器上下文快照工具
 * 
 * 提供编辑器当前状态的结构化快照，支持：
 * - summaryOnly 模式：只返回 uuid+name+childCount，可处理大场景（3000+ 节点）
 * - 普通模式：返回完整信息，适合中小场景
 */

interface NodeSummary {
  uuid: string;
  name: string;
  path?: string;
  childCount: number;
  components?: string[];
  children?: NodeSummary[];  // summaryOnly 模式下包含子节点
}

interface EditorContext {
  mode: 'scene' | 'prefab' | 'unknown';
  currentScene?: string;
  currentPrefab?: string;
  isDirty: boolean;
  selectedNodes: NodeSummary[];
  hierarchy?: {
    rootNodes: NodeSummary[];
    totalNodeCount: number;
    truncated?: boolean;  // 是否被截断
  };
  recentLogs?: string[];
  editorVersion?: string;
  projectPath?: string;
}

interface GetContextOptions {
  includeHierarchy?: boolean;
  includeRecentLogs?: boolean;
  summaryOnly?: boolean;      // 新：极简模式
  maxDepth?: number;
  maxNodes?: number;
  maxLogLines?: number;
  parentUuid?: string;        // 新：只查询某个父节点下的子节点
}

async function getEditorContext(options: GetContextOptions): Promise<EditorContext> {
  const {
    includeHierarchy = true,
    includeRecentLogs = true,
    summaryOnly = false,
    maxDepth = 2,
    maxNodes = 100,
    maxLogLines = 20,
    parentUuid
  } = options;

  // summaryOnly 模式下允许更多节点（因为数据量小）
  const effectiveMaxNodes = summaryOnly ? Math.min(maxNodes, 5000) : Math.min(maxNodes, 500);

  const context: EditorContext = {
    mode: 'unknown',
    isDirty: false,
    selectedNodes: []
  };

  // 1. 获取当前场景信息
  try {
    const sceneInfo: any = await Editor.Message.request('scene', 'query-scene-info');
    if (sceneInfo) {
      context.currentScene = sceneInfo.url || sceneInfo.name;
      context.isDirty = sceneInfo.dirty || false;
      context.mode = 'scene';
    }
  } catch {
    try {
      const prefabInfo: any = await Editor.Message.request('scene', 'query-prefab-info');
      if (prefabInfo) {
        context.currentPrefab = prefabInfo.url || prefabInfo.name;
        context.mode = 'prefab';
      }
    } catch {
      // ignore
    }
  }

  // 2. 获取选中节点（非 summaryOnly 模式或未指定 parentUuid 时）
  if (!parentUuid) {
    try {
      const selection = Editor.Selection.getSelected('node') || [];
      for (const uuid of selection.slice(0, 10)) {
        try {
          const nodeInfo: any = await Editor.Message.request('scene', 'query-node', uuid);
          if (nodeInfo) {
            const components = nodeInfo.__comps__?.map((c: any) => c.type || c.cid) || [];
            context.selectedNodes.push({
              uuid,
              name: String(nodeInfo.name?.value || 'Unknown'),
              path: String(nodeInfo.__path__ || ''),
              childCount: nodeInfo.__children__?.length || nodeInfo.children?.length || 0,
              components: summaryOnly ? undefined : (components.length > 0 ? components : undefined)
            });
          }
        } catch {
          context.selectedNodes.push({ uuid, name: 'Unknown', childCount: 0 });
        }
      }
    } catch {
      // ignore
    }
  }

  // 3. 获取层级摘要
  if (includeHierarchy) {
    try {
      const tree: any = await Editor.Message.request('scene', 'query-node-tree');
      if (tree) {
        const rootNodes: NodeSummary[] = [];
        let totalCount = 0;
        let truncated = false;

        const processNode = (node: any, depth: number, currentPath: string): NodeSummary | null => {
          totalCount++;
          if (totalCount > effectiveMaxNodes) {
            truncated = true;
            return null;
          }

          const nodePath = summaryOnly ? undefined : (currentPath ? `${currentPath}/${node.name}` : node.name);
          
          const summary: NodeSummary = {
            uuid: node.uuid,
            name: node.name || 'Unknown',
            childCount: node.children?.length || 0
          };

          if (!summaryOnly) {
            summary.path = nodePath;
          }

          // 递归处理子节点
          if (depth < maxDepth && node.children && node.children.length > 0) {
            if (summaryOnly) {
              // summaryOnly 模式：包含子节点结构
              summary.children = [];
              for (const child of node.children) {
                if (totalCount > effectiveMaxNodes) {
                  truncated = true;
                  break;
                }
                const childSummary = processNode(child, depth + 1, nodePath || '');
                if (childSummary) {
                  summary.children.push(childSummary);
                }
              }
              if (summary.children.length === 0) {
                delete summary.children;
              }
            } else {
              // 普通模式：只计数，不包含子节点
              for (const child of node.children) {
                processNode(child, depth + 1, nodePath || '');
              }
            }
          }

          return summary;
        };

        // 处理根节点
        let roots: any[] = [];
        if (Array.isArray(tree)) {
          roots = tree;
        } else if (tree.children) {
          roots = tree.children;
        }

        // 如果指定了 parentUuid，只查询该父节点的子节点
        if (parentUuid) {
          const findNode = (nodes: any[]): any => {
            for (const node of nodes) {
              if (node.uuid === parentUuid) return node;
              if (node.children) {
                const found = findNode(node.children);
                if (found) return found;
              }
            }
            return null;
          };
          const parentNode = findNode(roots);
          if (parentNode && parentNode.children) {
            roots = parentNode.children;
          } else {
            roots = [];
          }
        }

        for (const root of roots) {
          const summary = processNode(root, 0, '');
          if (summary) rootNodes.push(summary);
          if (truncated) break;
        }

        context.hierarchy = {
          rootNodes,
          totalNodeCount: totalCount,
          truncated: truncated ? true : undefined
        };
      }
    } catch {
      // ignore
    }
  }

  // 4. 获取最近日志
  if (includeRecentLogs && !summaryOnly) {
    try {
      const logs = await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'cocos-skill',
        method: 'getLastSceneLogs',
        args: [maxLogLines]
      });
      if (logs && Array.isArray(logs)) {
        context.recentLogs = logs.slice(0, maxLogLines);
      }
    } catch {
      // ignore
    }
  }

  // 5. 编辑器信息
  try {
    context.editorVersion = Editor.App.version;
    context.projectPath = Editor.Project.path;
  } catch {
    // ignore
  }

  return context;
}

export function registerGetEditorContextTool(server: ToolRegistrar): void {
  server.registerTool(
    'get_editor_context',
    {
      title: "Get Editor Context",
      description: `获取 Cocos Creator 编辑器的当前上下文快照。

**模式选择：**
- 普通模式（默认）：返回完整信息，maxNodes 上限 500
- summaryOnly 模式：只返回 uuid+name+childCount，maxNodes 上限 5000

**大场景处理（3000+ 节点）：**
1. 先用 summaryOnly=true 获取完整层级结构
2. 用 parentUuid 参数只查询某个分支
3. 用 editor_request + query-node 查询单个节点详情

**返回内容：**
- 编辑模式（scene/prefab）和当前文件
- dirty 状态（是否有未保存更改）
- 选中节点列表
- 场景层级摘要（包含 truncated 标记）
- 最近的场景日志（非 summaryOnly 模式）`,
      inputSchema: {
        includeHierarchy: z.boolean().default(true).describe("是否包含场景层级摘要"),
        includeRecentLogs: z.boolean().default(true).describe("是否包含最近日志"),
        summaryOnly: z.boolean().default(false).describe("极简模式：只返回 uuid+name+childCount，可处理大场景"),
        maxDepth: z.number().min(1).max(10).default(2).describe("层级遍历最大深度（1-10）"),
        maxNodes: z.number().min(10).max(5000).default(100).describe("最大节点数量（普通模式上限500，summaryOnly上限5000）"),
        maxLogLines: z.number().min(5).max(100).default(20).describe("最大日志行数（5-100）"),
        parentUuid: z.string().optional().describe("只查询指定父节点下的子节点")
      }
    },
    async (args) => {
      const summaryOnly = args.summaryOnly ?? false;
      const maxNodes = args.maxNodes ?? 100;
      
      const context = await getEditorContext({
        includeHierarchy: args.includeHierarchy ?? true,
        includeRecentLogs: args.includeRecentLogs ?? true,
        summaryOnly,
        maxDepth: Math.min(Math.max(args.maxDepth ?? 2, 1), 10),
        maxNodes: summaryOnly ? Math.min(maxNodes, 5000) : Math.min(maxNodes, 500),
        maxLogLines: Math.min(Math.max(args.maxLogLines ?? 20, 5), 100),
        parentUuid: args.parentUuid
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify(context, null, 2)
        }]
      };
    }
  );
}
