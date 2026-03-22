import type { EditorMessageRequest, ToolExecutionContext } from "../runtime/tool-context.js";

export type TextOperation = "read" | "write" | "search" | "replace" | "info";
export type AccessMode = "read" | "write";
export type WriteMode = "overwrite" | "append" | "prepend" | "insert";

export interface ResolvedAssetPath {
  valid: boolean;
  filePath?: string;
  url?: string;
  isReadOnly?: boolean;
  error?: string;
}

export interface FileOperationResult {
  success: boolean;
  data?: Record<string, unknown>;
  error?: string;
}

export interface SearchMatch {
  line: number;
  content: string;
  startColumn: number;
  endColumn: number;
  context?: {
    before: string[];
    after: string[];
  };
}

export interface ScriptsTextContext {
  request: EditorMessageRequest;
  callSceneScript: ToolExecutionContext["callSceneScript"];
}

export async function resolveAssetPath(
  request: EditorMessageRequest,
  urlOrUuid: string
): Promise<ResolvedAssetPath> {
  try {
    const assetInfo = await request("asset-db", "query-asset-info", urlOrUuid);
    if (!assetInfo || typeof assetInfo !== "object" || Array.isArray(assetInfo)) {
      return buildMissingAssetResult(urlOrUuid);
    }

    const record = assetInfo as { file?: unknown; url?: unknown };
    const url = typeof record.url === "string" ? record.url : undefined;
    return {
      valid: true,
      filePath: typeof record.file === "string" ? record.file : undefined,
      url,
      isReadOnly: Boolean(url?.startsWith("db://internal/")),
    };
  } catch (error) {
    return {
      valid: false,
      error: `Error resolving asset path: ${toErrorMessage(error)}`,
    };
  }
}

function buildMissingAssetResult(urlOrUuid: string): ResolvedAssetPath {
  if (!urlOrUuid.startsWith("db://")) {
    return {
      valid: false,
      error: `Asset with UUID/ID ${urlOrUuid} not found`,
    };
  }

  return {
    valid: true,
    url: urlOrUuid,
    isReadOnly: urlOrUuid.startsWith("db://internal/"),
  };
}

export async function validateAssetAccess(
  request: EditorMessageRequest,
  options: {
    urlOrUuid: string;
    operation: AccessMode;
  }
): Promise<{ valid: boolean; error?: string }> {
  const resolved = await resolveAssetPath(request, options.urlOrUuid);
  if (!resolved.valid) {
    return { valid: false, error: resolved.error };
  }
  if (options.operation === "write" && resolved.isReadOnly) {
    return { valid: false, error: `Cannot write to read-only asset: ${resolved.url}` };
  }
  if (options.operation === "read" && !resolved.filePath) {
    return { valid: false, error: `Asset does not exist: ${options.urlOrUuid}` };
  }
  return { valid: true };
}

export function extractComponentNames(content: string): string[] {
  const componentNames = new Set<string>();
  const ccclassRegex = /@ccclass\s*\(\s*['"`]([^'"`]+)['"`]\s*\)/g;
  let match: RegExpExecArray | null = null;
  while ((match = ccclassRegex.exec(content)) !== null) {
    const componentName = match[1]?.trim();
    if (componentName) {
      componentNames.add(componentName);
    }
  }
  return [...componentNames];
}

export function adjustUrlForClassName(options: {
  urlOrUuid: string;
  content: string;
}): { adjustedUrl: string; wasChanged: boolean } {
  if (!isTypeScriptTarget(options.urlOrUuid)) {
    return { adjustedUrl: options.urlOrUuid, wasChanged: false };
  }

  const componentName = extractComponentNames(options.content)[0];
  if (!componentName) {
    return { adjustedUrl: options.urlOrUuid, wasChanged: false };
  }

  const segments = options.urlOrUuid.split("/");
  const expectedFileName = `${componentName}.ts`;
  if (segments.at(-1) === expectedFileName) {
    return { adjustedUrl: options.urlOrUuid, wasChanged: false };
  }

  segments[segments.length - 1] = expectedFileName;
  return { adjustedUrl: segments.join("/"), wasChanged: true };
}

export async function getNewComponentsOnly(
  callSceneScript: ScriptsTextContext["callSceneScript"],
  detectedComponents: string[]
): Promise<string[]> {
  if (detectedComponents.length === 0) {
    return [];
  }

  try {
    const componentTypes = await callSceneScript("queryComponentTypes");
    if (!Array.isArray(componentTypes)) {
      return detectedComponents;
    }
    return detectedComponents.filter((componentName) => !componentTypes.includes(componentName));
  } catch (error) {
    console.warn("Error checking existing components:", error);
    return detectedComponents;
  }
}

export function validateTypeScriptContent(content: string): { valid: boolean; error?: string } {
  const detectedComponents = extractComponentNames(content);
  if (detectedComponents.length <= 1) {
    return { valid: true };
  }
  return {
    valid: false,
    error: `Content contains multiple components (${detectedComponents.join(", ")}). Each TypeScript file must contain only one @ccclass component.`,
  };
}

export function isTypeScriptTarget(urlOrUuid: string): boolean {
  return urlOrUuid.includes(".ts");
}

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
