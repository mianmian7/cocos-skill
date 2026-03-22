import { normalizeToolResponseEnvelope } from "../../core/tool-contract.js";
import type { ToolEffect } from "../runtime/tool-context.js";
import { buildSummarizedData, buildTruncatedData } from "./editor-request-oversize.js";

type EditorRequestFn = (channel: string, command: string, ...args: unknown[]) => Promise<unknown>;

type OversizedEditorRequestOptions = {
  channel: string;
  command: string;
  mode: string;
  result: unknown;
  originalSize: number;
  maxResultSize: number;
  summarize: boolean;
  operation: string;
  effect: ToolEffect;
};

export function getEditorRequestEffect(channel: string, mode: string | undefined): ToolEffect {
  if (channel === "scene" && mode === "write") {
    return "mutating-scene";
  }
  if (channel === "asset-db" && mode === "write") {
    return "mutating-asset";
  }
  return "read";
}

export async function executeEditorRequest(
  request: EditorRequestFn,
  channel: string,
  command: string,
  args: unknown[]
): Promise<unknown> {
  if (args.length === 0) {
    return request(channel, command);
  }
  if (args.length === 1) {
    return request(channel, command, args[0]);
  }
  return request(channel, command, ...args);
}

export function buildEditorRequestSuccessData(
  channel: string,
  command: string,
  mode: string,
  result: unknown
) {
  return {
    channel,
    command,
    mode,
    result,
  };
}

function measureEditorRequestResponseLength(
  data: unknown,
  warning: string,
  operation: string,
  effect: ToolEffect
): number {
  return JSON.stringify(
    normalizeToolResponseEnvelope("editor_request", {
      success: true,
      data,
      warnings: [warning],
      logs: [],
      meta: {
        operation,
        effect,
      },
    }),
    null,
    2
  ).length;
}

export function buildOversizedEditorRequestOutcome(options: OversizedEditorRequestOptions) {
  const warning = options.summarize
    ? "Result exceeded maxResultSize and was summarized"
    : "Result exceeded maxResultSize and was truncated";

  if (!options.summarize) {
    return {
      data: buildTruncatedData(
        options.channel,
        options.command,
        options.mode,
        options.result,
        options.originalSize,
        options.maxResultSize,
        (candidate) =>
          measureEditorRequestResponseLength(candidate, warning, options.operation, options.effect)
      ),
      warnings: [warning],
    };
  }

  const summarizedData = buildSummarizedData(
    options.channel,
    options.command,
    options.mode,
    options.result,
    options.originalSize
  );
  const minimumMaxResultSize = measureEditorRequestResponseLength(
    summarizedData,
    warning,
    options.operation,
    options.effect
  );
  if (minimumMaxResultSize > options.maxResultSize) {
    return {
      success: false,
      data: {
        channel: options.channel,
        command: options.command,
        mode: options.mode,
        minimumMaxResultSize,
      },
      errors: [`maxResultSize is too small for summarized response; requires at least ${minimumMaxResultSize}`],
    };
  }

  return {
    data: summarizedData,
    warnings: [warning],
  };
}
