import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeToolRequestArgs } from '../http-tool-server.js';

test('normalizeToolRequestArgs should keep plain tool args unchanged', () => {
  const payload = { operation: 'inspect-hierarchy', maxDepth: 2 };
  assert.deepEqual(normalizeToolRequestArgs(payload), payload);
});

test('normalizeToolRequestArgs should unwrap arguments object with metadata', () => {
  const payload = {
    toolName: 'operate_current_scene',
    arguments: { operation: 'inspect-hierarchy', maxDepth: 3 },
  };
  assert.deepEqual(normalizeToolRequestArgs(payload), payload.arguments);
});

test('normalizeToolRequestArgs should parse and unwrap json-string arguments', () => {
  const payload = {
    arguments: JSON.stringify({
      nodes: [{ type: 'Empty', name: 'NodeA' }],
    }),
  };
  assert.deepEqual(normalizeToolRequestArgs(payload), {
    nodes: [{ type: 'Empty', name: 'NodeA' }],
  });
});

test('normalizeToolRequestArgs should not unwrap params when payload has business fields', () => {
  const payload = {
    action: 'delete_nodes',
    params: { uuids: ['node-1'] },
  };
  assert.deepEqual(normalizeToolRequestArgs(payload), payload);
});

test('normalizeToolRequestArgs should unwrap nested input -> arguments', () => {
  const payload = {
    input: {
      arguments: {
        operation: 'save',
      },
    },
  };
  assert.deepEqual(normalizeToolRequestArgs(payload), { operation: 'save' });
});
