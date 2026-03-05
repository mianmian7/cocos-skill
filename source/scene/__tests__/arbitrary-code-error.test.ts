import assert from 'node:assert/strict';
import test from 'node:test';

test('executeArbitraryCode should add guidance for nil getComponent type', async () => {
  (globalThis as any).cc = {};
  (globalThis as any).cce = {};
  (globalThis as any).Editor = { App: { path: process.cwd() } };
  const { methods } = await import('../index.js');

  await assert.rejects(
    () => methods.executeArbitraryCode(`
      const node = {
        getComponent(type) {
          if (type == null) {
            throw new Error('getComponent: Type must be non-nil');
          }
          return null;
        }
      };
      node.getComponent(undefined);
    `),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /getComponent: Type must be non-nil/);
      assert.match(error.message, /node\.getComponent\(type\) received undefined\/null/);
      return true;
    },
  );
});
