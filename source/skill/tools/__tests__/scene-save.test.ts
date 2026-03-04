import test from 'node:test';
import assert from 'node:assert/strict';
import { saveSceneNonInteractive, type EditorRequestFn } from '../scene-save.js';

type RequestCall = {
  channel: string;
  command: string;
  args: unknown[];
};

function createRequestStub(
  handler: (channel: string, command: string, args: unknown[]) => Promise<unknown>
): { request: EditorRequestFn; calls: RequestCall[] } {
  const calls: RequestCall[] = [];
  const request: EditorRequestFn = async (channel, command, ...args) => {
    calls.push({ channel, command, args });
    return handler(channel, command, args);
  };
  return { request, calls };
}

test('saves dirty scene via save-scene command', async () => {
  const sceneUrl = 'db://assets/scenes/Main.scene';
  const { request, calls } = createRequestStub(async (_channel, command, args) => {
    if (command === 'query-scene-info') {
      return { url: sceneUrl, dirty: true };
    }
    if (command === 'save-scene') {
      assert.equal(args.length, 0);
      return sceneUrl;
    }
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await saveSceneNonInteractive(request);

  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.skipped, false);
  assert.equal(result.sceneUrl, sceneUrl);
  assert.equal(result.savedPath, sceneUrl);
  assert.equal(result.autoBootstrapped, false);
  assert.equal(
    calls.some((call) => call.command === 'query-scene-serialized-data'),
    false
  );
  assert.equal(
    calls.some((call) => call.command === 'save-asset'),
    false
  );
  assert.equal(
    calls.some((call) => call.command === 'create-asset'),
    false
  );
  assert.equal(
    calls.some((call) => call.command === 'refresh-asset'),
    false
  );
});

test('returns save_failed when save-scene fails', async () => {
  const sceneUrl = 'db://assets/scenes/Main.scene';
  const { request } = createRequestStub(async (_channel, command) => {
    if (command === 'query-scene-info') {
      return { url: sceneUrl, dirty: true };
    }
    if (command === 'save-scene') {
      throw new Error('save failed');
    }
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await saveSceneNonInteractive(request);

  assert.equal(result.success, false);
  assert.equal(result.saved, false);
  assert.equal(result.reason, 'save_failed');
  assert.equal(result.sceneUrl, sceneUrl);
  assert.match(String(result.error), /save failed/);
});

test('skips save when scene is not dirty', async () => {
  const { request, calls } = createRequestStub(async (_channel, command) => {
    if (command === 'query-scene-info') {
      return { url: 'db://assets/scenes/Main.scene', dirty: false };
    }
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await saveSceneNonInteractive(request);

  assert.equal(result.success, true);
  assert.equal(result.saved, false);
  assert.equal(result.skipped, true);
  assert.equal(result.reason, 'not_dirty');
  assert.equal(
    calls.some((call) => call.command === 'save-scene'),
    false
  );
});

test('falls back to query-dirty when scene info has no dirty field', async () => {
  const sceneUrl = 'db://assets/scenes/Main.scene';
  const { request, calls } = createRequestStub(async (_channel, command, args) => {
    if (command === 'query-scene-info') {
      return { url: sceneUrl };
    }
    if (command === 'query-dirty') {
      return true;
    }
    if (command === 'save-scene') {
      assert.equal(args.length, 0);
      return sceneUrl;
    }
    throw new Error(`unexpected command: ${command}`);
  });

  const result = await saveSceneNonInteractive(request);

  assert.equal(result.success, true);
  assert.equal(result.saved, true);
  assert.equal(result.sceneUrl, sceneUrl);
  assert.equal(result.savedPath, sceneUrl);
  assert.equal(calls.some((call) => call.command === 'query-dirty'), true);
  assert.equal(calls.some((call) => call.command === 'save-scene'), true);
});
