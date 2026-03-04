import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { getComponentInfo, setProperties, PropertySetSpec } from "../tool-utils";
import { saveSceneNonInteractive } from "./scene-save.js";
import * as fs from 'fs';
import * as path from 'path';

export function registerOperateCurrentSceneTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_current_scene",
    {
      title: "Operations with currently opened scene",
      description: `Scene operations: open, save, inspect, get/set properties, retrieve logs. Log retrieval prioritizes project log file over scene buffer.

**For inspect-hierarchy:** Use maxDepth to limit data returned. Start with low values (1-3) to explore structure, then drill deeper as needed. Consider using query_nodes tool for more granular control.`,
      inputSchema: {
        operation: z.enum(["open", "save", "inspect-hierarchy", "get-properties", "set-properties", "get-last-logs"]),
        sceneToOpenUrlOrUuid: z.string().describe("UUID or URL to open (for 'open' operation)").optional(),
        includeTooltips: z.boolean().describe("Include property tooltips (for 'get-properties' operation)").default(false),
        properties: z.array(z.object({
          propertyPath: z.string().describe("Property path (e.g., 'scene.ambientSky.skyColor')"),
          propertyType: z.string().describe("Property type (e.g., 'cc.Color', 'String', 'Number')"),
          propertyValue: z.unknown().describe("Property value to set")
        })).describe("Properties to set (for 'set-properties' operation)").default([]),
        lastLogsCount: z.number().int().max(500).optional().describe("Number of last logs to retrieve (for 'get-last-logs' operation, max 500)"),
        maxDepth: z.number().default(2).describe("Hierarchy depth limit for 'inspect-hierarchy'. DO NOT specify unless you need deeper than 2 levels.")
      }
    },
    async ({ operation, sceneToOpenUrlOrUuid, includeTooltips, properties, lastLogsCount, maxDepth }) => {
      try {
        switch (operation) {
          case "open": {
            if (!sceneToOpenUrlOrUuid) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "sceneToOpenUrlOrUuid is required for 'open' operation" })
                }]
              };
            }

            let sceneInfo: any = null;
            let sceneUuid: string | undefined;

            if (sceneToOpenUrlOrUuid.startsWith('db://')) {
              // It's a URL, get the UUID
              const queryResult = await Editor.Message.request('asset-db', 'query-uuid', sceneToOpenUrlOrUuid);
              if (!queryResult) {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({ success: false, error: `Scene asset not found at URL: ${sceneToOpenUrlOrUuid}` })
                  }]
                };
              }
              sceneUuid = queryResult;
            } else {
              // It's a UUID
              sceneUuid = decodeUuid(sceneToOpenUrlOrUuid);
              // Verify the UUID exists
              const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', sceneUuid);
              if (!assetInfo) {
                return {
                  content: [{
                    type: "text",
                    text: JSON.stringify({ success: false, error: `Scene asset not found for UUID: ${sceneToOpenUrlOrUuid}` })
                  }]
                };
              }
              sceneInfo = assetInfo;
            }

            const saveResult = await saveSceneNonInteractive((channel, command, ...args) =>
              Editor.Message.request(channel, command, ...args)
            );
            if (!saveResult.success) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    success: false,
                    error: `Failed to save current scene before opening target scene: ${saveResult.error || "unknown error"}`,
                    saveResult
                  })
                }]
              };
            }

            await Editor.Message.request('scene', 'open-scene', sceneUuid);
            if (!sceneInfo) {
              try {
                sceneInfo = await Editor.Message.request('asset-db', 'query-asset-info', sceneUuid);
              } catch {}
            }

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  url: sceneInfo?.url || null,
                  uuid: sceneInfo?.uuid ? encodeUuid(sceneInfo.uuid) : null
                })
              }]
            };
          }

          case "save": {
            const saveResult = await saveSceneNonInteractive((channel, command, ...args) =>
              Editor.Message.request(channel, command, ...args)
            );
            return {
              content: [{
                type: "text",
                text: JSON.stringify(saveResult)
              }]
            };
          }

          case "inspect-hierarchy": {
            const nodeTree = await Editor.Message.request('scene', 'query-node-tree');
            if (!nodeTree) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "No scene loaded" })
                }]
              };
            }

            // Build hierarchy tree recursively with depth limit
            const buildHierarchy = (node: any, currentDepth: number = 0): any => {
              const result: any = {
                name: node.name?.value || node.name || "Unnamed Node",
                uuid: encodeUuid(node.uuid?.value || node.uuid),
              };

              // Add components
              if (node.__comps__ && node.__comps__.length > 0) {
                result.components = node.__comps__.map((component: any) => ({
                  name: component.value.name.value,
                  uuid: encodeUuid(component.value.uuid.value)
                }));
              }

              // Add children recursively if within depth limit
              const shouldIncludeChildren = currentDepth < maxDepth;
              if (shouldIncludeChildren && ((node.children && node.children.length > 0) || (node.__children__ && node.__children__.length > 0))) {
                const children = node.children || node.__children__;
                result.children = children.map((child: any) => buildHierarchy(child, currentDepth + 1));
              }

              return result;
            };

            const hierarchy = buildHierarchy(nodeTree);
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: true, hierarchy })
              }]
            };
          }

          case "get-properties": {
            // Get root scene node
            const nodeTree = await Editor.Message.request('scene', 'query-node-tree') as any;
            if (!nodeTree) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "No scene loaded" })
                }]
              };
            }

            const rootNodeUuid = nodeTree.uuid;
            const rootNodeInfo = await Editor.Message.request('scene', 'query-node', rootNodeUuid) as any;
            
            if (!rootNodeInfo || !rootNodeInfo._globals) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "Scene globals not found" })
                }]
              };
            }

            // Get component info for _globals
            const globalsInfo = await getComponentInfo(rootNodeInfo._globals, true, includeTooltips);
            
            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: true,
                  properties: globalsInfo.properties || {},
                  arrays: globalsInfo.arrays || {},
                  error: globalsInfo.error
                })
              }]
            };
          }

          case "set-properties": {
            if (properties.length === 0) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "properties array is required for 'set-properties' operation" })
                }]
              };
            }

            // Get root scene node
            const nodeTree = await Editor.Message.request('scene', 'query-node-tree') as any;
            if (!nodeTree) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({ success: false, error: "No scene loaded" })
                }]
              };
            }

            const rootNodeUuid = nodeTree.uuid;

            // Use shared utility to set properties
            const propertySpecs: PropertySetSpec[] = properties.map((prop: {
              propertyPath: string;
              propertyType: string;
              propertyValue: any;
            }) => ({
              propertyPath: prop.propertyPath,
              propertyType: prop.propertyType,
              propertyValue: prop.propertyValue
            }));

            const results = await setProperties(rootNodeUuid, "_globals", propertySpecs);
            const successCount = results.filter(r => r.success).length;

            return {
              content: [{
                type: "text",
                text: JSON.stringify({
                  success: successCount === properties.length,
                  successCount,
                  totalCount: properties.length,
                  results
                })
              }]
            };
          }

          case "get-last-logs": {
            try {
              // First try to read from the project log file
              let logs: string[] = [];
              let source = "project-file";
              
              try {
                // Get the project log file path
                const logFilePath = path.join(Editor.Project.path, 'temp', 'logs', 'project.log');
                
                // Try to read the log file directly
                if (fs.existsSync(logFilePath)) {
                  const content = fs.readFileSync(logFilePath, 'utf8');
                  const lines = content.split('\n').filter(line => line.trim());
                  const requestedCount = lastLogsCount || 500;
                  logs = lines.slice(-requestedCount);
                  source = "project-file";
                } else {
                  throw new Error('Project log file not found');
                }
              } catch (projectLogError) {
                // Fallback to existing scene logging
                console.log(`Project log file not accessible, falling back to scene logs: ${projectLogError}`);
                
                const lastLogs = await Editor.Message.request('scene', 'execute-scene-script', { 
                  name: packageJSON.name, 
                  method: 'getLastSceneLogs', 
                  args: [lastLogsCount] 
                });
                
                logs = lastLogs || [];
                source = "scene-buffer";
              }
              
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    operation: "get-last-logs",
                    success: true,
                    logs: logs,
                    totalLogsRetrieved: logs.length
                  }, null, 2)
                }]
              };
            } catch (error) {
              return {
                content: [{
                  type: "text",
                  text: JSON.stringify({
                    operation: "get-last-logs",
                    success: false,
                    error: `Failed to retrieve logs: ${error instanceof Error ? error.message : String(error)}`
                  }, null, 2)
                }]
              };
            }
          }

          default:
            return {
              content: [{
                type: "text",
                text: JSON.stringify({ success: false, error: "Unknown operation" })
              }]
            };
        }
      } catch (error) {
        return {
          content: [{
            type: "text",
            text: JSON.stringify({
              success: false,
              error: error instanceof Error ? error.message : String(error)
            })
          }]
        };
      }
    }
  );
}
