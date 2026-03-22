import test from "node:test";
import assert from "node:assert/strict";
import { runToolWithContext } from "../tool-runtime.js";
import type { EditorMessageRequest } from "../tool-context.js";

function parseResponse(result: { content: Array<{ text?: string }> }): Record<string, unknown> {
  const text = result.content[0]?.text;
  assert.ok(text, "tool should return text response");
  return JSON.parse(text);
}

test("runToolWithContext should not capture scene logs unless explicitly enabled", async () => {
  const calls: Array<{ channel: string; command: string }> = [];
  const request: EditorMessageRequest = async (channel, command) => {
    calls.push({ channel, command });
    if (channel === "project" && command === "query-config") {
      return { ok: true };
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  };

  const response = await runToolWithContext(
    {
      toolName: "operate_project_settings",
      operation: "read-settings",
      effect: "read",
      packageName: "cocos-skill",
    },
    async ({ request: contextRequest }) => {
      const result = await contextRequest("project", "query-config", "project", "general.designResolution");
      return { data: result };
    },
    request
  );

  const body = parseResponse(response);
  assert.equal(body.success, true);
  assert.deepEqual(calls, [{ channel: "project", command: "query-config" }]);
});

test("runToolWithContext should report capture initialization failures in the unified envelope", async () => {
  const request: EditorMessageRequest = async (channel, command, payload) => {
    if (channel === "scene" && command === "execute-scene-script") {
      const method = (payload as { method?: string } | undefined)?.method;
      if (method === "startCaptureSceneLogs") {
        throw new Error("scene log capture unavailable");
      }
      if (method === "getCapturedSceneLogs") {
        return [];
      }
    }
    throw new Error(`unexpected command: ${channel}:${command}`);
  };

  const response = await runToolWithContext(
    {
      toolName: "execute_scene_code",
      operation: "execute-scene-code",
      effect: "mutating-scene",
      packageName: "cocos-skill",
      captureSceneLogs: true,
    },
    async () => ({ ok: true }),
    request
  );

  const body = parseResponse(response);
  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, "execute_scene_code");
  assert.equal((body.meta as any)?.operation, "execute-scene-code");
  assert.match(String((body.errors as any)?.[0]?.message), /scene log capture unavailable/);
});
