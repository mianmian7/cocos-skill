import test from "node:test";
import assert from "node:assert/strict";
import { registerGetAssetsByTypeTool } from "../get-assets-by-type.js";
import { registerGetAvailableComponentTypesTool } from "../get-available-component-types.js";
import { registerQueryNodesTool } from "../query-nodes.js";
import { registerSearchNodesTool } from "../search-nodes.js";
import type { ToolRegistrar, ToolResult } from "../../../core/tool-contract.js";

type ToolHandler = (args: any) => Promise<ToolResult>;

type RequestCall = {
  channel: string;
  command: string;
  args: unknown[];
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
      assert.ok(handler, "tool handler should be registered");
      return handler;
    },
  };
}

function parseResponse(result: ToolResult): Record<string, unknown> {
  const text = result.content[0]?.text;
  assert.ok(text, "tool should return text response");
  return JSON.parse(text);
}

test("query_nodes should return unified envelope for successful hierarchy reads", async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === "scene" && command === "execute-scene-script") {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === "startCaptureSceneLogs") {
            return undefined;
          }
          if (payload?.method === "getCapturedSceneLogs") {
            return [];
          }
        }
        if (channel === "scene" && command === "query-node-tree") {
          return {
            uuid: "root-node",
            name: "Root",
            children: [{ uuid: "child-node", name: "Child", children: [] }],
          };
        }
        if (channel === "scene" && command === "query-node") {
          const uuid = args[0];
          if (uuid === "root-node") {
            return { uuid: "root-node", name: "Root", children: [] };
          }
          if (uuid === "child-node") {
            return { uuid: "child-node", name: "Child", children: [] };
          }
          return null;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerQueryNodesTool(registrar);
  const body = parseResponse(
    await getHandler()({
      includeProperties: false,
      includeComponents: false,
      includeComponentProperties: false,
      maxDepth: 1,
    })
  );

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "query_nodes");
  assert.equal((body.meta as any)?.operation, "query-nodes");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.hierarchy?.name, "Root");
});

test("search_nodes should expose structured validation errors", async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === "scene" && command === "execute-scene-script") {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === "startCaptureSceneLogs") {
            return undefined;
          }
          if (payload?.method === "getCapturedSceneLogs") {
            return [];
          }
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerSearchNodesTool(registrar);
  const body = parseResponse(await getHandler()({}));

  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, "search_nodes");
  assert.equal((body.meta as any)?.operation, "search-nodes");
  assert.match(String((body.errors as any)?.[0]?.message), /至少需要提供一个搜索条件/);
});

test("search_nodes should return unified envelope for successful searches", async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === "scene" && command === "execute-scene-script") {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === "startCaptureSceneLogs") {
            return undefined;
          }
          if (payload?.method === "getCapturedSceneLogs") {
            return [];
          }
        }
        if (channel === "scene" && command === "query-node-tree") {
          return {
            name: "Canvas",
            uuid: "canvas-node",
            children: [{ name: "EnemyBoss", uuid: "enemy-node", children: [] }],
          };
        }
        if (channel === "scene" && command === "query-node") {
          return { __comps__: [] };
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerSearchNodesTool(registrar);
  const body = parseResponse(await getHandler()({ namePattern: "Enemy*", limit: 10, offset: 0 }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "search_nodes");
  assert.equal((body.meta as any)?.operation, "search-nodes");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.results?.[0]?.name, "EnemyBoss");
  assert.equal((body.data as any)?.total, 1);
});

test("get_available_component_types should return structured type lists", async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        if (channel === "scene" && command === "execute-scene-script") {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === "startCaptureSceneLogs") {
            return undefined;
          }
          if (payload?.method === "getCapturedSceneLogs") {
            return [];
          }
          if (payload?.method === "queryComponentTypes") {
            return ["cc.Sprite", "cc.Camera"];
          }
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerGetAvailableComponentTypesTool(registrar);
  const body = parseResponse(await getHandler()({ nameFilter: "Sprite" }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_available_component_types");
  assert.equal((body.meta as any)?.operation, "list-component-types");
  assert.deepEqual(body.errors, []);
  assert.deepEqual((body.data as any)?.componentTypes, ["cc.Sprite"]);
});

test("get_assets_by_type should return structured asset lists", async () => {
  const calls: RequestCall[] = [];
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === "scene" && command === "execute-scene-script") {
          const payload = args[0] as { method?: string } | undefined;
          if (payload?.method === "startCaptureSceneLogs") {
            return undefined;
          }
          if (payload?.method === "getCapturedSceneLogs") {
            return [];
          }
        }
        if (channel === "asset-db" && command === "query-assets") {
          return [
            { name: "Hero", url: "db://assets/Hero.prefab", uuid: "prefab-uuid", type: "cc.Prefab" },
            { name: "Background", url: "db://assets/bg.png", uuid: "texture-uuid", type: "cc.Texture2D" },
          ];
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerGetAssetsByTypeTool(registrar);
  const body = parseResponse(await getHandler()({ ccType: "cc.Prefab", lookForTemplates: false }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_assets_by_type");
  assert.equal((body.meta as any)?.operation, "get-assets-by-type");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.assets?.[0]?.name, "Hero");

  const queriedPattern = calls.find(
    (call) => call.channel === "asset-db" && call.command === "query-assets"
  )?.args[0] as { pattern?: string } | undefined;
  assert.equal(queriedPattern?.pattern, "db://assets/**");
});
