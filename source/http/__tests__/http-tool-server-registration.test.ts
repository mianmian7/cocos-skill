import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import fs from "node:fs";
import { HttpToolServer } from "../http-tool-server.js";
import { ToolRegistry } from "../tool-registry.js";
import { DEFAULT_SERVER_CONFIG, DEFAULT_TOOL_CONFIG } from "../../skill/config.js";

function listRegisteredPaths(app: express.Application): string[] {
  const router = (app as any)._router;
  const stack = Array.isArray(router?.stack) ? router.stack : [];
  return stack
    .map((layer: any) => layer?.route?.path)
    .filter((routePath: unknown): routePath is string => typeof routePath === "string");
}

test("HttpToolServer should register operate_animation and expose its dedicated endpoint", () => {
  fs.mkdirSync("/tmp/cocos-skill-http-test", { recursive: true });
  (globalThis as any).Editor = {
    Project: {
      path: "/tmp/cocos-skill-http-test",
    },
  };

  const server = new HttpToolServer() as any;
  server.toolRegistry = new ToolRegistry();
  server.config = {
    ...DEFAULT_SERVER_CONFIG,
    tools: {
      ...DEFAULT_TOOL_CONFIG,
      operateAnimation: true,
    },
  };

  server.registerTools();
  assert.equal(server.toolRegistry.hasTool("operate_animation"), true);

  server.expressApp = express();
  server.setupRoutes();
  const paths = listRegisteredPaths(server.expressApp);

  assert.equal(paths.includes("/skill/animation"), true);
  assert.equal(paths.includes("/skill/tool/:toolName"), true);
});
