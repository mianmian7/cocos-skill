import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from "../../../package.json";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { ALL_COMMANDS, getCommandSchema, getAvailableChannels } from "./editor-request-schemas";
import {
  encodeUuidsInResult,
  executeSelectionCommand,
  limitNodeTree,
  processArgs,
  simplifyNodeInfo,
} from "./editor-request-support.js";
import {
  buildEditorRequestSuccessData,
  buildOversizedEditorRequestOutcome,
  executeEditorRequest,
  getEditorRequestEffect,
} from "./editor-request-runtime.js";

type EditorRequestParams = {
  channel?: string;
  command?: string;
  args?: unknown[];
  listCommands?: boolean;
  encodeResultUuids?: boolean;
  maxResultSize?: number;
  summarize?: boolean;
  maxDepth?: number;
  maxNodes?: number;
};

function buildListCommandsData() {
  const commandsByChannel: Record<
    string,
    Array<{
      command: string;
      mode: string;
      description: string;
      args?: string;
      officialType?: string;
      returnType?: string;
    }>
  > = {};

  for (const command of ALL_COMMANDS) {
    if (!commandsByChannel[command.channel]) {
      commandsByChannel[command.channel] = [];
    }

    commandsByChannel[command.channel].push({
      command: command.command,
      mode: command.mode,
      description: command.description,
      ...(command.argsSchema ? { args: command.argsSchema } : {}),
      ...(command.officialType ? { officialType: command.officialType } : {}),
      ...(command.returnType ? { returnType: command.returnType } : {}),
    });
  }

  return {
    availableCommands: commandsByChannel,
    totalCount: ALL_COMMANDS.length,
    channels: getAvailableChannels(),
  };
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
        channel: z.string().optional().default("").describe("消息通道：scene | asset-db | selection | project"),
        command: z.string().optional().default("").describe("命令名称，如 query-node, set-property"),
        args: z.array(z.any()).default([]).describe("命令参数数组"),
        listCommands: z.boolean().default(false).describe("设为 true 时返回所有可用命令列表"),
        encodeResultUuids: z.boolean().default(true).describe("是否将结果中的 UUID 编码为短格式"),
        maxResultSize: z.number().default(50000).describe("最大返回字符数（默认 50000，约 12k tokens）"),
        summarize: z.boolean().default(true).describe("超出大小时是否返回摘要而非截断"),
        maxDepth: z.number().default(3).describe("query-node-tree 的最大遍历深度"),
        maxNodes: z.number().default(50).describe("query-node-tree 返回的最大节点数"),
      },
    },
    async (params: EditorRequestParams) => {
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

      const normalizedChannel = typeof channel === "string" ? channel.trim() : "";
      const normalizedCommand = typeof command === "string" ? command.trim() : "";
      const allowed = getCommandSchema(normalizedChannel, normalizedCommand);
      const effect = listCommands ? "read" : getEditorRequestEffect(normalizedChannel, allowed?.mode);
      const operation = listCommands
        ? "list-commands"
        : `${normalizedChannel || "unknown"}:${normalizedCommand || "unknown"}`;

      return runToolWithContext(
        {
          toolName: "editor_request",
          operation,
          effect,
          packageName: packageJSON.name,
          captureSceneLogs: false,
          meta: {},
        },
        async ({ request }) => {
          if (listCommands) {
            return {
              data: buildListCommandsData(),
            };
          }

          if (!normalizedChannel || !normalizedCommand) {
            return {
              success: false,
              data: {
                availableChannels: getAvailableChannels(),
                hint: "Set listCommands=true to list all available commands",
              },
              errors: ["channel and command are required when listCommands=false"],
            };
          }

          if (!allowed) {
            return {
              success: false,
              data: {
                availableChannels: getAvailableChannels(),
                hint: "Set listCommands=true to see available commands",
              },
              errors: [`Command '${normalizedChannel}:${normalizedCommand}' is not in the allowlist`],
            };
          }

          try {
            const processedArgs = processArgs(args);
            const selectionResult = normalizedChannel === "selection"
              ? executeSelectionCommand(normalizedCommand, processedArgs)
              : { handled: false };

            let result = selectionResult.handled
              ? selectionResult.result
              : await executeEditorRequest(request, normalizedChannel, normalizedCommand, processedArgs);

            if (normalizedChannel === "scene" && normalizedCommand === "query-node-tree") {
              result = limitNodeTree(result, maxDepth, maxNodes);
            }

            if (normalizedChannel === "scene" && normalizedCommand === "query-node") {
              result = simplifyNodeInfo(result, summarize);
            }

            if (encodeResultUuids && result) {
              result = encodeUuidsInResult(result);
            }

            const data = buildEditorRequestSuccessData(normalizedChannel, normalizedCommand, allowed.mode, result);
            const serialized = JSON.stringify(data);
            if (serialized.length > maxResultSize) {
              return buildOversizedEditorRequestOutcome({
                channel: normalizedChannel,
                command: normalizedCommand,
                mode: allowed.mode,
                result,
                originalSize: serialized.length,
                maxResultSize,
                summarize,
                operation,
                effect,
              });
            }

            return { data };
          } catch (error) {
            return {
              success: false,
              data: {
                channel: normalizedChannel,
                command: normalizedCommand,
              },
              errors: [error instanceof Error ? error.message : String(error)],
            };
          }
        }
      );
    }
  );
}
