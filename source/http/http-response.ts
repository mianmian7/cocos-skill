import {
  normalizeToolResponseEnvelope,
  type ToolErrorDetail,
  type ToolResponseEnvelope,
} from "../core/tool-contract.js";
import { ToolValidationError } from "../core/tool-registry.js";

function toToolErrorDetail(message: string, code: string): ToolErrorDetail {
  return { code, message };
}

export function createHttpSuccessEnvelope(
  toolName: string,
  data: unknown,
  meta: Record<string, unknown> = {}
): ToolResponseEnvelope {
  return normalizeToolResponseEnvelope(toolName, {
    success: true,
    data,
    meta,
  });
}

export function createHttpNotFoundResponse(toolName: string): {
  statusCode: number;
  body: ToolResponseEnvelope;
} {
  return {
    statusCode: 404,
    body: normalizeToolResponseEnvelope(toolName, {
      success: false,
      data: {},
      errors: [toToolErrorDetail(`Tool not found: ${toolName}`, "not_found")],
      meta: { httpStatus: 404 },
    }),
  };
}

export function buildHttpErrorResponse(
  error: unknown,
  toolName = "http_error"
): {
  statusCode: number;
  body: ToolResponseEnvelope;
} {
  const message = error instanceof Error ? error.message : String(error);

  if (error instanceof ToolValidationError) {
    return {
      statusCode: 422,
      body: normalizeToolResponseEnvelope(toolName, {
        success: false,
        data: {
          details: error.issues.map((issue) => ({
            path: issue.path.join("."),
            code: issue.code,
            message: issue.message,
          })),
        },
        errors: [toToolErrorDetail(message, "validation_error")],
        meta: { httpStatus: 422 },
      }),
    };
  }

  if (message.startsWith("Validation error:")) {
    return {
      statusCode: 422,
      body: normalizeToolResponseEnvelope(toolName, {
        success: false,
        data: {},
        errors: [toToolErrorDetail(message, "validation_error")],
        meta: { httpStatus: 422 },
      }),
    };
  }

  return {
    statusCode: 500,
    body: normalizeToolResponseEnvelope(toolName, {
      success: false,
      data: {},
      errors: [toToolErrorDetail(message, "http_error")],
      meta: { httpStatus: 500 },
    }),
  };
}
