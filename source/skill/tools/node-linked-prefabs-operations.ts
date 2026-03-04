import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";

export function registerNodeLinkedPrefabsOperationsTool(server: ToolRegistrar): void {
  server.registerTool(
    "node_linked_prefabs_operations",
    {
      title: "Node Linked Prefab Operations",
      description: "Performs prefab-related actions: edit, unwrap, locate, reset, update.",
      inputSchema: {
        nodeUuid: z.string().describe("UUID of the node linked to a prefab"),
        operation: z.enum(["edit-prefab", "unwrap", "unwrap-completely", "locate", "reset", "update-prefab"])
      }
    },
    async ({ nodeUuid, operation }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];
        let operationResult: any = null;

        try {
          const decodedNodeUuid = decodeUuid(nodeUuid);

          // Verify node exists
          const nodeInfo = await Editor.Message.request('scene', 'query-node', decodedNodeUuid);
          if (!nodeInfo) {
            errors.push(`Node with UUID ${nodeUuid} not found`);
          } else {
            // Check if node is linked to a prefab
            const nodeInfoAny = nodeInfo as any;
            const prefabInfo = nodeInfoAny.__prefab__ || nodeInfoAny._prefab;
            
            if (!prefabInfo || !prefabInfo.uuid) {
              errors.push(`Node ${nodeUuid} is not linked to a prefab`);
            } else {
              const prefabUuid = prefabInfo.uuid;
              const encodedPrefabUuid = encodeUuid(prefabUuid);

              switch (operation) {
                case "edit-prefab": {
                  try {
                    // Open prefab for editing
                    await Editor.Message.request('asset-db', 'open-asset', prefabUuid);
                    operationResult = {
                      success: true,
                      message: `Opened prefab for editing`,
                      prefabUuid: encodedPrefabUuid
                    };
                  } catch (openError) {
                    errors.push(`Failed to open prefab for editing: ${openError instanceof Error ? openError.message : String(openError)}`);
                  }
                  break;
                }

                case "unwrap": {
                  try {
                    // Use scene script to dump the node properly for prefab creation
                    let unlinkResult = await Editor.Message.request('scene', 'execute-scene-script', {
                      name: packageJSON.name,
                      method: 'unlinkPrefabByNode',
                      args: [nodeUuid, false]
                    }) as boolean;
                    if (!unlinkResult) {
                      errors.push(`Failed to unlink prefab from node '${nodeUuid}'`);
                    }
                    operationResult = {
                      success: unlinkResult,
                      message: `Node unlinked from prefab (single level)`,
                      prefabUuid: encodedPrefabUuid
                    };
                  } catch (unlinkError) {
                    errors.push(`Failed to unlink prefab: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
                  }
                  break;
                }

                case "unwrap-completely": {
                  try {
                    // Use scene script to dump the node properly for prefab creation
                    let unlinkResult = await Editor.Message.request('scene', 'execute-scene-script', {
                      name: packageJSON.name,
                      method: 'unlinkPrefabByNode',
                      args: [nodeUuid, false]
                    }) as boolean;
                    if (!unlinkResult) {
                      errors.push(`Failed to unlink prefab from node '${nodeUuid}'`);
                    }
                    operationResult = {
                      success: unlinkResult,
                      message: `Node unlinked from prefab (recursive)`,
                      prefabUuid: encodedPrefabUuid
                    };
                  } catch (unlinkError) {
                    errors.push(`Failed to unlink prefab recursively: ${unlinkError instanceof Error ? unlinkError.message : String(unlinkError)}`);
                  }
                  break;
                }

                case "locate": {
                  try {
                    // Get prefab asset information
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', prefabUuid);
                    if (assetInfo) {
                      operationResult = {
                        success: true,
                        message: `Located prefab asset`,
                        prefabUuid: encodedPrefabUuid,
                        prefabUrl: assetInfo.url,
                        prefabPath: assetInfo.path,
                        prefabName: assetInfo.name
                      };
                    } else {
                      errors.push(`Could not locate prefab asset information for UUID ${encodedPrefabUuid}`);
                    }
                  } catch (locateError) {
                    errors.push(`Failed to locate prefab: ${locateError instanceof Error ? locateError.message : String(locateError)}`);
                  }
                  break;
                }

                case "reset": {
                  try {
                    // Reset node to prefab state
                    const result = await (Editor.Message as any).request('scene', 'restore-prefab', decodedNodeUuid);
                    operationResult = {
                      success: true,
                      message: `Node reset to prefab state`,
                      prefabUuid: encodedPrefabUuid
                    };
                  } catch (resetError) {
                    errors.push(`Failed to reset node to prefab state: ${resetError instanceof Error ? resetError.message : String(resetError)}`);
                  }
                  break;
                }

                case "update-prefab": {
                  try {
                    // Use scene script to dump the node properly for prefab creation
                    await Editor.Message.request('scene', 'execute-scene-script', {
                      name: packageJSON.name,
                      method: 'applyPrefabByNode',
                      args: [nodeUuid]
                    }) as any;

                    operationResult = {
                      success: true,
                      message: `Node modifications applied to prefab`,
                      prefabUuid: encodedPrefabUuid
                    };
                  } catch (applyError) {
                    errors.push(`Failed to apply modifications to prefab: ${applyError instanceof Error ? applyError.message : String(applyError)}`);
                  }
                  break;
                }
              }
            }
          }
        } catch (nodeError) {
          errors.push(`Error accessing node: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`);
        }

        // Build compact JSON response
        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });

        await Editor.Message.request('scene', 'snapshot');

        const result = {
          success: operationResult?.success || false,
          operation: operation,
          nodeUuid: nodeUuid,
          ...(operationResult?.prefabUuid && { prefabUuid: operationResult.prefabUuid }),
          ...(operationResult?.prefabUrl && { prefabUrl: operationResult.prefabUrl }),
          ...(operationResult?.prefabPath && { prefabPath: operationResult.prefabPath }),
          ...(operationResult?.prefabName && { prefabName: operationResult.prefabName }),
          ...(errors.length > 0 && { errors: errors }),
          ...(capturedLogs.length > 0 && { logs: capturedLogs })
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result, null, 2)
          }]
        };

      } catch (error) {
        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        const errorResult = {
          success: false,
          operation: operation,
          nodeUuid: nodeUuid,
          error: error instanceof Error ? error.message : String(error),
          ...(capturedLogs.length > 0 && { logs: capturedLogs })
        };

        return {
          content: [{
            type: "text",
            text: JSON.stringify(errorResult, null, 2)
          }]
        };
      }
    }
  );
}