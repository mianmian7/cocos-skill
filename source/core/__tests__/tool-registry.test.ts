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
    operation: 'save',
  });
});
