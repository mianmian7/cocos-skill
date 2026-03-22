import { z } from 'zod';

export interface ToolResult {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: string;
    mimeType?: string;
  }>;
  isError?: boolean;
}

export interface ToolErrorDetail {
  code: string;
  message: string;
}

export interface ToolResponseMeta {
  tool: string;
  [key: string]: unknown;
}

export interface ToolResponseEnvelope<TData = unknown> {
  success: boolean;
  data: TData;
  errors: ToolErrorDetail[];
  warnings: string[];
  logs: string[];
  meta: ToolResponseMeta;
}

const RESERVED_RESPONSE_KEYS = new Set([
  'success',
  'data',
  'error',
  'errors',
  'warnings',
  'logs',
  'meta',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function normalizeStringList(value: unknown): string[] {
  if (typeof value === 'string') {
    return [value];
  }
  if (!Array.isArray(value)) {
    return [];
  }
  return value.filter((entry): entry is string => typeof entry === 'string');
}

function normalizeErrorList(payload: Record<string, unknown>): ToolErrorDetail[] {
  if (Array.isArray(payload.errors)) {
    return payload.errors.flatMap((entry) => {
      if (typeof entry === 'string') {
        return [{ code: 'tool_error', message: entry }];
      }
      if (isRecord(entry) && typeof entry.message === 'string') {
        return [{
          code: typeof entry.code === 'string' ? entry.code : 'tool_error',
          message: entry.message,
        }];
      }
      return [];
    });
  }

  if (typeof payload.error === 'string') {
    return [{ code: 'tool_error', message: payload.error }];
  }

  return [];
}

function extractLegacyData(payload: Record<string, unknown>): unknown {
  if ('data' in payload) {
    return payload.data;
  }

  const entries = Object.entries(payload).filter(([key]) => !RESERVED_RESPONSE_KEYS.has(key));
  if (entries.length === 0) {
    return {};
  }
  return Object.fromEntries(entries);
}

export function normalizeToolResponseEnvelope(
  toolName: string,
  payload: unknown
): ToolResponseEnvelope {
  if (!isRecord(payload)) {
    return {
      success: true,
      data: payload ?? {},
      errors: [],
      warnings: [],
      logs: [],
      meta: { tool: toolName },
    };
  }

  const success = typeof payload.success === 'boolean' ? payload.success : true;
  const errors = normalizeErrorList(payload);
  const warnings = normalizeStringList(payload.warnings);
  const logs = normalizeStringList(payload.logs);
  const meta = isRecord(payload.meta)
    ? { ...payload.meta, tool: toolName }
    : { tool: toolName };

  return {
    success,
    data: extractLegacyData(payload),
    errors,
    warnings,
    logs,
    meta,
  };
}

export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
  handler: (args: any) => Promise<ToolResult>;
}

export interface ToolRegistration {
  title: string;
  description: string;
  inputSchema: Record<string, z.ZodTypeAny>;
}

export interface ToolRegistrar {
  registerTool(
    name: string,
    definition: ToolRegistration,
    handler: (args: any) => Promise<ToolResult>
  ): void;
}
