import test from 'node:test';
import assert from 'node:assert/strict';
import { registerNodeLinkedPrefabsOperationsTool } from '../node-linked-prefabs-operations.js';
import type { ToolRegistrar, ToolResult } from '../../../core/tool-contract.js';

type ToolHandler = (args: any) => Promise<ToolResult>;

type RequestCall = {
  channel: string;
  command: string;
  args: unknown[];
};

function createRegistrar(): { registrar: ToolRegistrar; getHandler: () => ToolHandler } {
  let handler: ToolHandler | null = null;
  const registrar: ToolRegistrar = {
    registerTool(_name, _definition, registeredHandler) {
      handler = registeredHandler;
    },
  };
  return {
    registrar,
    getHandler: () => {
      assert.ok(handler, 'tool handler should be registered');
      return handler;
    },
  };
}

function parseResponse(result: ToolResult): Record<string, unknown> {
  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  return JSON.parse(text);
}

test('edit-prefab should save current scene before opening linked prefab', async () => {
  const nodeUuid = 'node-under-test';
  const prefabUuid = 'prefab-under-test';
  const calls: RequestCall[] = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === 'scene' && command === 'execute-scene-script') {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === 'startCaptureSceneLogs') {
            return undefined;
          }
          if (payload?.method === 'getCapturedSceneLogs') {
            return [];
          }
        }
        if (channel === 'scene' && command === 'query-node') {
          return { __prefab__: { uuid: prefabUuid } };
        }
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          return 'db://assets/scenes/Main.scene';
        }
        if (channel === 'asset-db' && command === 'open-asset') {
          return undefined;
        }
        if (channel === 'scene' && command === 'snapshot') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerNodeLinkedPrefabsOperationsTool(registrar);
  const handler = getHandler();

  const response = await handler({ nodeUuid, operation: 'edit-prefab' });
  const body = parseResponse(response);
  assert.equal(body.success, true);

  const saveIndex = calls.findIndex((call) => call.channel === 'scene' && call.command === 'save-scene');
  const openIndex = calls.findIndex((call) => call.channel === 'asset-db' && call.command === 'open-asset');
  assert.ok(saveIndex >= 0, 'save-scene should be called');
  assert.ok(openIndex >= 0, 'open-asset should be called');
  assert.ok(saveIndex < openIndex, 'save-scene should happen before open-asset');
});

test('edit-prefab should stop when pre-switch save fails', async () => {
  const nodeUuid = 'node-under-test';
  const prefabUuid = 'prefab-under-test';
  const calls: RequestCall[] = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === 'scene' && command === 'execute-scene-script') {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === 'startCaptureSceneLogs') {
            return undefined;
          }
          if (payload?.method === 'getCapturedSceneLogs') {
            return [];
          }
        }
        if (channel === 'scene' && command === 'query-node') {
          return { __prefab__: { uuid: prefabUuid } };
        }
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          throw new Error('save failed');
        }
        if (channel === 'asset-db' && command === 'open-asset') {
          return undefined;
        }
        if (channel === 'scene' && command === 'snapshot') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerNodeLinkedPrefabsOperationsTool(registrar);
  const handler = getHandler();

  const response = await handler({ nodeUuid, operation: 'edit-prefab' });
  const body = parseResponse(response);
  assert.equal(body.success, false);
  assert.match(String((body as any).errors?.join('\n')), /Failed to save current scene before opening prefab: save failed/);

  const openCalled = calls.some((call) => call.channel === 'asset-db' && call.command === 'open-asset');
  assert.equal(openCalled, false);
});
