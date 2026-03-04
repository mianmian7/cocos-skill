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
  assert.equal(body.channel, 'selection');
  assert.equal(body.command, 'select');
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
  assert.deepEqual(selectionUpdates, [
    { type: 'node', uuids: ['node-uuid-0', 'node-uuid-1'] },
  ]);
  assert.equal(messageCalls.length, 0);
});
