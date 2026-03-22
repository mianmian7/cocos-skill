import test from "node:test";
import assert from "node:assert/strict";
import { registerGetAvailableAssetTypesTool } from "../get-available-asset-types.js";
import { registerGetComponentDefinitionsTool } from "../get-component-definitions.js";
import { registerGetEditorContextTool } from "../get-editor-context.js";
import { registerGetNodeDefinitionsTool } from "../get-node-definitions.js";
import { registerQueryComponentsTool } from "../query-components.js";
import type { ToolRegistrar, ToolResult } from "../../../core/tool-contract.js";

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

function createRuntimeEditor(
  request: (channel: string, command: string, ...args: unknown[]) => Promise<unknown>
) {
  (globalThis as any).Editor = {
    Message: { request },
    Selection: {
      getSelected: () => [],
    },
    App: { version: "3.8.5" },
    Project: { path: "/tmp/project" },
  };
}

test("get_available_asset_types should return structured type lists", async () => {
  createRuntimeEditor(async (channel: string, command: string, ...args: unknown[]) => {
    if (channel === "scene" && command === "execute-scene-script") {
      const payload = args[0] as { method?: string } | undefined;
      if (payload?.method === "startCaptureSceneLogs") {
        return undefined;
      }
      if (payload?.method === "getCapturedSceneLogs") {
        return [];
      }
      if (payload?.method === "queryAssetTypes") {
        return ["cc.Prefab", "cc.Material"];
      }
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  });

  const { registrar, getHandler } = createRegistrar();
  registerGetAvailableAssetTypesTool(registrar);
  const body = parseResponse(await getHandler()({}));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_available_asset_types");
  assert.equal((body.meta as any)?.operation, "list-asset-types");
  assert.deepEqual(body.errors, []);
  assert.deepEqual((body.data as any)?.assetTypes, ["cc.Prefab", "cc.Material"]);
});

test("get_node_definitions should return unified definition payloads", async () => {
  createRuntimeEditor(async (channel: string, command: string, ...args: unknown[]) => {
    if (channel === "scene" && command === "execute-scene-script") {
      const payload = args[0] as { method?: string } | undefined;
      if (payload?.method === "startCaptureSceneLogs") {
        return undefined;
      }
      if (payload?.method === "getCapturedSceneLogs") {
        return [];
      }
    }
    if (channel === "scene" && command === "query-node") {
      const uuid = args[0];
      if (uuid === "node-1") {
        return {
          name: { type: "String", value: "Hero" },
          active: { type: "Boolean", value: true },
        };
      }
      return null;
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  });

  const { registrar, getHandler } = createRegistrar();
  registerGetNodeDefinitionsTool(registrar);
  const body = parseResponse(await getHandler()({ nodeUuids: ["node-1"], includeTs: false }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_node_definitions");
  assert.equal((body.meta as any)?.operation, "get-node-definitions");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.nodes?.[0]?.uuid, "node-1");
  assert.equal((body.data as any)?.nodes?.[0]?.properties?.[0]?.path, "active");
});

test("get_component_definitions should return unified definition payloads", async () => {
  createRuntimeEditor(async (channel: string, command: string, ...args: unknown[]) => {
    if (channel === "scene" && command === "execute-scene-script") {
      const payload = args[0] as { method?: string } | undefined;
      if (payload?.method === "startCaptureSceneLogs") {
        return undefined;
      }
      if (payload?.method === "getCapturedSceneLogs") {
        return [];
      }
    }
    if (channel === "scene" && command === "query-component") {
      const uuid = args[0];
      if (uuid === "component-1") {
        return {
          type: "cc.Sprite",
          value: {
            enabled: { type: "Boolean", value: true },
            sizeMode: { type: "Enum", value: 0, enumList: ["CUSTOM", "TRIMMED"] },
          },
        };
      }
      return null;
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  });

  const { registrar, getHandler } = createRegistrar();
  registerGetComponentDefinitionsTool(registrar);
  const body = parseResponse(
    await getHandler()({ componentUuids: ["component-1"], includeTs: false, includeTooltips: false })
  );

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_component_definitions");
  assert.equal((body.meta as any)?.operation, "get-component-definitions");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.components?.[0]?.type, "cc.Sprite");
  assert.equal((body.data as any)?.components?.[0]?.properties?.[0]?.path, "enabled");
});

test("query_components should return unified component query results", async () => {
  createRuntimeEditor(async (channel: string, command: string, ...args: unknown[]) => {
    if (channel === "scene" && command === "execute-scene-script") {
      const payload = args[0] as { method?: string } | undefined;
      if (payload?.method === "startCaptureSceneLogs") {
        return undefined;
      }
      if (payload?.method === "getCapturedSceneLogs") {
        return [];
      }
    }
    if (channel === "scene" && command === "query-component") {
      const uuid = args[0];
      if (uuid === "component-1") {
        return {
          type: "cc.Label",
          value: {
            string: { type: "String", value: "Play" },
          },
        };
      }
      return null;
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  });

  const { registrar, getHandler } = createRegistrar();
  registerQueryComponentsTool(registrar);
  const body = parseResponse(await getHandler()({ componentUuids: ["component-1"] }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "query_components");
  assert.equal((body.meta as any)?.operation, "query-components");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.components?.[0]?.type, "cc.Label");
  assert.equal((body.data as any)?.components?.[0]?.properties?.[0]?.path, "string");
});

test("get_editor_context should return unified editor snapshots", async () => {
  createRuntimeEditor(async (channel: string, command: string, ...args: unknown[]) => {
    if (channel === "scene" && command === "query-scene-info") {
      return { url: "db://assets/Main.scene", dirty: true };
    }
    if (channel === "scene" && command === "query-node-tree") {
      return {
        children: [{ uuid: "root-node", name: "Canvas", children: [] }],
      };
    }
    if (channel === "scene" && command === "query-node") {
      return {
        name: { value: "Canvas" },
        __path__: "Canvas",
        __children__: [],
        __comps__: [{ type: "cc.Canvas" }],
      };
    }
    if (channel === "scene" && command === "execute-scene-script") {
      const payload = args[0] as { method?: string; args?: unknown[] } | undefined;
      if (payload?.method === "startCaptureSceneLogs") {
        return undefined;
      }
      if (payload?.method === "getCapturedSceneLogs") {
        return [];
      }
      if (payload?.method === "getLastSceneLogs") {
        return ["scene-log"];
      }
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  });
  (globalThis as any).Editor.Selection.getSelected = () => ["root-node"];

  const { registrar, getHandler } = createRegistrar();
  registerGetEditorContextTool(registrar);
  const body = parseResponse(await getHandler()({ includeHierarchy: true, includeRecentLogs: true }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "get_editor_context");
  assert.equal((body.meta as any)?.operation, "get-editor-context");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.mode, "scene");
  assert.equal((body.data as any)?.selectedNodes?.[0]?.name, "Canvas");
});
