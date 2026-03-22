import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { runToolWithContext } from "../runtime/tool-runtime.js";
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
      const effect = operation === 'open' || operation === 'save' || operation === 'set-properties'
        ? 'mutating-scene'
        : 'read';

      return runToolWithContext(
        {
          toolName: 'operate_current_scene',
          operation,
          effect,
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          switch (operation) {
            case "open": {
              if (!sceneToOpenUrlOrUuid) {
                throw new Error("sceneToOpenUrlOrUuid is required for 'open' operation");
              }

              let sceneInfo: any = null;
              let sceneUuid: string | undefined;

              if (sceneToOpenUrlOrUuid.startsWith('db://')) {
                const queryResult = await request('asset-db', 'query-uuid', sceneToOpenUrlOrUuid);
                if (!queryResult) {
                  throw new Error(`Scene asset not found at URL: ${sceneToOpenUrlOrUuid}`);
                }
                sceneUuid = queryResult as string;
              } else {
                sceneUuid = decodeUuid(sceneToOpenUrlOrUuid);
                const assetInfo = await request('asset-db', 'query-asset-info', sceneUuid) as any;
                if (!assetInfo) {
                  throw new Error(`Scene asset not found for UUID: ${sceneToOpenUrlOrUuid}`);
                }
                sceneInfo = assetInfo;
              }

              const saveResult = await saveSceneNonInteractive(request);
              if (!saveResult.success) {
                throw new Error(`Failed to save current scene before opening target scene: ${saveResult.error || "unknown error"}`);
              }

              await request('scene', 'open-scene', sceneUuid);
              if (!sceneInfo) {
                try {
                  sceneInfo = await request('asset-db', 'query-asset-info', sceneUuid);
                } catch {
                  sceneInfo = null;
                }
              }

              return {
                url: sceneInfo?.url || null,
                uuid: sceneInfo?.uuid ? encodeUuid(sceneInfo.uuid) : null,
              };
            }

            case "save":
              return saveSceneNonInteractive(request);

            case "inspect-hierarchy": {
              const nodeTree = await request('scene', 'query-node-tree') as any;
              if (!nodeTree) {
                throw new Error("No scene loaded");
              }

              const buildHierarchy = (node: any, currentDepth = 0): any => {
                const result: any = {
                  name: node.name?.value || node.name || "Unnamed Node",
                  uuid: encodeUuid(node.uuid?.value || node.uuid),
                };

                if (node.__comps__ && node.__comps__.length > 0) {
                  result.components = node.__comps__.map((component: any) => ({
                    name: component.value.name.value,
                    uuid: encodeUuid(component.value.uuid.value),
                  }));
                }

                const shouldIncludeChildren = currentDepth < maxDepth;
                const children = node.children || node.__children__;
                if (shouldIncludeChildren && Array.isArray(children) && children.length > 0) {
                  result.children = children.map((child: any) => buildHierarchy(child, currentDepth + 1));
                }

                return result;
              };

              return {
                hierarchy: buildHierarchy(nodeTree),
              };
            }

            case "get-properties": {
              const nodeTree = await request('scene', 'query-node-tree') as any;
              if (!nodeTree) {
                throw new Error("No scene loaded");
              }

              const rootNodeInfo = await request('scene', 'query-node', nodeTree.uuid) as any;
              if (!rootNodeInfo || !rootNodeInfo._globals) {
                throw new Error("Scene globals not found");
              }

              const globalsInfo = await getComponentInfo(rootNodeInfo._globals, true, includeTooltips);
              return {
                success: !globalsInfo.error,
                data: {
                  properties: globalsInfo.properties || {},
                  arrays: globalsInfo.arrays || {},
                },
                errors: globalsInfo.error ? [globalsInfo.error] : [],
              };
            }

            case "set-properties": {
              if (properties.length === 0) {
                throw new Error("properties array is required for 'set-properties' operation");
              }

              const nodeTree = await request('scene', 'query-node-tree') as any;
              if (!nodeTree) {
                throw new Error("No scene loaded");
              }

              const propertySpecs: PropertySetSpec[] = properties.map((prop: {
                propertyPath: string;
                propertyType: string;
                propertyValue: any;
              }) => ({
                propertyPath: prop.propertyPath,
                propertyType: prop.propertyType,
                propertyValue: prop.propertyValue,
              }));

              const results = await setProperties(nodeTree.uuid, "_globals", propertySpecs);
              const successCount = results.filter((result) => result.success).length;
              const failures = results
                .filter((result) => !result.success)
                .map((result) => `Failed to set ${result.propertyPath}: ${result.error || 'unknown error'}`);

              return {
                success: successCount === properties.length,
                data: {
                  successCount,
                  totalCount: properties.length,
                  results,
                },
                errors: failures,
              };
            }

            case "get-last-logs": {
              let logs: string[] = [];
              let source = "project-file";

              try {
                const logFilePath = path.join(Editor.Project.path, 'temp', 'logs', 'project.log');
                if (!fs.existsSync(logFilePath)) {
                  throw new Error('Project log file not found');
                }

                const content = fs.readFileSync(logFilePath, 'utf8');
                const lines = content.split('\n').filter((line) => line.trim());
                const requestedCount = lastLogsCount || 500;
                logs = lines.slice(-requestedCount);
              } catch (projectLogError) {
                console.log(`Project log file not accessible, falling back to scene logs: ${projectLogError}`);
                const lastSceneLogs = await request('scene', 'execute-scene-script', {
                  name: packageJSON.name,
                  method: 'getLastSceneLogs',
                  args: [lastLogsCount],
                });

                logs = Array.isArray(lastSceneLogs)
                  ? lastSceneLogs.filter((entry): entry is string => typeof entry === 'string')
                  : [];
                source = "scene-buffer";
              }

              return {
                logs,
                totalLogsRetrieved: logs.length,
                source,
              };
            }
          }
        }
      );
    }
  );
}
