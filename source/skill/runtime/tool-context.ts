export type EditorMessageRequest = (
  channel: string,
  command: string,
  ...args: unknown[]
) => Promise<unknown>;

export type ToolEffect = 'read' | 'mutating-scene' | 'mutating-asset';

export interface ToolExecutionContext {
  request: EditorMessageRequest;
  callSceneScript(method: string, args?: unknown[]): Promise<unknown>;
  startSceneLogCapture(): Promise<void>;
  getCapturedSceneLogs(): Promise<string[]>;
  snapshotScene(): Promise<void>;
}

function defaultEditorRequest(
  channel: string,
  command: string,
  ...args: unknown[]
): Promise<unknown> {
  return Editor.Message.request(channel, command, ...args) as Promise<unknown>;
}

export function createToolContext(
  packageName: string,
  request: EditorMessageRequest = defaultEditorRequest
): ToolExecutionContext {
  async function callSceneScript(method: string, args: unknown[] = []): Promise<unknown> {
    return request('scene', 'execute-scene-script', {
      name: packageName,
      method,
      args,
    });
  }

  return {
    request,
    callSceneScript,
    async startSceneLogCapture(): Promise<void> {
      await callSceneScript('startCaptureSceneLogs');
    },
    async getCapturedSceneLogs(): Promise<string[]> {
      const result = await callSceneScript('getCapturedSceneLogs');
      return Array.isArray(result)
        ? result.filter((entry): entry is string => typeof entry === 'string')
        : [];
    },
    async snapshotScene(): Promise<void> {
      await request('scene', 'snapshot');
    },
  };
}
