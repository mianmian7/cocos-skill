import { generateResultSummary } from "./editor-request-summary.js";

const PREVIEW_STRING_DIVISOR = 4;
const MIN_PREVIEW_STRING_LENGTH = 0;
const SHORT_STRING_PRESERVE_LENGTH = 16;
const MAX_PREVIEW_DEPTH = 3;
const MAX_PREVIEW_ARRAY_ITEMS = 12;
const MAX_PREVIEW_OBJECT_KEYS = 12;
type TruncatedData = {
  channel: string;
  command: string;
  mode: string;
  truncated: true;
  originalSize: number;
  resultPreview: string;
};

type ResponseLengthMeasure = (data: TruncatedData) => number;

function truncatePreviewValue(value: unknown, maxStringLength: number, depth = 0): unknown {
  if (typeof value === "string") {
    if (value.length <= SHORT_STRING_PRESERVE_LENGTH) {
      return value;
    }

    const prefix = maxStringLength > 0 ? value.slice(0, maxStringLength) : "";
    const remaining = value.length - maxStringLength;
    return value.length > maxStringLength
      ? `${prefix}...[+${remaining}]`
      : value;
  }

  if (Array.isArray(value)) {
    if (depth >= MAX_PREVIEW_DEPTH) {
      return `[Array ${value.length}]`;
    }

    const preview = value
      .slice(0, MAX_PREVIEW_ARRAY_ITEMS)
      .map((item) => truncatePreviewValue(item, maxStringLength, depth + 1));
    if (value.length > MAX_PREVIEW_ARRAY_ITEMS) {
      preview.push(`... [${value.length - MAX_PREVIEW_ARRAY_ITEMS} more]`);
    }
    return preview;
  }

  if (!value || typeof value !== "object") {
    return value;
  }
  if (depth >= MAX_PREVIEW_DEPTH) {
    return `[Object ${Object.keys(value).length}]`;
  }

  const entries = Object.entries(value);
  const preview = Object.fromEntries(
    entries
      .slice(0, MAX_PREVIEW_OBJECT_KEYS)
      .map(([key, nestedValue]) => [key, truncatePreviewValue(nestedValue, maxStringLength, depth + 1)])
  );
  if (entries.length > MAX_PREVIEW_OBJECT_KEYS) {
    (preview as Record<string, unknown>).__truncatedKeys = entries.length - MAX_PREVIEW_OBJECT_KEYS;
  }
  return preview;
}

function serializePreview(value: unknown, pretty: boolean): string {
  const serialized = pretty ? JSON.stringify(value, null, 2) : JSON.stringify(value);
  return typeof serialized === "string" ? serialized : String(value);
}

function buildTruncatedResultPreview(result: unknown, maxResultSize: number): string {
  let maxStringLength = Math.max(MIN_PREVIEW_STRING_LENGTH, Math.floor(maxResultSize / PREVIEW_STRING_DIVISOR));

  while (true) {
    const preview = truncatePreviewValue(result, maxStringLength);
    const serializedPreview = serializePreview(preview, true);
    if (serializedPreview.length <= maxResultSize) {
      return serializedPreview;
    }

    const compactPreview = serializePreview(preview, false);
    if (compactPreview.length <= maxResultSize || maxStringLength === MIN_PREVIEW_STRING_LENGTH) {
      return compactPreview;
    }

    maxStringLength = Math.max(MIN_PREVIEW_STRING_LENGTH, Math.floor(maxStringLength / 2));
  }
}

export function buildSummarizedData(
  channel: string,
  command: string,
  mode: string,
  result: unknown,
  originalSize: number
) {
  return {
    channel,
    command,
    mode,
    truncated: true,
    originalSize,
    summary: generateResultSummary(result, channel, command),
  };
}

export function buildTruncatedData(
  _channel: string,
  _command: string,
  _mode: string,
  result: unknown,
  originalSize: number,
  maxResultSize: number,
  measureResponseLength?: ResponseLengthMeasure
): TruncatedData {
  let previewBudget = maxResultSize;

  while (true) {
    const candidate: TruncatedData = {
      channel: _channel,
      command: _command,
      mode: _mode,
      truncated: true,
      originalSize,
      resultPreview: buildTruncatedResultPreview(result, previewBudget),
    };

    if (!measureResponseLength || measureResponseLength(candidate) <= maxResultSize) {
      return candidate;
    }
    if (previewBudget === MIN_PREVIEW_STRING_LENGTH) {
      return candidate;
    }

    previewBudget = Math.max(MIN_PREVIEW_STRING_LENGTH, Math.floor(previewBudget / 2));
  }
}
