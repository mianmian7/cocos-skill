import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { CommandSchema, ALL_COMMANDS, getCommandSchema, getAvailableChannels } from "./editor-request-schemas";

/**
 * editor_request - 通用编辑器消息网关
 *
 * 提供对 Editor.Message.request API 的受控访问。
 * 通过 allowlist 控制哪些 channel + command 组合可以调用。
 *
 * 这是 "脚本化" 模型的核心工具，让 AI 可以组合调用编辑器 API，
 * 而不需要为每个 API 创建单独的工具接口。
 */

/**
 * 处理参数中的 UUID 编解码
 * 支持：字符串参数、数组参数、对象参数中的各类 UUID 字段
 */
function processArgs(args: any[]): any[] {
  return args.map((arg) => {
    // 字符串参数 - 尝试解码 UUID
    if (typeof arg === "string" && arg.length > 20) {
      try {
        return decodeUuid(arg);
      } catch {
        return arg;
      }
    }

    // 数组参数 - 递归处理每个元素（支持 UUID 数组）
    if (Array.isArray(arg)) {
      return arg.map((item) => {
        if (typeof item === "string" && item.length > 20) {
          try {
            return decodeUuid(item);
          } catch {
            return item;
          }
        }
        return item;
      });
    }

    // 对象参数 - 处理各类 UUID 字段
    if (typeof arg === "object" && arg !== null) {
      const processed = { ...arg };

      // 处理单个 UUID 字段
      const uuidFields = ["uuid", "parent", "assetUuid", "nodeUuid", "target", "source"];
      for (const key of uuidFields) {
        if (typeof processed[key] === "string" && processed[key].length > 20) {
          try {
            processed[key] = decodeUuid(processed[key]);
          } catch {
            // 保持原值
          }
        }
      }

      // 处理 uuid 字段可能是数组的情况 (string | string[])
      if (Array.isArray(processed.uuid)) {
        processed.uuid = processed.uuid.map((u: string) => {
          if (typeof u === "string" && u.length > 20) {
            try {
              return decodeUuid(u);
            } catch {
              return u;
            }
          }
          return u;
        });
      }

      // 处理 uuids 数组字段
      if (Array.isArray(processed.uuids)) {
        processed.uuids = processed.uuids.map((u: string) => {
          if (typeof u === "string" && u.length > 20) {
            try {
              return decodeUuid(u);
            } catch {
              return u;
            }
          }
          return u;
        });
      }

      return processed;
    }

    return arg;
  });
}

export function registerEditorRequestTool(server: ToolRegistrar): void {
  server.registerTool(
    "editor_request",
    {
      title: "Editor Message Request",
      description: `通用编辑器消息网关 - 调用 Cocos Creator Editor.Message API。

这是一个强大的低级工具，允许直接调用编辑器的消息 API。
使用 allowlist 控制可用的操作，确保安全性。

**重要：** 默认限制输出大小（maxResultSize），避免上下文爆炸。

**使用模式：**
1. 先用 get_editor_context 了解当前状态
2. 根据 SKILL.md 文档组合调用 editor_request
3. 用 get_editor_context 验证操作结果

**可用通道 (channel)：**
- scene: 场景操作（节点、组件、属性、Gizmo）
- asset-db: 资源管理（查询、创建、修改、删除）
- selection: 选择操作
- project: 项目设置

**获取可用命令列表：**
调用时设置 listCommands=true 可获取所有可用命令及参数说明。`,
      inputSchema: {
        channel: z.string().optional().describe("消息通道：scene | asset-db | selection | project"),
        command: z.string().optional().describe("命令名称，如 query-node, set-property"),
        args: z.array(z.any()).default([]).describe("命令参数数组"),
        listCommands: z.boolean().default(false).describe("设为 true 时返回所有可用命令列表"),
        encodeResultUuids: z.boolean().default(true).describe("是否将结果中的 UUID 编码为短格式"),
        maxResultSize: z.number().default(50000).describe("最大返回字符数（默认 50000，约 12k tokens）"),
        summarize: z.boolean().default(true).describe("超出大小时是否返回摘要而非截断"),
        maxDepth: z.number().default(3).describe("query-node-tree 的最大遍历深度"),
        maxNodes: z.number().default(50).describe("query-node-tree 返回的最大节点数"),
      },
    },
    async (params) => {
      const {
        channel,
        command,
        args = [],
        listCommands,
        encodeResultUuids = true,
        maxResultSize = 50000,
        summarize = true,
        maxDepth = 3,
        maxNodes = 50,
      } = params;

      // 列出可用命令
      if (listCommands) {
        const commandsByChannel: Record<
          string,
          {
            command: string;
            mode: string;
            description: string;
            args?: string;
            officialType?: string;
            returnType?: string;
          }[]
        > = {};

        for (const cmd of ALL_COMMANDS) {
          if (!commandsByChannel[cmd.channel]) {
            commandsByChannel[cmd.channel] = [];
          }
          commandsByChannel[cmd.channel].push({
            command: cmd.command,
            mode: cmd.mode,
            description: cmd.description,
            ...(cmd.argsSchema ? { args: cmd.argsSchema } : {}),
            ...(cmd.officialType ? { officialType: cmd.officialType } : {}),
            ...(cmd.returnType ? { returnType: cmd.returnType } : {}),
          });
        }

        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: true,
                  availableCommands: commandsByChannel,
                  totalCount: ALL_COMMANDS.length,
                  channels: getAvailableChannels(),
                },
                null,
                2
              ),
            },
          ],
        };
      }

      const normalizedChannel = typeof channel === "string" ? channel.trim() : "";
      const normalizedCommand = typeof command === "string" ? command.trim() : "";
      if (!normalizedChannel || !normalizedCommand) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: "channel and command are required when listCommands=false",
                  hint: "Set listCommands=true to list all available commands",
                  availableChannels: getAvailableChannels(),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      // 检查是否在 allowlist 中
      const allowed = getCommandSchema(normalizedChannel, normalizedCommand);
      if (!allowed) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  error: `Command '${normalizedChannel}:${normalizedCommand}' is not in the allowlist`,
                  hint: "Set listCommands=true to see available commands",
                  availableChannels: getAvailableChannels(),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }

      try {
        // 处理参数（UUID 解码等）
        const processedArgs = processArgs(args);

        // 调用编辑器 API
        let result: any;
        if (processedArgs.length === 0) {
          result = await Editor.Message.request(normalizedChannel, normalizedCommand);
        } else if (processedArgs.length === 1) {
          result = await Editor.Message.request(normalizedChannel, normalizedCommand, processedArgs[0]);
        } else {
          result = await Editor.Message.request(normalizedChannel, normalizedCommand, ...processedArgs);
        }

        // 特殊处理：query-node-tree 限制深度和节点数
        if (normalizedChannel === "scene" && normalizedCommand === "query-node-tree") {
          result = limitNodeTree(result, maxDepth, maxNodes);
        }

        // 特殊处理：query-node 精简输出
        if (normalizedChannel === "scene" && normalizedCommand === "query-node") {
          result = simplifyNodeInfo(result, summarize);
        }

        // 处理结果（可选 UUID 编码）
        if (encodeResultUuids && result) {
          result = encodeUuidsInResult(result);
        }

        // 检查结果大小
        let outputText = JSON.stringify(
          {
            success: true,
            channel: normalizedChannel,
            command: normalizedCommand,
            mode: allowed.mode,
            result,
          },
          null,
          2
        );

        // 如果超出大小限制
        if (outputText.length > maxResultSize) {
          if (summarize) {
            // 返回摘要
            const summary = generateResultSummary(result, normalizedChannel, normalizedCommand);
            outputText = JSON.stringify(
              {
                success: true,
                channel: normalizedChannel,
                command: normalizedCommand,
                mode: allowed.mode,
                truncated: true,
                originalSize: outputText.length,
                summary,
                hint: "结果过大已生成摘要。使用更具体的查询或增加 maxResultSize 参数获取完整数据。",
              },
              null,
              2
            );
          } else {
            // 截断
            outputText = outputText.substring(0, maxResultSize) + "\n... [TRUNCATED]";
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: outputText,
            },
          ],
        };
      } catch (error: any) {
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(
                {
                  success: false,
                  channel: normalizedChannel,
                  command: normalizedCommand,
                  error: error.message || String(error),
                },
                null,
                2
              ),
            },
          ],
          isError: true,
        };
      }
    }
  );
}

// 递归编码结果中的 UUID
function encodeUuidsInResult(obj: any, depth = 0): any {
  if (depth > 10) return obj; // 防止无限递归

  if (typeof obj === "string" && isLikelyUuid(obj)) {
    try {
      return encodeUuid(obj);
    } catch {
      return obj;
    }
  }

  if (Array.isArray(obj)) {
    return obj.map((item) => encodeUuidsInResult(item, depth + 1));
  }

  if (typeof obj === "object" && obj !== null) {
    const encoded: any = {};
    for (const [key, value] of Object.entries(obj)) {
      encoded[key] = encodeUuidsInResult(value, depth + 1);
    }
    return encoded;
  }

  return obj;
}

function isLikelyUuid(str: string): boolean {
  // Cocos UUID 格式：包含连字符的长字符串
  return str.length > 30 && str.includes("-");
}

// 限制节点树的深度和节点数
function limitNodeTree(tree: any, maxDepth: number, maxNodes: number): any {
  let nodeCount = 0;

  function processNode(node: any, depth: number): any {
    if (nodeCount >= maxNodes) return null;
    nodeCount++;

    const limited: any = {
      uuid: node.uuid,
      name: node.name,
      childCount: node.children?.length || 0,
    };

    if (depth < maxDepth && node.children && node.children.length > 0) {
      limited.children = [];
      for (const child of node.children) {
        if (nodeCount >= maxNodes) {
          limited.childrenTruncated = true;
          break;
        }
        const processedChild = processNode(child, depth + 1);
        if (processedChild) {
          limited.children.push(processedChild);
        }
      }
    } else if (node.children && node.children.length > 0) {
      limited.hasChildren = true;
      limited.childrenOmitted = node.children.length;
    }

    return limited;
  }

  if (Array.isArray(tree)) {
    const result = [];
    for (const root of tree) {
      if (nodeCount >= maxNodes) break;
      const processed = processNode(root, 0);
      if (processed) result.push(processed);
    }
    return { nodes: result, totalProcessed: nodeCount, maxDepth, maxNodes };
  } else if (tree && tree.children) {
    const result = [];
    for (const root of tree.children) {
      if (nodeCount >= maxNodes) break;
      const processed = processNode(root, 0);
      if (processed) result.push(processed);
    }
    return { nodes: result, totalProcessed: nodeCount, maxDepth, maxNodes };
  }

  return tree;
}

// 精简节点信息，移除冗余数据
function simplifyNodeInfo(node: any, summarize: boolean): any {
  if (!node || !summarize) return node;

  const simplified: any = {
    uuid: node.uuid,
    name: node.name?.value || node.name,
    active: node.active?.value ?? true,
    position: node.position?.value,
    rotation: node.euler?.value || node.rotation?.value,
    scale: node.scale?.value,
    layer: node.layer?.value,
  };

  // 简化组件信息
  if (node.__comps__ && Array.isArray(node.__comps__)) {
    simplified.components = node.__comps__.map((comp: any) => ({
      type: comp.type || comp.cid,
      enabled: comp.enabled?.value ?? true,
      // 只保留关键属性
      ...(comp.color?.value ? { color: comp.color.value } : {}),
      ...(comp.spriteFrame?.value ? { spriteFrame: comp.spriteFrame.value.uuid } : {}),
    }));
  }

  // 子节点数量
  if (node.__children__ || node.children) {
    simplified.childCount = (node.__children__ || node.children).length;
  }

  return simplified;
}

// 生成结果摘要
function generateResultSummary(result: any, channel: string, command: string): any {
  if (channel === "scene" && command === "query-node-tree") {
    const countNodes = (node: any): number => {
      let count = 1;
      if (node.children) {
        for (const child of node.children) {
          count += countNodes(child);
        }
      }
      return count;
    };

    let totalNodes = 0;
    const rootNames: string[] = [];
    const nodes = Array.isArray(result) ? result : result?.children || [];
    for (const root of nodes) {
      totalNodes += countNodes(root);
      rootNames.push(root.name);
    }

    return {
      type: "node-tree-summary",
      totalNodes,
      rootNodes: rootNames.slice(0, 10),
      hint: "使用 maxDepth 和 maxNodes 参数限制返回数据量",
    };
  }

  if (channel === "scene" && command === "query-node") {
    return {
      type: "node-summary",
      uuid: result?.uuid,
      name: result?.name?.value || result?.name,
      componentCount: result?.__comps__?.length || 0,
      childCount: result?.__children__?.length || result?.children?.length || 0,
      hint: "节点详情已精简，需要完整数据请设置 summarize=false",
    };
  }

  // 默认摘要
  return {
    type: "generic-summary",
    dataType: typeof result,
    isArray: Array.isArray(result),
    length: Array.isArray(result) ? result.length : undefined,
    keys: typeof result === "object" && result ? Object.keys(result).slice(0, 20) : undefined,
  };
}
