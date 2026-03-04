import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";

export function registerOperatePrefabAssetsTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_prefab_assets",
    {
      title: "Create, Open or Close Prefabs",
      description: "Prefab operations: create, edit, save, close",
      inputSchema: {
        operation: z.enum(['batch_create', 'open_for_editing', 'save_and_close', 'close_without_saving']),
        assetToOpenUrlOrUuid: z.string().optional().describe("Asset URL or UUID to open for editing (e.g., 'db://assets/MyPrefab.prefab' or UUID)"),
        creationOptions: z.array(z.object({
          nodeUuid: z.string(),
          assetPath: z.string().describe("Target asset path for the new prefab (e.g., 'db://assets/MyPrefab.prefab')"),
          removeOriginal: z.boolean().describe("Whether to remove the original node after creating prefab")
        })).optional().describe("Options for creating a prefabs from a nodes"),
      }
    },
    async ({ operation, assetToOpenUrlOrUuid, creationOptions }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];
        const notes: string[] = [];
        const result: any = {};

        switch (operation) {
          case 'batch_create':
            if (!creationOptions || creationOptions.length === 0) {
              throw new Error("Creation options are required for 'batch_create' operation");
            }
            for (const option of creationOptions) {
              await createPrefabFromNode(option, errors, notes);
            }
            break;
          case 'open_for_editing':
            if (!assetToOpenUrlOrUuid) {
              throw new Error("Asset URL or UUID is required for 'open_for_editing' operation");
            }
            await openPrefabFromAsset(assetToOpenUrlOrUuid, errors, notes);
            break;

          case 'save_and_close': {
            let prefabInfo: any = null;
            try {
              prefabInfo = await Editor.Message.request('scene', 'query-prefab-info');
            } catch {
              // ignore
            }

            if (!prefabInfo) {
              notes.push('No prefab editing session is active; skipped save_and_close.');
              break;
            }

            try {
              await Editor.Message.request('scene', 'save-scene');
            } catch (saveError) {
              errors.push(`Error saving prefab before closing: ${saveError instanceof Error ? saveError.message : String(saveError)}`);
            }

            try {
              await Editor.Message.request('scene', 'close-scene');
            } catch (closeError) {
              errors.push(`Error closing prefab: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            }
            break;
          }

          case 'close_without_saving': {
            let prefabInfo: any = null;
            try {
              prefabInfo = await Editor.Message.request('scene', 'query-prefab-info');
            } catch {
              // ignore
            }

            if (!prefabInfo) {
              notes.push('No prefab editing session is active; skipped close_without_saving.');
              break;
            }

            try {
              await Editor.Message.request('scene', 'close-scene');
            } catch (closeError) {
              errors.push(`Error closing prefab: ${closeError instanceof Error ? closeError.message : String(closeError)}`);
            }
            break;
          }
        }

        if (errors.length > 0) {
          result.errors = errors;
        }
        if (notes.length > 0) {
          result.notes = notes;
        }

        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        if (capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };

      } catch (error) {
        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });

        const result: any = { error: `Error creating prefab from node: ${error instanceof Error ? error.message : String(error)}` };
        if (capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }

        return { content: [{ type: "text", text: JSON.stringify(result) }] };
      }
    }
  );

  const createPrefabFromNode = async (options: { nodeUuid: string, assetPath: string, removeOriginal: boolean }, errors: string[], notes: string[]) => {
    let { nodeUuid, assetPath, removeOriginal } = options;

    let prefabUuid: string | null = null;
    let linkedNodeUuid: string | null = null;

    try {
      const decodedNodeUuid = decodeUuid(nodeUuid);

      // Verify node exists
      const nodeInfo = await Editor.Message.request('scene', 'query-node', decodedNodeUuid);
      if (!nodeInfo) {
        throw new Error(`Node with UUID ${nodeUuid} not found`);
      }

      // Validate asset path format
      if (!assetPath.startsWith('db://')) {
        // Assuming it's relative path for db://assets/
        assetPath = `db://assets/${assetPath}`;
      } 
      
      if (!assetPath.endsWith('.prefab')) {
        assetPath += '.prefab'; // Ensure it has .prefab extension
      }

      // Create prefab from node via scene script helper.
      try {
        const result = await Editor.Message.request('scene', 'execute-scene-script', {
          name: packageJSON.name,
          method: 'createPrefabFromNode',
          args: [decodedNodeUuid, assetPath],
        });
        
        if (result && result.uuid) {
          prefabUuid = result.uuid;
        } else if (result && typeof result === 'string') {
          // Sometimes the result is just the UUID string
          prefabUuid = result;
        } else {
          // Query the asset to get its UUID
          try {
            const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetPath);
            if (assetInfo && assetInfo.uuid) {
              prefabUuid = assetInfo.uuid;
            } else {
              errors.push("Prefab creation may have succeeded but couldn't retrieve prefab UUID");
            }
          } catch (queryError) {
            errors.push(`Prefab creation completed but failed to query prefab info: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
          }
        }

        // Find node with linked prefab which now has new UUID
        if (prefabUuid) {
          // Query the scene to find nodes with this prefab
          const sceneNodes = await Editor.Message.request('scene', 'query-node-tree') as any;
          if (sceneNodes) {
            // Recursively search for the node with the prefab UUID
            const findNodeWithPrefab = (nodes: any[]): string | null => {
              for (const node of nodes) {
                if (node.prefab?.assetUuid === prefabUuid) {
                  return node.uuid;
                }
                if (node.children) {
                  const found = findNodeWithPrefab(node.children);
                  if (found) {
                    return found;
                  }
                }
              }
              return null;
            }
            linkedNodeUuid = findNodeWithPrefab(sceneNodes.children);
          }
        }

        // Optionally remove the original node
        if (linkedNodeUuid && removeOriginal) {
          try {
            await Editor.Message.request('scene', 'remove-node', { uuid: linkedNodeUuid });
          } catch (removeError) {
            errors.push(`Failed to remove original node after prefab creation: ${removeError instanceof Error ? removeError.message : String(removeError)}`);
          }
        }
      } catch (createError) {
        errors.push(`Error creating prefab: ${createError instanceof Error ? createError.message : String(createError)}`);
      }
    } catch (nodeError) {
      errors.push(`Error verifying node: ${nodeError instanceof Error ? nodeError.message : String(nodeError)}`);
    }

    if (prefabUuid) {
      const encodedUuid = encodeUuid(prefabUuid);
      notes.push(`Prefab from node (UUID: '${nodeUuid}') created, prefab UUID: ${encodedUuid}\n`);
    } else {
      errors.push(`Failed to create prefab from node '${nodeUuid}' at path '${assetPath}'`);
    }

    if (linkedNodeUuid) {
      notes.push(`Original node has new UUID: ${encodeUuid(linkedNodeUuid)}`);
    }
  };

  const openPrefabFromAsset = async (assetToOpenUrlOrUuid: string, errors: string[], notes: string[]) => {
    let prefabOpened = false;
    let prefabInfo: any = null;

    try {
      let prefabUuid: string | undefined;

      // Determine if assetToOpenUrlOrUuid is UUID or URL
      if (assetToOpenUrlOrUuid.startsWith('db://')) {
        // It's a URL, get the UUID
        const queryResult = await Editor.Message.request('asset-db', 'query-uuid', assetToOpenUrlOrUuid);
        if (!queryResult) {
          throw new Error(`Prefab asset not found at URL: ${assetToOpenUrlOrUuid}`);
        } else {
          prefabUuid = queryResult;
        }
      } else {
        // It's a UUID
        prefabUuid = decodeUuid(assetToOpenUrlOrUuid);

        // Verify the UUID exists
        const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', prefabUuid);
        if (!assetInfo) {
          throw new Error(`Prefab asset not found for UUID: ${assetToOpenUrlOrUuid}`);
        } else {
          prefabInfo = assetInfo;
          
          // Verify it's actually a prefab
          if (assetInfo.type !== 'cc.Prefab' && !assetInfo.url.endsWith('.prefab')) {
            throw new Error(`Asset '${assetToOpenUrlOrUuid}' is not a prefab (type: ${assetInfo.type})`);
          }
        }
      }

      // Open prefab for editing using Cocos Creator API
      await Editor.Message.request('asset-db', 'open-asset', prefabUuid);
      prefabOpened = true;

      // Get prefab info if not already retrieved
      if (!prefabInfo) {
        try {
          prefabInfo = await Editor.Message.request('asset-db', 'query-asset-info', prefabUuid);
        } catch (infoError) {
          errors.push(`Could not retrieve prefab info after opening: ${infoError instanceof Error ? infoError.message : String(infoError)}`);
        }
      }
    } catch (openError) {
      errors.push(`Error opening prefab: ${openError instanceof Error ? openError.message : String(openError)}`);
    }

    if (prefabOpened && prefabInfo?.uuid) {
      notes.push(`Prefab ${prefabInfo.name} opened successfully (UUID: ${encodeUuid(prefabInfo.uuid)})`);
    } else if (prefabOpened) {
      notes.push('Prefab opened successfully.');
    }
  };
}
