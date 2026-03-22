import * as fs from "fs";
import * as path from "path";
import type { EditorMessageRequest } from "../runtime/tool-context.js";
import { encodeUuid } from "../uuid-codec.js";

export type AssetTemplateDefinition = {
  url: string;
  ext: string;
};

export type AssetInfoLike = {
  uuid?: string;
  file?: string;
  url?: string;
  type?: string;
  importer?: string;
};

export const ASSET_TEMPLATE_URLS: Record<string, AssetTemplateDefinition> = {
  Prefab: { url: "db://internal/default_file_content/prefab/default.prefab", ext: ".prefab" },
  "Scene/Default": { url: "db://internal/default_file_content/scene/default.scene", ext: ".scene" },
  "Scene/2D": { url: "db://internal/default_file_content/scene/scene-2d.scene", ext: ".scene" },
  "Scene/Quality": { url: "db://internal/default_file_content/scene/scene-quality.scene", ext: ".scene" },
  TypeScript: { url: "db://internal/default_file_content/typescript/ts", ext: ".ts" },
  Material: { url: "db://internal/default_file_content/material/default.mtl", ext: ".mtl" },
  PhysicsMaterial: { url: "db://internal/default_file_content/physics-material/default.pmtl", ext: ".pmtl" },
  CubeMap: { url: "", ext: ".cubemap" },
  RenderTexture: { url: "db://internal/default_file_content/render-texture/default.rt", ext: ".rt" },
  "Effect/LegacyUnlit": { url: "db://internal/default_file_content/effect/default.effect", ext: ".effect" },
  "Effect/SurfaceShader": { url: "db://internal/default_file_content/effect/effect-surface.effect", ext: ".effect" },
  AnimationClip: { url: "db://internal/default_file_content/animation-clip/default.anim", ext: ".anim" },
  AnimationGraph: { url: "db://internal/default_file_content/animation-graph/default.animgraph", ext: ".animgraph" },
  AnimationGraphScript: { url: "db://internal/default_file_content/animation-graph/ts-animation-graph", ext: ".ts" },
  AnimationGraphVariant: { url: "db://internal/default_file_content/animation-graph-variant/default.animgraphvari", ext: ".animgraphvari" },
  AnimationMask: { url: "db://internal/default_file_content/animation-mask/default.animask", ext: ".animask" },
  AutoAtlas: { url: "db://internal/default_file_content/auto-atlas/default.pac", ext: ".pac" },
  LabelAtlas: { url: "db://internal/default_file_content/label-atlas/default.labelatlas", ext: ".labelatlas" },
  Terrain: { url: "db://internal/default_file_content/terrain/default.terrain", ext: ".terrain" },
  ShaderHeader: { url: "db://internal/default_file_content/effect-header/chunk", ext: ".chunk" },
  Folder: { url: "", ext: "" },
};

function isValidClassName(name: string): boolean {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !name.match(/^[0-9]/);
}

function sanitizeClassName(fileName: string): string {
  return fileName
    .split(/[-_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join("")
    .replace(/[^a-zA-Z0-9]/g, "")
    .replace(/^[0-9]/, "C$&");
}

export function processTypeScriptTemplate(
  templateContent: string,
  requestedFileName: string
): {
  content: string;
  className: string;
  finalFileName: string;
  fileNameChanged: boolean;
} {
  try {
    const finalClassName = isValidClassName(requestedFileName)
      ? requestedFileName
      : sanitizeClassName(requestedFileName) || "Component";
    const finalFileName = finalClassName;
    const fileNameChanged = requestedFileName !== finalFileName;
    const contentWithoutComments = templateContent
      .replace(/<%UnderscoreCaseClassName%>/g, finalClassName)
      .replace(/\/\*\*[\s\S]*?\*\//g, "")
      .replace(/\n\s*\n\s*\n/g, "\n\n")
      .trim();

    return {
      content: `${contentWithoutComments}\n`,
      className: finalClassName,
      finalFileName,
      fileNameChanged,
    };
  } catch (error) {
    console.error(`Error processing TypeScript template for ${requestedFileName}:`, error);
    const fallbackClassName = sanitizeClassName(requestedFileName) || "Component";
    return {
      content: templateContent,
      className: fallbackClassName,
      finalFileName: fallbackClassName,
      fileNameChanged: requestedFileName !== fallbackClassName,
    };
  }
}

function resolveProjectAssetFsPath(assetPath: string): string | null {
  const assetsUrlPrefix = "db://assets";
  if (!assetPath.startsWith(assetsUrlPrefix)) {
    return null;
  }

  const projectPath = typeof Editor?.Project?.path === "string" ? Editor.Project.path : null;
  if (!projectPath) {
    return null;
  }

  const relativeAssetPath = assetPath.slice(assetsUrlPrefix.length).replace(/^\/+/, "");
  if (relativeAssetPath.length === 0) {
    return path.join(projectPath, "assets");
  }

  return path.join(projectPath, "assets", relativeAssetPath.split("/").join(path.sep));
}

export async function queryAssetInfoSafe(
  request: EditorMessageRequest,
  assetPath: string
): Promise<AssetInfoLike | null> {
  try {
    const info = await request("asset-db", "query-asset-info", assetPath);
    return info && typeof info === "object" ? (info as AssetInfoLike) : null;
  } catch {
    return null;
  }
}

export async function detectExistingAsset(
  request: EditorMessageRequest,
  assetPath: string
): Promise<AssetInfoLike | null> {
  const assetInfo = await queryAssetInfoSafe(request, assetPath);
  if (assetInfo) {
    return assetInfo;
  }

  const fsPath = resolveProjectAssetFsPath(assetPath);
  if (fsPath && fs.existsSync(fsPath)) {
    return {};
  }

  return null;
}

export function buildAlreadyExistsResult(
  operation: "create" | "copy" | "move",
  options: {
    path?: string;
    from?: string;
    to?: string;
    existingAsset: AssetInfoLike;
    originalPath?: string;
    adjustedPath?: string;
  }
): Record<string, unknown> {
  return {
    operation,
    ...(options.path ? { path: options.path } : {}),
    ...(options.from ? { from: options.from } : {}),
    ...(options.to ? { to: options.to } : {}),
    ...(options.existingAsset.uuid ? { uuid: encodeUuid(options.existingAsset.uuid) } : {}),
    ...(options.originalPath ? { originalPath: options.originalPath } : {}),
    ...(options.adjustedPath ? { adjustedPath: options.adjustedPath } : {}),
    skipped: true,
    reason: "already_exists",
  };
}
