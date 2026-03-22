import test from "node:test";
import assert from "node:assert/strict";
import { registerOperateProjectSettingsTool } from "../operate-project-settings.js";
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

test("read settings should return unified envelope without reload side effects", async () => {
  const calls: RequestCall[] = [];
  (globalThis as any).Editor = {
    Message: {
      request: async (channel: string, command: string, ...args: unknown[]) => {
        calls.push({ channel, command, args });
        if (channel === "project" && command === "query-config") {
          const key = args[1];
          if (key === "general.designResolution") {
            return { width: 1280, height: 720, fitWidth: true, fitHeight: false };
          }
          if (key === "layer") {
            return [];
          }
          if (key === "sorting-layer.layers") {
            return [{ id: 0, name: "default", value: 0 }];
          }
          if (key === "physics.collisionGroups") {
            return [];
          }
          if (key === "physics.collisionMatrix") {
            return [];
          }
        }
        if (channel === "scene" && (command === "soft-reload" || command === "snapshot")) {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateProjectSettingsTool(registrar);
  const handler = getHandler();
  const response = await handler({});
  const body = parseResponse(response);

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "operate_project_settings");
  assert.equal((body.meta as any)?.operation, "read-settings");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.actualSettings?.designResolution?.width, 1280);

  const reloadCalled = calls.some((call) => call.channel === "scene" && call.command === "soft-reload");
  const snapshotCalled = calls.some((call) => call.channel === "scene" && call.command === "snapshot");
  const sceneScriptCalled = calls.some((call) => call.channel === "scene" && call.command === "execute-scene-script");
  assert.equal(reloadCalled, false);
  assert.equal(snapshotCalled, false);
  assert.equal(sceneScriptCalled, false);
});

test("update settings should expose structured errors and still return actual settings", async () => {
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
        if (channel === "project" && command === "set-config") {
          return false;
        }
        if (channel === "project" && command === "query-config") {
          const key = args[1];
          if (key === "general.designResolution") {
            return { width: 1920, height: 1080, fitWidth: true, fitHeight: false };
          }
          if (key === "layer") {
            return [];
          }
          if (key === "sorting-layer.layers") {
            return [{ id: 0, name: "default", value: 0 }];
          }
          if (key === "physics.collisionGroups") {
            return [];
          }
          if (key === "physics.collisionMatrix") {
            return [];
          }
        }
        if (channel === "scene" && (command === "soft-reload" || command === "snapshot")) {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateProjectSettingsTool(registrar);
  const handler = getHandler();
  const response = await handler({
    designResolution: {
      width: 1920,
      height: 1080,
      fitWidth: true,
      fitHeight: false,
    },
  });
  const body = parseResponse(response);

  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, "operate_project_settings");
  assert.equal((body.meta as any)?.operation, "update-settings");
  assert.match(String((body.errors as any)?.[0]?.message), /Error setting: Failed to set design resolution/);
  assert.equal((body.data as any)?.actualSettings?.designResolution?.width, 1920);

  const reloadCalled = calls.some((call) => call.channel === "scene" && call.command === "soft-reload");
  const snapshotCalled = calls.some((call) => call.channel === "scene" && call.command === "snapshot");
  assert.equal(reloadCalled, true);
  assert.equal(snapshotCalled, true);
});
