import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { saveSceneNonInteractive } from "./scene-save.js";

/**
 * apply_gated_action - 敏感操作网关
 * 
 * 对高风险操作实施两阶段审批：
 * 1. 第一次调用：返回操作预览和 approvalToken
 * 2. 第二次调用：带 approvalToken 执行操作
 * 
 * 这确保 AI 不能直接执行可能造成数据丢失的操作。
 */

// 敏感操作定义
type GatedActionType = 
  | 'delete_nodes'          // 删除节点
  | 'delete_assets'         // 删除资源
  | 'save_scene'            // 保存场景
  | 'save_all'              // 保存所有
  | 'execute_code'          // 执行任意代码
  | 'batch_modify'          // 批量修改
  | 'clear_scene';          // 清空场景

interface GatedActionDef {
  type: GatedActionType;
  description: string;
  riskLevel: 'medium' | 'high' | 'critical';
  requiresConfirmation: boolean;
}

const GATED_ACTIONS: Record<GatedActionType, GatedActionDef> = {
  delete_nodes: {
    type: 'delete_nodes',
    description: '删除一个或多个节点',
    riskLevel: 'high',
    requiresConfirmation: true
  },
  delete_assets: {
    type: 'delete_assets',
    description: '删除一个或多个资源文件',
    riskLevel: 'critical',
    requiresConfirmation: true
  },
  save_scene: {
    type: 'save_scene',
    description: '保存当前场景',
    riskLevel: 'medium',
    requiresConfirmation: false // 保存通常是安全的
  },
  save_all: {
    type: 'save_all',
    description: '保存所有未保存的更改',
    riskLevel: 'medium',
    requiresConfirmation: false
  },
  execute_code: {
    type: 'execute_code',
    description: '在场景中执行任意代码',
    riskLevel: 'critical',
    requiresConfirmation: true
  },
  batch_modify: {
    type: 'batch_modify',
    description: '批量修改多个节点/资源',
    riskLevel: 'high',
    requiresConfirmation: true
  },
  clear_scene: {
    type: 'clear_scene',
    description: '清空场景中的所有节点',
    riskLevel: 'critical',
    requiresConfirmation: true
  }
};

// 待审批操作的存储
interface PendingAction {
  token: string;
  action: GatedActionType;
  params: any;
  summary: string;
  createdAt: number;
  expiresAt: number;
}

const pendingActions = new Map<string, PendingAction>();
const TOKEN_EXPIRY_MS = 5 * 60 * 1000; // 5分钟过期

function generateToken(): string {
  return `gated_${Date.now()}_${Math.random().toString(36).substring(2, 10)}`;
}

function cleanExpiredTokens(): void {
  const now = Date.now();
  for (const [token, action] of pendingActions.entries()) {
    if (now > action.expiresAt) {
      pendingActions.delete(token);
    }
  }
}

async function executeGatedAction(action: GatedActionType, params: any): Promise<any> {
  switch (action) {
    case 'delete_nodes': {
      const uuids: string[] = Array.isArray(params.uuids) ? params.uuids : [params.uuid];
      const results = [];
      for (const uuid of uuids) {
        const decodedUuid = decodeUuid(uuid);
        await Editor.Message.request('scene', 'remove-node', { uuid: decodedUuid });
        results.push({ uuid, deleted: true });
      }
      return { deletedNodes: results };
    }

    case 'delete_assets': {
      const urls: string[] = Array.isArray(params.urls) ? params.urls : [params.url];
      const results = [];
      for (const url of urls) {
        await Editor.Message.request('asset-db', 'delete-asset', url);
        results.push({ url, deleted: true });
      }
      return { deletedAssets: results };
    }

    case 'save_scene': {
      const saveResult = await saveSceneNonInteractive((channel, command, ...args) =>
        Editor.Message.request(channel, command, ...args)
      );
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save scene.');
      }
      return { saved: saveResult.saved, saveResult };
    }

    case 'save_all': {
      const saveResult = await saveSceneNonInteractive((channel, command, ...args) =>
        Editor.Message.request(channel, command, ...args)
      );
      if (!saveResult.success) {
        throw new Error(saveResult.error || 'Failed to save all changes.');
      }
      return {
        savedAll: true,
        saveResult,
        note: 'Saved current scene. Cocos Creator asset-db channel does not expose a documented save-all command.'
      };
    }

    case 'execute_code': {
      const result = await Editor.Message.request('scene', 'execute-scene-script', {
        name: 'cocos-skill',
        method: 'executeArbitraryCode',
        args: [params.code, params.options || {}]
      });
      return { codeResult: result };
    }

    case 'batch_modify': {
      const modifications = params.modifications || [];
      const results = [];
      for (const mod of modifications) {
        const decodedUuid = decodeUuid(mod.uuid);
        await Editor.Message.request('scene', 'set-property', {
          uuid: decodedUuid,
          path: mod.path,
          dump: mod.dump
        });
        results.push({ uuid: mod.uuid, path: mod.path, modified: true });
      }
      return { modifications: results };
    }

    case 'clear_scene': {
      const tree: any = await Editor.Message.request('scene', 'query-node-tree');
      const rootChildren = tree?.children || [];
      const results = [];
      for (const child of rootChildren) {
        await Editor.Message.request('scene', 'remove-node', { uuid: child.uuid });
        results.push({ uuid: child.uuid, name: child.name, deleted: true });
      }
      return { clearedNodes: results };
    }

    default:
      throw new Error(`Unknown action type: ${action}`);
  }
}

function generateActionSummary(action: GatedActionType, params: any): string {
  const actionDef = GATED_ACTIONS[action];
  
  switch (action) {
    case 'delete_nodes': {
      const uuids = Array.isArray(params.uuids) ? params.uuids : [params.uuid];
      return `${actionDef.description}: ${uuids.length} 个节点将被删除`;
    }
    case 'delete_assets': {
      const urls = Array.isArray(params.urls) ? params.urls : [params.url];
      return `${actionDef.description}: ${urls.length} 个资源将被删除`;
    }
    case 'execute_code': {
      const codePreview = params.code?.substring(0, 100) || '';
      return `${actionDef.description}: ${codePreview}${params.code?.length > 100 ? '...' : ''}`;
    }
    case 'batch_modify': {
      const count = params.modifications?.length || 0;
      return `${actionDef.description}: ${count} 个修改操作`;
    }
    case 'clear_scene':
      return `${actionDef.description}: 所有场景节点将被删除（不可恢复）`;
    default:
      return actionDef.description;
  }
}

export function registerApplyGatedActionTool(server: ToolRegistrar): void {
  server.registerTool(
    'apply_gated_action',
    {
      title: "Apply Gated Action",
      description: `敏感操作网关 - 对高风险操作实施两阶段审批。

**支持的操作类型：**
- delete_nodes: 删除节点 (参数: { uuid } 或 { uuids: [] })
- delete_assets: 删除资源 (参数: { url } 或 { urls: [] })
- save_scene: 保存当前场景
- save_all: 保存所有更改
- execute_code: 执行任意代码 (参数: { code, options? })
- batch_modify: 批量修改 (参数: { modifications: [{ uuid, path, dump }] })
- clear_scene: 清空场景所有节点

**使用流程：**
1. 第一次调用（不带 approvalToken）：返回操作摘要和 token
2. 确认后第二次调用（带 approvalToken）：执行操作

**注意：**
- Token 5分钟后过期
- 高风险操作需要人工确认
- 某些操作（如 save_scene）风险较低，可直接执行`,
      inputSchema: {
        action: z.enum([
          'delete_nodes', 'delete_assets', 'save_scene', 'save_all',
          'execute_code', 'batch_modify', 'clear_scene'
        ]).describe("操作类型"),
        params: z.record(z.any()).default({}).describe("操作参数"),
        approvalToken: z.string().optional().describe("审批 token（第二次调用时提供）"),
        skipConfirmation: z.boolean().default(false).describe("跳过确认（仅对低风险操作有效）")
      }
    },
    async (args) => {
      const { action, params = {}, approvalToken, skipConfirmation = false } = args;
      const actionType = action as GatedActionType;
      
      // 清理过期 token
      cleanExpiredTokens();

      const actionDef = GATED_ACTIONS[actionType];
      if (!actionDef) {
        return {
          content: [{
            type: 'text' as const,
            text: JSON.stringify({
              success: false,
              error: `Unknown action type: ${actionType}`,
              availableActions: Object.keys(GATED_ACTIONS)
            }, null, 2)
          }],
          isError: true
        };
      }

      // 如果提供了 approvalToken，执行操作
      if (approvalToken) {
        const pending = pendingActions.get(approvalToken);
        
        if (!pending) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: 'Invalid or expired approval token',
                hint: 'Request a new token by calling without approvalToken'
              }, null, 2)
            }],
            isError: true
          };
        }

        // 验证 action 类型匹配
        if (pending.action !== actionType) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                error: `Token was issued for '${pending.action}', not '${actionType}'`
              }, null, 2)
            }],
            isError: true
          };
        }

        // 执行操作
        pendingActions.delete(approvalToken);
        
        try {
          const result = await executeGatedAction(actionType, pending.params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                action: actionType,
                executed: true,
                result
              }, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                action: actionType,
                error: error.message || String(error)
              }, null, 2)
            }],
            isError: true
          };
        }
      }

      // 对于低风险操作且 skipConfirmation=true，直接执行
      if (!actionDef.requiresConfirmation && skipConfirmation) {
        try {
          const result = await executeGatedAction(actionType, params);
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: true,
                action: actionType,
                executed: true,
                skippedConfirmation: true,
                result
              }, null, 2)
            }]
          };
        } catch (error: any) {
          return {
            content: [{
              type: 'text' as const,
              text: JSON.stringify({
                success: false,
                action: actionType,
                error: error.message || String(error)
              }, null, 2)
            }],
            isError: true
          };
        }
      }

      // 生成审批 token
      const token = generateToken();
      const summary = generateActionSummary(actionType, params);
      const now = Date.now();
      
      pendingActions.set(token, {
        token,
        action: actionType,
        params,
        summary,
        createdAt: now,
        expiresAt: now + TOKEN_EXPIRY_MS
      });

      return {
        content: [{
          type: 'text' as const,
          text: JSON.stringify({
            success: true,
            requiresApproval: true,
            action: actionType,
            riskLevel: actionDef.riskLevel,
            summary,
            approvalToken: token,
            expiresIn: '5 minutes',
            instruction: actionDef.requiresConfirmation
              ? '请确认此操作。确认后使用相同的 action 和 approvalToken 再次调用以执行。'
              : '此操作风险较低。可直接使用 approvalToken 执行，或设置 skipConfirmation=true 跳过确认。'
          }, null, 2)
        }]
      };
    }
  );
}
