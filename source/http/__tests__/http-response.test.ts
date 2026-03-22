import test from "node:test";
import assert from "node:assert/strict";
import { z } from "zod";
import { ToolValidationError } from "../../core/tool-registry.js";
import { buildHttpErrorResponse, createHttpSuccessEnvelope } from "../http-response.js";

test("createHttpSuccessEnvelope should return the unified response contract", () => {
  const body = createHttpSuccessEnvelope("http_tools", { tools: [{ name: "query_nodes" }] }, { operation: "list-tools" });

  assert.equal(body.success, true);
  assert.equal(body.meta.tool, "http_tools");
  assert.equal((body.meta as any).operation, "list-tools");
  assert.deepEqual(body.errors, []);
  assert.deepEqual((body.data as any).tools, [{ name: "query_nodes" }]);
});

test("buildHttpErrorResponse should return structured validation envelopes", () => {
  const error = new ToolValidationError("Validation error: invalid payload", [
    {
      code: "invalid_type",
      expected: "string",
      received: "number",
      path: ["args", "nodeUuid"],
      message: "Expected string, received number",
    } as z.ZodIssue,
  ]);

  const response = buildHttpErrorResponse(error, "query_nodes");

  assert.equal(response.statusCode, 422);
  assert.equal(response.body.success, false);
  assert.equal(response.body.meta.tool, "query_nodes");
  assert.match(response.body.errors[0]?.message || "", /Validation error/);
  assert.equal((response.body.data as any)?.details?.[0]?.path, "args.nodeUuid");
});
