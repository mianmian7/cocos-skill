import test from "node:test";
import assert from "node:assert/strict";
import { registerApplyGatedActionTool } from "../apply-gated-action.js";
import { registerExecuteSceneCodeTool } from "../execute-scene-code.js";
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

test("apply_gated_action should return unified approval previews", async () => {
  (globalThis as any).Editor = {
    Message: {
      request: async () => {
        throw new Error("preview flow should not hit Editor.Message.request");
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerApplyGatedActionTool(registrar);
  const body = parseResponse(await getHandler()({ action: "delete_nodes", params: { uuids: ["node-1"] } }));

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "apply_gated_action");
  assert.equal((body.meta as any)?.operation, "approval-preview");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.requiresApproval, true);
  assert.equal((body.data as any)?.action, "delete_nodes");
  assert.equal(typeof (body.data as any)?.approvalToken, "string");
});

test("execute_scene_code should return unified execution results", async () => {
  const calls: Array<{ channel: string; command: string; args: unknown[] }> = [];
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
            return ["LOG: ok"];
          }
          if (payload?.method === "executeArbitraryCode") {
            return { ok: true };
          }
        }
        if (channel === "scene" && command === "snapshot") {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerExecuteSceneCodeTool(registrar);
  const body = parseResponse(
    await getHandler()({
      code: "return 1;",
      returnResult: true,
      skipValidation: true,
      showApiDocs: false,
    })
  );

  assert.equal(body.success, true);
  assert.equal((body.meta as any)?.tool, "execute_scene_code");
  assert.equal((body.meta as any)?.operation, "execute-scene-code");
  assert.deepEqual(body.errors, []);
  assert.equal((body.data as any)?.result?.ok, true);
  assert.equal((body.data as any)?.codeLength, "return 1;".length);
  assert.deepEqual(body.logs, ["LOG: ok"]);

  const methods = calls
    .filter((call) => call.channel === "scene" && call.command === "execute-scene-script")
    .map((call) => (call.args[0] as any)?.method);
  assert.deepEqual(methods, ["startCaptureSceneLogs", "executeArbitraryCode", "getCapturedSceneLogs"]);
});
