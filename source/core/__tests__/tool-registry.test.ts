import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { ToolRegistry } from '../tool-registry.js';
import type { ToolResult } from '../tool-contract.js';

test('ToolRegistry should unwrap nested args payload using schema keys', async () => {
  const registry = new ToolRegistry();
  registry.registerTool(
    'operate_current_scene',
    {
      title: 'Operate current scene',
      description: 'test',
      inputSchema: {
        operation: z.enum(['open', 'save']),
      },
    },
    async (args): Promise<ToolResult> => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: true,
            operation: args.operation,
          }),
        },
      ],
    })
  );

  const payload = {
    requestId: 'req-1',
    input: {
      arguments: {
        operation: 'save',
      },
    },
  };

  const result = await registry.execute('operate_current_scene', payload);
  assert.deepEqual(result, {
    success: true,
    data: {
      operation: 'save',
    },
    errors: [],
    warnings: [],
    logs: [],
    meta: {
      tool: 'operate_current_scene',
    },
  });
});

test('ToolRegistry should normalize legacy error payloads into the unified response envelope', async () => {
  const registry = new ToolRegistry();
  registry.registerTool(
    'broken_tool',
    {
      title: 'Broken tool',
      description: 'test',
      inputSchema: {
        operation: z.string(),
      },
    },
    async (): Promise<ToolResult> => ({
      content: [
        {
          type: 'text',
          text: JSON.stringify({
            success: false,
            error: 'bad input',
            details: {
              field: 'operation',
            },
            logs: ['validation failed'],
          }),
        },
      ],
    })
  );

  const result = await registry.execute('broken_tool', {
    operation: 'demo',
  });

  assert.deepEqual(result, {
    success: false,
    data: {
      details: {
        field: 'operation',
      },
    },
    errors: [
      {
        code: 'tool_error',
        message: 'bad input',
      },
    ],
    warnings: [],
    logs: ['validation failed'],
    meta: {
      tool: 'broken_tool',
    },
  });
});
