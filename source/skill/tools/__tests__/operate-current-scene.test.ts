import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOperateCurrentSceneTool } from '../operate-current-scene.js';
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

test('open should save current scene before opening target scene', async () => {
  const targetSceneUuid = 'target-scene-uuid';
  const calls: RequestCall[] = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === targetSceneUuid) {
            return { uuid: targetSceneUuid, url: 'db://assets/scenes/Target.scene' };
          }
          return null;
        }
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          return 'db://assets/scenes/Main.scene';
        }
        if (channel === 'scene' && command === 'open-scene') {
          return undefined;
        }
        if (channel === 'scene' && command === 'execute-scene-script') {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === 'startCaptureSceneLogs') {
            return undefined;
          }
          if (payload?.method === 'getCapturedSceneLogs') {
            return [];
          }
        }
        if (channel === 'scene' && command === 'snapshot') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateCurrentSceneTool(registrar);
  const handler = getHandler();
  const response = await handler({
    operation: 'open',
    sceneToOpenUrlOrUuid: targetSceneUuid,
  });

  const body = parseResponse(response);
  assert.equal(body.success, true);
  assert.deepEqual(body.errors, []);
  assert.equal((body.meta as any)?.tool, 'operate_current_scene');
  assert.equal((body.meta as any)?.operation, 'open');
  assert.equal((body.data as any)?.url, 'db://assets/scenes/Target.scene');

  const saveIndex = calls.findIndex((call) => call.channel === 'scene' && call.command === 'save-scene');
  const openIndex = calls.findIndex((call) => call.channel === 'scene' && call.command === 'open-scene');
  const snapshotIndex = calls.findIndex((call) => call.channel === 'scene' && call.command === 'snapshot');
  assert.ok(saveIndex >= 0, 'save-scene should be called');
  assert.ok(openIndex >= 0, 'open-scene should be called');
  assert.ok(snapshotIndex >= 0, 'snapshot should be called');
  assert.ok(saveIndex < openIndex, 'save-scene should happen before open-scene');
  assert.ok(openIndex < snapshotIndex, 'snapshot should happen after open-scene');
});

test('open should stop when pre-switch save fails', async () => {
  const targetSceneUuid = 'target-scene-uuid';
  const calls: RequestCall[] = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === targetSceneUuid) {
            return { uuid: targetSceneUuid, url: 'db://assets/scenes/Target.scene' };
          }
          return null;
        }
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          throw new Error('save failed');
        }
        if (channel === 'scene' && command === 'open-scene') {
          return undefined;
        }
        if (channel === 'scene' && command === 'execute-scene-script') {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === 'startCaptureSceneLogs') {
            return undefined;
          }
          if (payload?.method === 'getCapturedSceneLogs') {
            return [];
          }
        }
        if (channel === 'scene' && command === 'snapshot') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateCurrentSceneTool(registrar);
  const handler = getHandler();
  const response = await handler({
    operation: 'open',
    sceneToOpenUrlOrUuid: targetSceneUuid,
  });

  const body = parseResponse(response);
  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, 'operate_current_scene');
  assert.equal((body.meta as any)?.operation, 'open');
  assert.match(String((body.errors as any)?.[0]?.message), /Failed to save current scene before opening target scene: save failed/);

  const openCalled = calls.some((call) => call.channel === 'scene' && call.command === 'open-scene');
  assert.equal(openCalled, false);
});
