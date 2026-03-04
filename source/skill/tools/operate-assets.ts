import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { AssetInterpreterManager } from "./asset-interpreters/asset-interpreter-manager";
import { PropertySetSpec } from "./asset-interpreters/interface";
import * as fs from 'fs';
import * as path from 'path';

/**
 * Check if a string is a valid TypeScript class name
 */
function isValidClassName(name: string): boolean {
  // Must start with letter or underscore, followed by letters, numbers, or underscores
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name) && !name.match(/^[0-9]/);
}

/**
 * Convert filename to valid TypeScript class name
 */
function sanitizeClassName(fileName: string): string {
  return fileName
    .split(/[-_\s]+/) // Split on hyphens, underscores, and spaces
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()) // PascalCase each word
    .join('') // Join without separators
    .replace(/[^a-zA-Z0-9]/g, '') // Remove any remaining non-alphanumeric characters
    .replace(/^[0-9]/, 'C$&'); // Prefix with 'C' if starts with number
}

/**
 * Process TypeScript template content and determine final class name and filename
 */
function processTypeScriptTemplate(
  templateContent: string, 
  requestedFileName: string
): { 
  content: string; 
  className: string; 
  finalFileName: string; 
  fileNameChanged: boolean;
} {
  try {
    // Determine the class name to use
    let finalClassName: string;
    
    if (isValidClassName(requestedFileName)) {
      finalClassName = requestedFileName;
    } else {
      finalClassName = sanitizeClassName(requestedFileName) || 'Component';
    }
    
    // Determine final filename - should match class name
    const expectedFileName = finalClassName;
    const fileNameChanged = requestedFileName !== expectedFileName;
    
    // Replace placeholder with the class name
    let processedContent = templateContent.replace(/<%UnderscoreCaseClassName%>/g, finalClassName);
    
    // Remove all /** ... */ comments (multiline)
    processedContent = processedContent.replace(/\/\*\*[\s\S]*?\*\//g, '');
    
    // Clean up any extra whitespace left by comment removal
    processedContent = processedContent.replace(/\n\s*\n\s*\n/g, '\n\n');
    processedContent = processedContent.trim() + '\n';
    
    return { 
      content: processedContent, 
      className: finalClassName,
      finalFileName: expectedFileName,
      fileNameChanged 
    };
  } catch (error) {
    console.error(`Error processing TypeScript template for ${requestedFileName}:`, error);
    const fallbackClassName = sanitizeClassName(requestedFileName) || 'Component';
    return { 
      content: templateContent, 
      className: fallbackClassName,
      finalFileName: fallbackClassName,
      fileNameChanged: requestedFileName !== fallbackClassName
    };
  }
}

type AssetInfoLike = {
  uuid?: string;
};

function resolveProjectAssetFsPath(assetPath: string): string | null {
  const assetsUrlPrefix = 'db://assets';
  if (!assetPath.startsWith(assetsUrlPrefix)) {
    return null;
  }

  const projectPath = typeof Editor?.Project?.path === 'string' ? Editor.Project.path : null;
  if (!projectPath) {
    return null;
  }

  const relativeAssetPath = assetPath.slice(assetsUrlPrefix.length).replace(/^\/+/, '');
  if (relativeAssetPath.length === 0) {
    return path.join(projectPath, 'assets');
  }

  const normalizedRelativePath = relativeAssetPath.split('/').join(path.sep);
  return path.join(projectPath, 'assets', normalizedRelativePath);
}

async function queryAssetInfoSafe(assetPath: string): Promise<AssetInfoLike | null> {
  try {
    const info = await Editor.Message.request('asset-db', 'query-asset-info', assetPath);
    return info && typeof info === 'object' ? (info as AssetInfoLike) : null;
  } catch {
    return null;
  }
}

async function detectExistingAsset(assetPath: string): Promise<AssetInfoLike | null> {
  const assetInfo = await queryAssetInfoSafe(assetPath);
  if (assetInfo) {
    return assetInfo;
  }

  const fsPath = resolveProjectAssetFsPath(assetPath);
  if (fsPath && fs.existsSync(fsPath)) {
    return {};
  }

  return null;
}

export function registerOperateAssetsTool(server: ToolRegistrar): void {
  const assetTemplateUrls: { [key: string] : { url: string, ext: string} } = {
    "Prefab": { url: "db://internal/default_file_content/prefab/default.prefab", ext: ".prefab" },
    "Scene/Default": { url: "db://internal/default_file_content/scene/default.scene", ext: ".scene" },
    "Scene/2D": { url: "db://internal/default_file_content/scene/scene-2d.scene", ext: ".scene" },
    "Scene/Quality": { url: "db://internal/default_file_content/scene/scene-quality.scene", ext: ".scene" },
    "TypeScript": { url: "db://internal/default_file_content/typescript/ts", ext: ".ts" },
    "Material": { url: "db://internal/default_file_content/material/default.mtl", ext: ".mtl" },
    "PhysicsMaterial": { url: "db://internal/default_file_content/physics-material/default.pmtl", ext: ".pmtl" },
    "CubeMap": { url: "", ext: ".cubemap" },
    "RenderTexture": { url: "db://internal/default_file_content/render-texture/default.rt", ext: ".rt" },
    "Effect/LegacyUnlit": { url: "db://internal/default_file_content/effect/default.effect", ext: ".effect" },
    "Effect/SurfaceShader": { url: "db://internal/default_file_content/effect/effect-surface.effect", ext: ".effect" },
    "AnimationClip": { url: "db://internal/default_file_content/animation-clip/default.anim", ext: ".anim" },
    "AnimationGraph": { url: "db://internal/default_file_content/animation-graph/default.animgraph", ext: ".animgraph" },
    "AnimationGraphScript": { url: "db://internal/default_file_content/animation-graph/ts-animation-graph", ext: ".ts" },
    "AnimationGraphVariant": { url: "db://internal/default_file_content/animation-graph-variant/default.animgraphvari", ext: ".animgraphvari" },
    "AnimationMask": { url: "db://internal/default_file_content/animation-mask/default.animask", ext: ".animask" },
    "AutoAtlas": { url: "db://internal/default_file_content/auto-atlas/default.pac", ext: ".pac" },
    "LabelAtlas": { url: "db://internal/default_file_content/label-atlas/default.labelatlas", ext: ".labelatlas" },
    "Terrain": { url: "db://internal/default_file_content/terrain/default.terrain", ext: ".terrain" },
    "ShaderHeader": { url: "db://internal/default_file_content/effect-header/chunk", ext: ".chunk" },
    "Folder": { url: "", ext: "" }
  }

  server.registerTool(
    "operate_assets",
    {
      title: "Operate Assets",
      description: "Batch asset operations: create, copy, move, delete, get/set properties.",
      inputSchema: {
        operation: z.enum(["create", "copy", "delete", "move", "get-properties", "set-properties"]),
        operationOptions: z.array(z.object({
          originalAssetPath: z.string().describe("Source path (for copy/delete/move/get/set operations)").optional(),
          destinationPath: z.string().describe("Target path (for create/copy/move operations)").optional(),
          newAssetType: z.enum(Object.keys(assetTemplateUrls) as [string, ...string[]]).describe("Asset type for create").optional(),
          overwrite: z.boolean().describe("Overwrite if exists").optional().default(false),
          rename: z.boolean().describe("Auto-rename on conflict").optional().default(false),
          properties: z.array(z.object({
            propertyPath: z.string(),
            propertyType: z.string(),
            propertyValue: z.any()
          })).describe("Properties for set operation").optional(),
          includeTooltips: z.boolean().describe("Include property tooltips").optional().default(false),
          useAdvancedInspection: z.boolean().describe("Advanced property inspection").optional().default(false)
        }))
      }
    },
    async ({ operation, operationOptions }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      
      try {
        const results: any[] = [];
        const errors: string[] = [];
        const newComponentsAvailable: string[] = [];

        for (const options of operationOptions) {
          const { originalAssetPath, destinationPath, newAssetType, overwrite = false, rename = false, properties, includeTooltips = false, useAdvancedInspection = false } = options;

          try {
            let result: any = null;

            switch (operation) {
              case "create": {
                if (!destinationPath) {
                  errors.push("destinationPath is required for create operation");
                  continue;
                }
                if (!newAssetType) {
                  errors.push("newAssetType is required for create operation");
                  continue;
                }

                const template = assetTemplateUrls[newAssetType];
                if (!template) {
                  errors.push(`Invalid asset type: ${newAssetType}`);
                  continue;
                }

                // Ensure correct extension
                const finalPath = destinationPath.replace(/\.[^.]*$/, '') + template.ext;
                if (!overwrite && !rename) {
                  const existingAsset = await detectExistingAsset(finalPath);
                  if (existingAsset) {
                    result = {
                      operation: "create",
                      path: finalPath,
                      ...(existingAsset.uuid ? { uuid: encodeUuid(existingAsset.uuid) } : {}),
                      skipped: true,
                      reason: "already_exists"
                    };
                    break;
                  }
                }

                if (template.url && template.url.length > 0) {
                  // For TypeScript files, read template content and pre-process it
                  if (finalPath.endsWith('.ts')) {
                    try {
                      // Read template content
                      const templateInfo = await Editor.Message.request('asset-db', 'query-asset-info', template.url);
                      if (templateInfo && templateInfo.file && fs.existsSync(templateInfo.file)) {
                        const templateContent = fs.readFileSync(templateInfo.file, 'utf8');
                        const requestedFileName = path.basename(finalPath, '.ts');
                        const { 
                          content: processedContent, 
                          className: finalClassName,
                          finalFileName,
                          fileNameChanged 
                        } = processTypeScriptTemplate(templateContent, requestedFileName);
                        
                        // Adjust path if filename changed to match class name
                        const actualPath = fileNameChanged ? 
                          path.dirname(finalPath) === '.' ? 
                            `${finalFileName}.ts` : 
                            `${path.dirname(finalPath)}/${finalFileName}.ts` 
                          : finalPath;
                        if (!overwrite && !rename && actualPath !== finalPath) {
                          const existingAdjustedAsset = await detectExistingAsset(actualPath);
                          if (existingAdjustedAsset) {
                            result = {
                              operation: "create",
                              path: actualPath,
                              ...(existingAdjustedAsset.uuid ? { uuid: encodeUuid(existingAdjustedAsset.uuid) } : {}),
                              skipped: true,
                              reason: "already_exists",
                              originalPath: finalPath,
                              adjustedPath: actualPath
                            };
                            break;
                          }
                        }
                        
                        // Create asset with processed content
                        const createResult = await Editor.Message.request('asset-db', 'create-asset', actualPath, processedContent);
                        await Editor.Message.request('asset-db', 'refresh-asset', actualPath);
                        if (createResult) {
                          result = { 
                            operation: "create", 
                            path: actualPath, 
                            uuid: encodeUuid(createResult.uuid),
                            ...(fileNameChanged && { 
                              originalPath: finalPath, 
                              adjustedPath: actualPath,
                              reason: "File renamed to match class name"
                            })
                          };
                          newComponentsAvailable.push(finalClassName);
                        } else {
                          result = { operation: "create", path: actualPath, success: false };
                        }
                      } else {
                        // Fallback to copy if template can't be read
                        const copyResult = await Editor.Message.request('asset-db', 'copy-asset', template.url, finalPath, { overwrite, rename });
                        await Editor.Message.request('asset-db', 'refresh-asset', finalPath);
                        if (copyResult) {
                          result = { operation: "create", path: finalPath, uuid: encodeUuid(copyResult.uuid) };
                        } else {
                          result = { operation: "create", path: finalPath, success: false };
                        }
                      }

                    } catch (error) {
                      errors.push(`Error processing TypeScript template: ${error instanceof Error ? error.message : String(error)}`);
                      continue;
                    }
                  } else {
                    // Copy from template for non-TypeScript files
                    const copyResult = await Editor.Message.request('asset-db', 'copy-asset', template.url, finalPath, { overwrite, rename });
                    if (copyResult) {
                      result = { operation: "create", path: finalPath, uuid: encodeUuid(copyResult.uuid) };
                    } else {
                      result = { operation: "create", path: finalPath, success: false };
                    }
                  }
                  
                } else {
                  // Create empty asset
                  const createResult = await Editor.Message.request('asset-db', 'create-asset', finalPath, newAssetType == "Folder" ? null : "");
                  if (createResult) {
                    result = { operation: "create", path: finalPath, uuid: encodeUuid(createResult.uuid) };
                  } else {
                    result = { operation: "create", path: finalPath, success: false };
                  }
                }
                break;
              }

              case "copy": {
                if (!originalAssetPath || !destinationPath) {
                  errors.push("originalAssetPath and destinationPath are required for copy operation");
                  continue;
                }
                if (!overwrite && !rename) {
                  const existingAsset = await detectExistingAsset(destinationPath);
                  if (existingAsset) {
                    result = {
                      operation: "copy",
                      from: originalAssetPath,
                      to: destinationPath,
                      ...(existingAsset.uuid ? { uuid: encodeUuid(existingAsset.uuid) } : {}),
                      skipped: true,
                      reason: "already_exists"
                    };
                    break;
                  }
                }

                const copyResult = await Editor.Message.request('asset-db', 'copy-asset', originalAssetPath, destinationPath, { overwrite, rename });
                if (copyResult) {
                  result = { operation: "copy", from: originalAssetPath, to: destinationPath, uuid: encodeUuid(copyResult.uuid) };
                } else {
                  result = { operation: "copy", from: originalAssetPath, to: destinationPath, success: false };
                }
                
                break;
              }

              case "move": {
                if (!originalAssetPath || !destinationPath) {
                  errors.push("originalAssetPath and destinationPath are required for move operation");
                  continue;
                }
                if (!overwrite && !rename) {
                  const existingAsset = await detectExistingAsset(destinationPath);
                  if (existingAsset) {
                    result = {
                      operation: "move",
                      from: originalAssetPath,
                      to: destinationPath,
                      ...(existingAsset.uuid ? { uuid: encodeUuid(existingAsset.uuid) } : {}),
                      skipped: true,
                      reason: "already_exists"
                    };
                    break;
                  }
                }

                const moveResult = await Editor.Message.request('asset-db', 'move-asset', originalAssetPath, destinationPath, { overwrite, rename });
                if (moveResult) {
                  result = { operation: "move", from: originalAssetPath, to: destinationPath, uuid: encodeUuid(moveResult.uuid) };
                } else {
                  result = { operation: "move", from: originalAssetPath, to: destinationPath, success: false };
                }
                
                break;
              }

              case "delete": {
                if (!originalAssetPath) {
                  errors.push("originalAssetPath is required for delete operation");
                  continue;
                }

                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', originalAssetPath);
                if (!assetInfo) {
                  errors.push(`Asset not found: ${originalAssetPath}`);
                  continue;
                }

                await Editor.Message.request('asset-db', 'delete-asset', originalAssetPath);
                result = { operation: "delete", path: originalAssetPath, uuid: encodeUuid(assetInfo.uuid) };
                break;
              }

              case "get-properties": {
                if (!originalAssetPath) {
                  errors.push("originalAssetPath is required for get-properties operation");
                  continue;
                }

                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', originalAssetPath);
                if (!assetInfo) {
                  errors.push(`Asset not found: ${originalAssetPath}`);
                  continue;
                }

                const propertiesDescription = await AssetInterpreterManager.getAssetProperties(assetInfo, includeTooltips, useAdvancedInspection);
                result = { 
                  operation: "get-properties", 
                  path: originalAssetPath, 
                  uuid: encodeUuid(assetInfo.uuid),
                  importer: assetInfo.importer,
                  properties: propertiesDescription.properties || {},
                  arrays: propertiesDescription.arrays || {},
                  error: propertiesDescription.error
                };
                break;
              }

              case "set-properties": {
                if (!originalAssetPath) {
                  errors.push("originalAssetPath is required for set-properties operation");
                  continue;
                }

                if (originalAssetPath.startsWith("db://internal")) {
                  errors.push("internal assets can't be modifyed");
                  continue;
                }

                if (!options.properties || !Array.isArray(options.properties) || options.properties.length === 0) {
                  errors.push("properties array is required for set-properties operation");
                  continue;
                }

                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', originalAssetPath);
                if (!assetInfo) {
                  errors.push(`Asset not found: ${originalAssetPath}`);
                  continue;
                }

                const propertyResults = await AssetInterpreterManager.setAssetProperties(assetInfo, options.properties as PropertySetSpec[]);
                result = { 
                  operation: "set-properties", 
                  path: originalAssetPath, 
                  uuid: encodeUuid(assetInfo.uuid),
                  importer: assetInfo.importer,
                  propertyResults: propertyResults
                };
                break;
              }
            }

            if (result) {
              results.push(result);
            }
          } catch (operationError) {
            errors.push(`${operation} failed: ${operationError instanceof Error ? operationError.message : String(operationError)}`);
          }
        }

        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        const response: any = { results };
        if (errors.length > 0) response.errors = errors;
        if (capturedLogs.length > 0) response.logs = capturedLogs;
        if (newComponentsAvailable.length > 0) response.newComponentsAvailable = newComponentsAvailable;

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response)
          }]
        };

      } catch (error) {
        const capturedLogs = await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        const response: any = { error: `Asset operation failed: ${error instanceof Error ? error.message : String(error)}` };
        if (capturedLogs.length > 0) response.logs = capturedLogs;

        return {
          content: [{
            type: "text",
            text: JSON.stringify(response)
          }]
        };
      }
    }
  );
}
