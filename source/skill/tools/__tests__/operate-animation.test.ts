import test from 'node:test';
import assert from 'node:assert/strict';

test('operate_animation module should be importable and export registerOperateAnimationTool', async () => {
  const modulePath = '../operate-animation.js';
  let mod: any;

  try {
    mod = await import(modulePath as string);
  } catch (error) {
    assert.fail(`expected ${modulePath} to be importable, got: ${error instanceof Error ? error.message : String(error)}`);
  }

  assert.equal(typeof mod.registerOperateAnimationTool, 'function');
});

test('registerOperateAnimationTool should register tool and call scene script method', async () => {
  const modulePath = '../operate-animation.js';
  const { registerOperateAnimationTool } = await import(modulePath as string);

  let handler: any = null;

  const registrar = {
    registerTool(_name: string, _definition: any, registeredHandler: any) {
      handler = registeredHandler;
    },
  };

  const calls: Array<{ channel: string; command: string; args: unknown[] }> = [];

  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });

        if (channel === 'scene' && command === 'execute-scene-script') {
          const options = args[0] as any;
          if (options?.method === 'startCaptureSceneLogs') return undefined;
          if (options?.method === 'getCapturedSceneLogs') return ['LOG: ok'];
          if (options?.method === 'operateAnimation') {
            return {
              success: true,
              targetResolved: {
                kind: 'legacy',
                nodeUuid: 'node-uuid',
                componentUuid: 'comp-uuid',
              },
              data: { ok: true },
            };
          }
        }

        if (channel === 'scene' && command === 'snapshot') return undefined;

        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  (registerOperateAnimationTool as any)(registrar);
  assert.ok(handler, 'tool handler should be registered');

  const response = await handler({
    operation: 'list',
    target: { kind: 'legacy', nodeUuid: 'node-uuid' },
    options: {},
  });

  assert.equal(typeof response.content?.[0]?.text, 'string');
  const body = JSON.parse(response.content[0].text) as any;
  assert.equal(body.success, true);
  assert.equal(body.meta.tool, 'operate_animation');
  assert.equal(body.meta.operation, 'list');
  assert.equal(body.data.ok, true);
  assert.equal(body.data.targetResolved.componentUuid, 'comp-uuid');
  assert.deepEqual(body.errors, []);

  const methods = calls
    .filter((call) => call.channel === 'scene' && call.command === 'execute-scene-script')
    .map((call) => (call.args[0] as any)?.method);

  assert.deepEqual(methods, ['startCaptureSceneLogs', 'operateAnimation', 'getCapturedSceneLogs']);
});
