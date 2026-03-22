import test from 'node:test';
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { registerOperateAssetsTool } from '../operate-assets.js';
import type { ToolRegistrar, ToolResult } from '../../../core/tool-contract.js';

type MessageCall = {
  channel: string;
  command: string;
  args: unknown[];
};

type ToolHandler = (args: any) => Promise<ToolResult>;

type EditorStubOptions = {
  existingPaths: string[];
  forbiddenCommands: string[];
  queryAssetInfoAlwaysNull?: boolean;
  projectPath?: string;
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

function installCreateOverwriteEditorStub(existingPath: string): MessageCall[] {
  const calls: MessageCall[] = [];
  (globalThis as any).Editor = {
    Project: {
      path: '',
    },
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

        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (args[0] === existingPath) {
            return { uuid: 'existing-asset-uuid', url: existingPath };
          }
          return null;
        }

        if (channel === 'asset-db' && command === 'create-asset') {
          return { uuid: 'created-asset-uuid' };
        }

        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  return calls;
}

function installEditorStub(options: EditorStubOptions): MessageCall[] {
  const existingPathSet = new Set(options.existingPaths);
  const forbiddenCommandSet = new Set(options.forbiddenCommands);
  const calls: MessageCall[] = [];
  (globalThis as any).Editor = {
    Project: {
      path: options.projectPath ?? '',
    },
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

        if (channel === 'asset-db' && command === 'query-asset-info') {
          if (options.queryAssetInfoAlwaysNull) {
            return null;
          }
          const queryPath = String(args[0]);
          if (existingPathSet.has(queryPath)) {
            return { uuid: 'existing-asset-uuid', url: queryPath };
          }
          return null;
        }

        if (channel === 'asset-db' && forbiddenCommandSet.has(command)) {
          throw new Error(`${command} should not be called when target already exists`);
        }

        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };
  return calls;
}

function parseResponse(result: ToolResult): any {
  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  return JSON.parse(text);
}

test('create folder should skip when destination already exists', async () => {
  const existingPath = 'db://assets/cocos-skill-test';
  const calls = installEditorStub({
    existingPaths: [existingPath],
    forbiddenCommands: ['create-asset', 'copy-asset'],
  });
  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const handler = getHandler();

  const result = await handler({
    operation: 'create',
    operationOptions: [
      {
        destinationPath: existingPath,
        newAssetType: 'Folder',
      },
    ],
  });

  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'create');
  assert.deepEqual(body.errors, []);
  assert.equal(Array.isArray(body.data?.results), true);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].operation, 'create');
  assert.equal(body.data.results[0].path, existingPath);
  assert.equal(body.data.results[0].skipped, true);
  assert.equal(body.data.results[0].reason, 'already_exists');

  const calledCreateLikeCommand = calls.some(
    (call) => call.channel === 'asset-db' && ['create-asset', 'copy-asset'].includes(call.command)
  );
  assert.equal(calledCreateLikeCommand, false);
});

test('copy should skip when destination already exists', async () => {
  const sourcePath = 'db://assets/source.prefab';
  const destinationPath = 'db://assets/copied-target.prefab';
  const calls = installEditorStub({
    existingPaths: [sourcePath, destinationPath],
    forbiddenCommands: ['copy-asset'],
  });
  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const handler = getHandler();

  const result = await handler({
    operation: 'copy',
    operationOptions: [
      {
        originalAssetPath: sourcePath,
        destinationPath,
      },
    ],
  });

  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'copy');
  assert.deepEqual(body.errors, []);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].operation, 'copy');
  assert.equal(body.data.results[0].to, destinationPath);
  assert.equal(body.data.results[0].skipped, true);
  assert.equal(body.data.results[0].reason, 'already_exists');

  const calledCopyAsset = calls.some(
    (call) => call.channel === 'asset-db' && call.command === 'copy-asset'
  );
  assert.equal(calledCopyAsset, false);
});

test('move should skip when destination already exists', async () => {
  const sourcePath = 'db://assets/source.prefab';
  const destinationPath = 'db://assets/moved-target.prefab';
  const calls = installEditorStub({
    existingPaths: [sourcePath, destinationPath],
    forbiddenCommands: ['move-asset'],
  });
  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const handler = getHandler();

  const result = await handler({
    operation: 'move',
    operationOptions: [
      {
        originalAssetPath: sourcePath,
        destinationPath,
      },
    ],
  });

  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'move');
  assert.deepEqual(body.errors, []);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].operation, 'move');
  assert.equal(body.data.results[0].to, destinationPath);
  assert.equal(body.data.results[0].skipped, true);
  assert.equal(body.data.results[0].reason, 'already_exists');

  const calledMoveAsset = calls.some(
    (call) => call.channel === 'asset-db' && call.command === 'move-asset'
  );
  assert.equal(calledMoveAsset, false);
});

test('create with overwrite should query first and pass overwrite option', async () => {
  const existingPath = 'db://assets/cocos-skill-test';
  const calls = installCreateOverwriteEditorStub(existingPath);
  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const handler = getHandler();

  const result = await handler({
    operation: 'create',
    operationOptions: [
      {
        destinationPath: existingPath,
        newAssetType: 'Folder',
        overwrite: true,
      },
    ],
  });

  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);
  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'create');
  assert.deepEqual(body.errors, []);
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].operation, 'create');
  assert.equal(body.data.results[0].path, existingPath);
  assert.equal(body.data.results[0].skipped ?? false, false);

  const queryIndex = calls.findIndex(
    (call) =>
      call.channel === 'asset-db' &&
      call.command === 'query-asset-info' &&
      call.args[0] === existingPath
  );
  const createIndex = calls.findIndex(
    (call) => call.channel === 'asset-db' && call.command === 'create-asset'
  );
  assert.notEqual(queryIndex, -1);
  assert.notEqual(createIndex, -1);
  assert.ok(queryIndex < createIndex, 'query-asset-info should happen before create-asset');

  const createCall = calls[createIndex];
  assert.deepEqual(createCall.args[2], { overwrite: true, rename: false });
});

test('create folder should skip when filesystem path exists but asset-db misses it', async () => {
  const projectRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'cocos-skill-operate-assets-'));
  const existingFsFolder = path.join(projectRoot, 'assets', 'cocos-skill-fs-fallback');
  fs.mkdirSync(existingFsFolder, { recursive: true });

  try {
    const destinationPath = 'db://assets/cocos-skill-fs-fallback';
    const calls = installEditorStub({
      existingPaths: [],
      forbiddenCommands: ['create-asset', 'copy-asset'],
      queryAssetInfoAlwaysNull: true,
      projectPath: projectRoot,
    });
    const { registrar, getHandler } = createRegistrar();
    registerOperateAssetsTool(registrar);
    const handler = getHandler();

    const result = await handler({
      operation: 'create',
      operationOptions: [
        {
          destinationPath,
          newAssetType: 'Folder',
        },
      ],
    });

    const text = result.content[0]?.text;
    assert.ok(text, 'tool should return text response');
    const body = JSON.parse(text);
    assert.equal(body.success, true);
    assert.equal((body.meta as any)?.tool, 'operate_assets');
    assert.equal((body.meta as any)?.operation, 'create');
    assert.deepEqual(body.errors, []);
    assert.equal(body.data.results.length, 1);
    assert.equal(body.data.results[0].operation, 'create');
    assert.equal(body.data.results[0].path, destinationPath);
    assert.equal(body.data.results[0].skipped, true);
    assert.equal(body.data.results[0].reason, 'already_exists');

    const calledCreateAsset = calls.some(
      (call) => call.channel === 'asset-db' && ['create-asset', 'copy-asset'].includes(call.command)
    );
    assert.equal(calledCreateAsset, false);
  } finally {
    fs.rmSync(projectRoot, { recursive: true, force: true });
  }
});

test('create should report top-level failure when asset-db returns malformed mutation result', async () => {
  (globalThis as any).Editor = {
    Project: {
      path: '',
    },
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === 'asset-db' && command === 'query-asset-info') {
          return null;
        }
        if (channel === 'asset-db' && command === 'create-asset') {
          return null;
        }
        throw new Error(`unexpected command: ${channel}:${command}:${String(args[0] ?? '')}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const body = parseResponse(
    await getHandler()({
      operation: 'create',
      operationOptions: [
        {
          destinationPath: 'db://assets/broken-folder',
          newAssetType: 'Folder',
        },
      ],
    })
  );

  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'create');
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].success, false);
});

test('copy should report top-level failure when asset-db returns malformed mutation result', async () => {
  (globalThis as any).Editor = {
    Project: {
      path: '',
    },
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === 'asset-db' && command === 'query-asset-info') {
          const queryPath = String(args[0]);
          if (queryPath === 'db://assets/source.prefab') {
            return { uuid: 'source-uuid', url: queryPath };
          }
          return null;
        }
        if (channel === 'asset-db' && command === 'copy-asset') {
          return false;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateAssetsTool(registrar);
  const body = parseResponse(
    await getHandler()({
      operation: 'copy',
      operationOptions: [
        {
          originalAssetPath: 'db://assets/source.prefab',
          destinationPath: 'db://assets/copied.prefab',
        },
      ],
    })
  );

  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, 'operate_assets');
  assert.equal((body.meta as any)?.operation, 'copy');
  assert.equal(body.data.results.length, 1);
  assert.equal(body.data.results[0].success, false);
});
