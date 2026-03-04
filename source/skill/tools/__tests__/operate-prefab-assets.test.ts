import test from 'node:test';
import assert from 'node:assert/strict';
import { registerOperatePrefabAssetsTool } from '../operate-prefab-assets.js';
import type { ToolRegistrar, ToolResult } from '../../../core/tool-contract.js';

type ToolHandler = (args: any) => Promise<ToolResult>;

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

test('batch_create should report a usable linked node uuid from query-nodes-by-asset-uuid', async () => {
  const originalNodeUuid = 'source-node-uuid';
  const prefabUuid = 'created-prefab-uuid';
  const linkedNodeUuid = 'linked-node-uuid';
  const path = 'db://assets/cocos-skill-test/prefab-under-test.prefab';
  const calls: Array<{ channel: string; command: string; args: unknown[] }> = [];

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
          if (payload?.method === 'createPrefabFromNode') {
            return { uuid: prefabUuid };
          }
        }

        if (channel === 'scene' && command === 'query-node') {
          const targetUuid = args[0];
          if (targetUuid === originalNodeUuid) {
            return { uuid: originalNodeUuid };
          }
          if (targetUuid === linkedNodeUuid) {
            return { __prefab__: { uuid: prefabUuid } };
          }
          return null;
        }

        if (channel === 'scene' && command === 'query-node-tree') {
          return {
            children: [
              {
                // Simulate unstable runtime shape that should not be used as final UUID.
                uuid: { value: 'non-usable-tree-uuid' },
                prefab: { assetUuid: prefabUuid },
                children: [],
              },
            ],
          };
        }

        if (channel === 'scene' && command === 'query-nodes-by-asset-uuid') {
          if (args[0] === prefabUuid) {
            return [linkedNodeUuid];
          }
          return [];
        }

        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === path) {
            return { uuid: prefabUuid, url: path };
          }
          return null;
        }

        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperatePrefabAssetsTool(registrar);
  const handler = getHandler();

  const response = await handler({
    operation: 'batch_create',
    creationOptions: [
      {
        nodeUuid: originalNodeUuid,
        assetPath: path,
        removeOriginal: false,
      },
    ],
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);
  const notes = Array.isArray(body.notes) ? body.notes.join('\n') : '';

  assert.equal(Boolean(body.error), false);
  assert.ok(notes.includes(`Prefab from node (UUID: '${originalNodeUuid}') created`));
  assert.ok(notes.includes(`Original node has new UUID: ${linkedNodeUuid}`));

  const calledQueryLinkedNodes = calls.some(
    (call) => call.channel === 'scene' && call.command === 'query-nodes-by-asset-uuid' && call.args[0] === prefabUuid
  );
  assert.equal(calledQueryLinkedNodes, true);
});

test('open_for_editing should save current scene before opening prefab', async () => {
  const prefabUuid = 'prefab-open-uuid';
  const calls: Array<{ channel: string; command: string; args: unknown[] }> = [];

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
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          return 'db://assets/scenes/Main.scene';
        }
        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === prefabUuid) {
            return { uuid: prefabUuid, type: 'cc.Prefab', url: 'db://assets/Unit.prefab', name: 'Unit' };
          }
          return null;
        }
        if (channel === 'asset-db' && command === 'open-asset') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperatePrefabAssetsTool(registrar);
  const handler = getHandler();
  const response = await handler({
    operation: 'open_for_editing',
    assetToOpenUrlOrUuid: prefabUuid,
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);
  assert.equal(Array.isArray(body.errors), false);

  const saveIndex = calls.findIndex((call) => call.channel === 'scene' && call.command === 'save-scene');
  const openIndex = calls.findIndex((call) => call.channel === 'asset-db' && call.command === 'open-asset');
  assert.ok(saveIndex >= 0, 'save-scene should be called');
  assert.ok(openIndex >= 0, 'open-asset should be called');
  assert.ok(saveIndex < openIndex, 'save-scene should happen before open-asset');
});

test('open_for_editing should not open prefab when save fails', async () => {
  const prefabUuid = 'prefab-open-uuid';
  const calls: Array<{ channel: string; command: string; args: unknown[] }> = [];

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
        if (channel === 'scene' && command === 'query-scene-info') {
          return { url: 'db://assets/scenes/Main.scene', dirty: true };
        }
        if (channel === 'scene' && command === 'save-scene') {
          throw new Error('save failed');
        }
        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === prefabUuid) {
            return { uuid: prefabUuid, type: 'cc.Prefab', url: 'db://assets/Unit.prefab', name: 'Unit' };
          }
          return null;
        }
        if (channel === 'asset-db' && command === 'open-asset') {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperatePrefabAssetsTool(registrar);
  const handler = getHandler();
  const response = await handler({
    operation: 'open_for_editing',
    assetToOpenUrlOrUuid: prefabUuid,
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);
  assert.equal(Array.isArray(body.errors), true);
  assert.match(body.errors.join('\n'), /Failed to save current scene before opening prefab: save failed/);

  const openCalled = calls.some((call) => call.channel === 'asset-db' && call.command === 'open-asset');
  assert.equal(openCalled, false);
});
