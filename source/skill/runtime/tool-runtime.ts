import type { ToolResult } from '../../core/tool-contract.js';
import { normalizeToolResponseEnvelope } from '../../core/tool-contract.js';
import { createToolContext, type EditorMessageRequest, type ToolEffect, type ToolExecutionContext } from './tool-context.js';
import { toRecord, toStringList } from './tool-coercion.js';
import { toToolErrorDetail } from './tool-errors.js';

export interface ToolRuntimeOptions {
  toolName: string;
  operation?: string;
  effect?: ToolEffect;
  packageName?: string;
  captureSceneLogs?: boolean;
  snapshotOnSuccess?: boolean;
  snapshotOnFailure?: boolean;
  meta?: Record<string, unknown>;
}

function toToolResult(payload: unknown, toolName: string): ToolResult {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(normalizeToolResponseEnvelope(toolName, payload), null, 2),
      },
    ],
  };
}

function shouldCaptureSceneLogs(options: ToolRuntimeOptions): boolean {
  return options.captureSceneLogs ?? false;
}

function shouldSnapshotOnSuccess(options: ToolRuntimeOptions): boolean {
  if (typeof options.snapshotOnSuccess === 'boolean') {
    return options.snapshotOnSuccess;
  }
  return (options.effect ?? 'read') === 'mutating-scene';
}

function shouldSnapshotOnFailure(options: ToolRuntimeOptions): boolean {
  return options.snapshotOnFailure ?? false;
}

function buildMeta(options: ToolRuntimeOptions): Record<string, unknown> {
  return {
    ...(options.operation ? { operation: options.operation } : {}),
    effect: options.effect ?? 'read',
    ...(options.meta ?? {}),
  };
}

function isExplicitOutcome(value: unknown): value is Record<string, unknown> {
  const record = toRecord(value);
  if (!record) {
    return false;
  }

  return ['success', 'data', 'errors', 'warnings', 'logs', 'meta'].some((key) => key in record);
}

function buildSuccessPayload(
  value: unknown,
  options: ToolRuntimeOptions,
  runtimeLogs: string[]
): unknown {
  if (!isExplicitOutcome(value)) {
    return {
      success: true,
      data: value,
      logs: runtimeLogs,
      meta: buildMeta(options),
    };
  }

  const mergedLogs = [...runtimeLogs, ...toStringList(value.logs)];
  return {
    ...value,
    success: typeof value.success === 'boolean'
      ? value.success
      : !Array.isArray(value.errors) || value.errors.length === 0,
    logs: mergedLogs,
    meta: {
      ...buildMeta(options),
      ...(toRecord(value.meta) ?? {}),
    },
  };
}

function toRuntimeLogMessage(prefix: string, error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  return `[tool-runtime] ${prefix}: ${message}`;
}

async function readCapturedSceneLogs(
  context: ToolExecutionContext,
  captureEnabled: boolean,
  captureStarted: boolean
): Promise<string[]> {
  if (!captureEnabled || !captureStarted) {
    return [];
  }

  try {
    return await context.getCapturedSceneLogs();
  } catch (error) {
    return [toRuntimeLogMessage("failed to read scene logs", error)];
  }
}

export async function runToolWithContext(
  options: ToolRuntimeOptions,
  execute: (context: ToolExecutionContext) => Promise<unknown>,
  request?: EditorMessageRequest
): Promise<ToolResult> {
  const context = createToolContext(options.packageName ?? 'cocos-skill', request);
  const captureLogs = shouldCaptureSceneLogs(options);
  let captureStarted = false;

  try {
    if (captureLogs) {
      await context.startSceneLogCapture();
      captureStarted = true;
    }

    const data = await execute(context);
    const logs = await readCapturedSceneLogs(context, captureLogs, captureStarted);

    if (shouldSnapshotOnSuccess(options)) {
      await context.snapshotScene();
    }

    return toToolResult(buildSuccessPayload(data, options, logs), options.toolName);
  } catch (error) {
    const logs = await readCapturedSceneLogs(context, captureLogs, captureStarted);

    if (shouldSnapshotOnFailure(options)) {
      await context.snapshotScene();
    }

    return toToolResult(
      {
        success: false,
        data: {},
        errors: [toToolErrorDetail(error)],
        logs,
        meta: buildMeta(options),
      },
      options.toolName
    );
  }
}
