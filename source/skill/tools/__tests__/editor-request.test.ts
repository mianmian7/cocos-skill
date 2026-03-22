import test from 'node:test';
import assert from 'node:assert/strict';
import { registerEditorRequestTool } from '../editor-request.js';
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

function parseResponse(result: ToolResult): any {
  const text = result.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  return JSON.parse(text);
}

test('selection commands should use Editor.Selection API instead of Message.request', async () => {
  const selectionCalls: Array<{ method: string; args: unknown[] }> = [];
  const messageCalls: Array<{ channel: string; command: string; args: unknown[] }> = [];

  (globalThis as any).Editor = {
    Selection: {
      select(type: string, uuids: string[]) {
        selectionCalls.push({ method: 'select', args: [type, uuids] });
      },
    },
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        messageCalls.push({ channel, command, args });
        throw new Error(`Message does not exist: ${channel} - ${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const handler = getHandler();

  const response = await handler({
    channel: 'selection',
    command: 'select',
    args: ['node', ['node-uuid-1']],
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'editor_request');
  assert.equal(body.meta.operation, 'selection:select');
  assert.equal(body.data.channel, 'selection');
  assert.equal(body.data.command, 'select');
  assert.equal(selectionCalls.length, 1);
  assert.deepEqual(selectionCalls[0], { method: 'select', args: ['node', ['node-uuid-1']] });
  assert.equal(messageCalls.length, 0);
});

test('selection commands should work when Editor.Selection is a function object', async () => {
  const selectionCalls: Array<{ method: string; args: unknown[] }> = [];
  const messageCalls: Array<{ channel: string; command: string; args: unknown[] }> = [];

  function SelectionApi() {
    // no-op
  }
  (SelectionApi as any).select = (type: string, uuids: string[]) => {
    selectionCalls.push({ method: 'select', args: [type, uuids] });
  };

  (globalThis as any).Editor = {
    Selection: SelectionApi,
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        messageCalls.push({ channel, command, args });
        throw new Error(`Message does not exist: ${channel} - ${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const handler = getHandler();

  const response = await handler({
    channel: 'selection',
    command: 'select',
    args: ['node', ['node-uuid-1']],
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'editor_request');
  assert.equal(body.meta.operation, 'selection:select');
  assert.equal(selectionCalls.length, 1);
  assert.deepEqual(selectionCalls[0], { method: 'select', args: ['node', ['node-uuid-1']] });
  assert.equal(messageCalls.length, 0);
});

test('selection commands should fallback to getSelected/update when select is unavailable', async () => {
  const selectionUpdates: Array<{ type: string; uuids: string[] }> = [];
  const messageCalls: Array<{ channel: string; command: string; args: unknown[] }> = [];

  (globalThis as any).Editor = {
    Selection: {
      getSelected(type: string) {
        return type === 'node' ? ['node-uuid-0'] : [];
      },
      update(type: string, uuids: string[]) {
        selectionUpdates.push({ type, uuids });
      },
    },
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        messageCalls.push({ channel, command, args });
        throw new Error(`Message does not exist: ${channel} - ${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const handler = getHandler();

  const response = await handler({
    channel: 'selection',
    command: 'select',
    args: ['node', ['node-uuid-1']],
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'editor_request');
  assert.equal(body.meta.operation, 'selection:select');
  assert.deepEqual(selectionUpdates, [
    { type: 'node', uuids: ['node-uuid-0', 'node-uuid-1'] },
  ]);
  assert.equal(messageCalls.length, 0);
});

test('editor_request should decode nested asset uuids in set-property dump', async () => {
  const rawAssetUuid = 'f772788e-54f9-4c36-aa61-a7e83d0b5eee@f9941';
  const encodedAssetUuid = Buffer.from(rawAssetUuid, 'utf8').toString('base64');
  const messageCalls: Array<{ channel: string; command: string; args: unknown[] }> = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        messageCalls.push({ channel, command, args });
        return { ok: true };
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const handler = getHandler();

  const response = await handler({
    channel: 'scene',
    command: 'set-property',
    encodeResultUuids: false,
    args: [
      {
        uuid: 'f772788e-54f9-4c36-aa61-a7e83d0b5eee',
        path: 'spriteFrame',
        dump: {
          type: 'cc.Asset',
          value: {
            uuid: encodedAssetUuid,
          },
        },
      },
    ],
  });

  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'editor_request');
  assert.equal(body.meta.operation, 'scene:set-property');
  const setPropertyCall = messageCalls.find((call) => call.command === 'set-property');
  assert.ok(setPropertyCall);
  assert.equal(messageCalls.filter((call) => call.command === 'snapshot').length, 1);
  const forwardedArg = setPropertyCall.args[0] as any;
  assert.equal(forwardedArg.dump.value.uuid, rawAssetUuid);
  assert.equal(body.data.channel, 'scene');
  assert.equal(body.data.command, 'set-property');
  assert.deepEqual(body.errors, []);
});

test('editor_request should truncate oversized payloads instead of summarizing when summarize=false', async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => ({
        alpha: 'A'.repeat(200),
        beta: 'B'.repeat(200),
        nested: {
          marker: 'RAW_FIELD',
        },
      }),
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const body = parseResponse(
    await getHandler()({
      channel: 'project',
      command: 'query-config',
      args: ['project', 'general.designResolution'],
      maxResultSize: 180,
      summarize: false,
    })
  );

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'editor_request');
  assert.equal(body.meta.operation, 'project:query-config');
  assert.equal(body.data.channel, 'project');
  assert.equal(body.data.command, 'query-config');
  assert.equal(body.data.mode, 'read');
  assert.equal(body.data.truncated, true);
  assert.equal(typeof body.data.resultPreview, 'string');
  assert.match(String(body.data.resultPreview), /RAW_FIELD/);
  assert.equal(body.data.summary, undefined);
  assert.deepEqual(body.warnings, ['Result exceeded maxResultSize and was truncated']);
});

test('editor_request should keep summarize=false successful when oversized result is undefined', async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => undefined,
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const body = parseResponse(
    await getHandler()({
      channel: 'project',
      command: 'query-config',
      args: ['project', 'general.designResolution'],
      maxResultSize: 20,
      summarize: false,
    })
  );

  assert.equal(body.success, true);
  assert.equal(body.data.truncated, true);
  assert.equal(body.data.channel, 'project');
  assert.equal(body.data.command, 'query-config');
  assert.equal(body.data.mode, 'read');
  assert.equal(body.data.resultPreview, 'undefined');
  assert.deepEqual(body.errors, []);
  assert.deepEqual(body.warnings, ['Result exceeded maxResultSize and was truncated']);
});

test('editor_request should keep final response text within maxResultSize for truncated previews', async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => ({
        alpha: 'A'.repeat(400),
        beta: 'B'.repeat(400),
        nested: { marker: 'RAW_FIELD' },
      }),
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const response = await getHandler()({
    channel: 'project',
    command: 'query-config',
    args: ['project', 'general.designResolution'],
    maxResultSize: 500,
    summarize: false,
  });
  const text = response.content[0]?.text;
  assert.ok(text, 'tool should return text response');
  const body = JSON.parse(text);

  assert.equal(body.success, true);
  assert.equal(body.data.truncated, true);
  assert.ok(text.length <= 500, `response length ${text.length} should stay within maxResultSize`);
});

test('editor_request should keep channel and mode fields when summarize=true returns a summary', async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => ({
        alpha: 'A'.repeat(400),
        beta: 'B'.repeat(400),
      }),
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const body = parseResponse(
    await getHandler()({
      channel: 'project',
      command: 'query-config',
      args: ['project', 'general.designResolution'],
      maxResultSize: 500,
      summarize: true,
    })
  );

  assert.equal(body.success, true);
  assert.equal(body.data.channel, 'project');
  assert.equal(body.data.command, 'query-config');
  assert.equal(body.data.mode, 'read');
  assert.equal(body.data.truncated, true);
  assert.equal(typeof body.data.summary, 'object');
});

test('editor_request should reject summarize=true budgets that are below the minimum summarized envelope size', async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => ({
        alpha: 'A'.repeat(400),
        beta: 'B'.repeat(400),
      }),
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerEditorRequestTool(registrar);
  const body = parseResponse(
    await getHandler()({
      channel: 'project',
      command: 'query-config',
      args: ['project', 'general.designResolution'],
      maxResultSize: 120,
      summarize: true,
    })
  );

  assert.equal(body.success, false);
  assert.match(String(body.errors?.[0]?.message), /maxResultSize is too small/i);
  assert.equal(typeof body.data.minimumMaxResultSize, 'number');
});
