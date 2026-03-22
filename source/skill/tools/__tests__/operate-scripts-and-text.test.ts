import test from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as os from "node:os";
import * as path from "node:path";
import { registerOperateScriptsAndTextTool } from "../operate-scripts-and-text.js";
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

test("read should return unified envelope without snapshot side effects", async () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "cocos-skill-read-"));
  const filePath = path.join(tempDir, "sample.ts");
  fs.writeFileSync(filePath, "line1\nline2\nline3\n", "utf8");
  const assetUrl = "db://assets/sample.ts";
  const calls: RequestCall[] = [];

  try {
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
          if (channel === "asset-db" && command === "query-asset-info") {
            if (args[0] === assetUrl) {
              return { file: filePath, url: assetUrl };
            }
            return null;
          }
          if (channel === "scene" && command === "snapshot") {
            return undefined;
          }
          throw new Error(`unexpected command: ${channel}:${command}`);
        },
      },
    };

    const { registrar, getHandler } = createRegistrar();
    registerOperateScriptsAndTextTool(registrar);
    const response = await getHandler()({
      operation: "read",
      urlOrUuid: assetUrl,
      startLine: 2,
      endLine: 2,
      contextLines: 0,
    });
    const body = parseResponse(response);

    assert.equal(body.success, true);
    assert.equal((body.meta as any)?.tool, "operate_scripts_and_text");
    assert.equal((body.meta as any)?.operation, "read");
    assert.deepEqual(body.errors, []);
    assert.equal((body.data as any)?.content, "line2");

    const snapshotCalled = calls.some((call) => call.channel === "scene" && call.command === "snapshot");
    assert.equal(snapshotCalled, false);
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test("write should expose structured errors for read-only assets", async () => {
  const assetUrl = "db://internal/readonly.ts";
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
        if (channel === "asset-db" && command === "query-asset-info") {
          if (args[0] === assetUrl) {
            return { file: "/tmp/readonly.ts", url: assetUrl };
          }
          return null;
        }
        if (channel === "scene" && command === "snapshot") {
          return undefined;
        }
        throw new Error(`unexpected command: ${channel}:${command}`);
      },
    },
  };

  const { registrar, getHandler } = createRegistrar();
  registerOperateScriptsAndTextTool(registrar);
  const response = await getHandler()({
    operation: "write",
    urlOrUuid: assetUrl,
    content: "const value = 1;\n",
    writeMode: "overwrite",
  });
  const body = parseResponse(response);

  assert.equal(body.success, false);
  assert.equal((body.meta as any)?.tool, "operate_scripts_and_text");
  assert.equal((body.meta as any)?.operation, "write");
  assert.match(String((body.errors as any)?.[0]?.message), /Cannot write to read-only asset/);

  const snapshotCalled = calls.some((call) => call.channel === "scene" && call.command === "snapshot");
  assert.equal(snapshotCalled, false);
});
