import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";
import { runToolWithContext } from "../runtime/tool-runtime.js";
import { saveSceneNonInteractive } from "./scene-save.js";

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
    async ({ nodeUuid, operation }) => runToolWithContext(
      {
        toolName: 'node_linked_prefabs_operations',
        operation,
        effect: 'mutating-scene',
        packageName: packageJSON.name,
      },
      async ({ request, callSceneScript }) => {
        const decodedNodeUuid = decodeUuid(nodeUuid);
        const nodeInfo = await request('scene', 'query-node', decodedNodeUuid) as any;
        if (!nodeInfo) {
          throw new Error(`Node with UUID ${nodeUuid} not found`);
        }

        const prefabInfo = nodeInfo.__prefab__ || nodeInfo._prefab;
        if (!prefabInfo?.uuid) {
          throw new Error(`Node ${nodeUuid} is not linked to a prefab`);
        }

        const prefabUuid = prefabInfo.uuid;
        const encodedPrefabUuid = encodeUuid(prefabUuid);

        switch (operation) {
          case "edit-prefab": {
            const saveResult = await saveSceneNonInteractive(request);
            if (!saveResult.success) {
              throw new Error(`Failed to save current scene before opening prefab: ${saveResult.error || "unknown error"}`);
            }

            await request('asset-db', 'open-asset', prefabUuid);
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              message: 'Opened prefab for editing',
            };
          }

          case "unwrap": {
            const unlinkResult = await callSceneScript('unlinkPrefabByNode', [decodedNodeUuid, false]) as boolean | null | undefined;
            if (unlinkResult === false) {
              throw new Error(`Failed to unlink prefab from node '${nodeUuid}'`);
            }
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              message: 'Node unlinked from prefab (single level)',
            };
          }

          case "unwrap-completely": {
            const unlinkResult = await callSceneScript('unlinkPrefabByNode', [decodedNodeUuid, true]) as boolean | null | undefined;
            if (unlinkResult === false) {
              throw new Error(`Failed to unlink prefab from node '${nodeUuid}'`);
            }
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              message: 'Node unlinked from prefab (recursive)',
            };
          }

          case "locate": {
            const assetInfo = await request('asset-db', 'query-asset-info', prefabUuid) as any;
            if (!assetInfo) {
              throw new Error(`Could not locate prefab asset information for UUID ${encodedPrefabUuid}`);
            }
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              prefabUrl: assetInfo.url,
              prefabPath: assetInfo.path,
              prefabName: assetInfo.name,
              message: 'Located prefab asset',
            };
          }

          case "reset": {
            await request('scene', 'restore-prefab', decodedNodeUuid);
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              message: 'Node reset to prefab state',
            };
          }

          case "update-prefab": {
            await callSceneScript('applyPrefabByNode', [decodedNodeUuid]);
            return {
              nodeUuid,
              prefabUuid: encodedPrefabUuid,
              message: 'Node modifications applied to prefab',
            };
          }
        }
      }
    )
  );
}
