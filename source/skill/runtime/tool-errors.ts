import type { ToolErrorDetail } from '../../core/tool-contract.js';

export function toToolErrorDetail(error: unknown, defaultCode = 'tool_error'): ToolErrorDetail {
  if (error instanceof Error) {
    return {
      code: defaultCode,
      message: error.message,
    };
  }

  if (typeof error === 'string') {
    return {
      code: defaultCode,
      message: error,
    };
  }

  if (typeof error === 'object' && error !== null) {
    const maybeMessage = (error as { message?: unknown }).message;
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeMessage === 'string') {
      return {
        code: typeof maybeCode === 'string' ? maybeCode : defaultCode,
        message: maybeMessage,
      };
    }
  }

  return {
    code: defaultCode,
    message: String(error),
  };
}
