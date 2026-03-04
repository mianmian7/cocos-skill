export type EditorRequestFn = (channel: string, command: string, ...args: unknown[]) => Promise<unknown>;

export interface SaveSceneOptions {
  autoSceneUrl?: string;
}

export type SaveSceneReason =
  | 'not_dirty'
  | 'save_failed';

export interface SaveSceneResult {
  success: boolean;
  saved: boolean;
  skipped: boolean;
  reason?: SaveSceneReason;
  sceneUrl: string | null;
  savedPath: string | null;
  manualActionRequired: boolean;
  autoBootstrapped?: boolean;
  error?: string;
}

const DEFAULT_AUTO_SCENE_URL = 'db://assets/scene.scene';

function toNonEmptyString(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function toBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function querySceneInfo(request: EditorRequestFn): Promise<Record<string, unknown> | null> {
  try {
    const info = await request('scene', 'query-scene-info');
    return info && typeof info === 'object' ? (info as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}

async function queryDirtyState(
  request: EditorRequestFn,
  sceneInfo: Record<string, unknown> | null
): Promise<boolean | null> {
  const dirtyFromInfo = toBoolean(sceneInfo?.dirty);
  if (dirtyFromInfo !== null) {
    return dirtyFromInfo;
  }
  try {
    const dirty = await request('scene', 'query-dirty');
    return toBoolean(dirty);
  } catch {
    return null;
  }
}

function buildNotDirtyResult(sceneUrl: string | null): SaveSceneResult {
  return {
    success: true,
    saved: false,
    skipped: true,
    reason: 'not_dirty',
    sceneUrl,
    savedPath: null,
    manualActionRequired: false,
  };
}

function buildSaveErrorResult(sceneUrl: string | null, reason: SaveSceneReason, error: string): SaveSceneResult {
  return {
    success: false,
    saved: false,
    skipped: false,
    reason,
    sceneUrl,
    savedPath: null,
    manualActionRequired: false,
    error,
  };
}

export async function saveSceneNonInteractive(
  request: EditorRequestFn,
  options: SaveSceneOptions = {}
): Promise<SaveSceneResult> {
  const autoSceneUrl = options.autoSceneUrl ?? DEFAULT_AUTO_SCENE_URL;
  const sceneInfo = await querySceneInfo(request);
  const sceneUrl = toNonEmptyString(sceneInfo?.url);
  const dirty = await queryDirtyState(request, sceneInfo);

  if (dirty === false) {
    return buildNotDirtyResult(sceneUrl);
  }

  const targetSceneUrl = sceneUrl ?? autoSceneUrl;
  const autoBootstrapped = !sceneUrl;

  try {
    const saveResult = await request('scene', 'save-scene');
    const savedPath = toNonEmptyString(saveResult) ?? targetSceneUrl;

    return {
      success: true,
      saved: true,
      skipped: false,
      sceneUrl: savedPath,
      savedPath,
      manualActionRequired: false,
      autoBootstrapped,
    };
  } catch (error) {
    return buildSaveErrorResult(targetSceneUrl, 'save_failed', getErrorMessage(error));
  }
}
