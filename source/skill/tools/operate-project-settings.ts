import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { decodeUuid, encodeUuid } from "../uuid-codec.js";

export function registerOperateProjectSettingsTool(server: ToolRegistrar): void {
  server.registerTool(
    "operate_project_settings",
    {
      title: "Operate Project Settings",
      description: "Get/set project settings",
      inputSchema: {
        designResolution: z.object({ 
          width: z.number().int(), 
          height: z.number().int(), 
          fitWidth: z.boolean(), 
          fitHeight: z.boolean() 
        }).optional(),
        objectLayers: z.array(z.string()).optional().describe("Object layers names array"),
        sortingLayers: z.array(z.string()).optional().describe("Used for cc.Sorting component"),
        collisionGroups: z.array(z.string()).optional().describe("Collision group names array"),
        collisionMatrix: z.array(z.object({ 
          groupId: z.number().int(), 
          collidesWith: z.array(z.number().int())
        })).optional()
      }
    },
    async ({ designResolution, objectLayers, sortingLayers, collisionGroups, collisionMatrix }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];

        // Setting properties if got any
        try {
          // 1. Set design resolution
          if (designResolution) {
            for (const key of Object.keys(designResolution)) {
              const result = await Editor.Message.request('project', 'set-config', 'project', `general.designResolution.${key}`, (designResolution as any)[key]);
              if (!result) {
                throw new Error("Failed to set design resolution");
              }
            }
          }

          // 2. Set object layers
          if (objectLayers) {
            const parsedLayers = [];
            for (let i = 0; i < objectLayers.length; i++) {
              parsedLayers.push({name: objectLayers[i], value: 1 << i});
            }
            const result = await Editor.Message.request('project', 'set-config', 'project', 'layer', parsedLayers);
            if (!result) {
              throw new Error("Failed to set object layers");
            }
          }

          // 3. Set sorting layers
          if (sortingLayers) {
            const parsedLayers = [];
            if (!sortingLayers.includes('default')) {
              sortingLayers.unshift('default');
            } else {
              const defaultLayerIndex = sortingLayers.indexOf('default');
              if (defaultLayerIndex > 0) {
                sortingLayers.splice(defaultLayerIndex, 1);
                sortingLayers.unshift('default');
              }
            }
            for (let i = 0; i < sortingLayers.length; i++) {
              parsedLayers.push({id: i, name: sortingLayers[i], value: i});
            }
            const result = await Editor.Message.request('project', 'set-config', 'project', 'sorting-layer.layers', parsedLayers);
            if (!result) {
              throw new Error("Failed to set sorting layers");
            }
          }

          // 4. Set collision groups
          if (collisionGroups) {
            const parsedGroups = [];
            let defaultGroupIndex = collisionGroups.indexOf('DEFAULT');
            if (defaultGroupIndex !== -1) {
              collisionGroups.splice(defaultGroupIndex, 1);
            }
            for (let i = 0; i < collisionGroups.length; i++) {
              parsedGroups.push({index: (i + 1), name: collisionGroups[i]});
            }
            const result = await Editor.Message.request('project', 'set-config', 'project', 'physics.collisionGroups', parsedGroups);
            if (!result) {
              throw new Error("Failed to set collision groups");
            }
          }

          // 5. Collision matrix
          if (collisionMatrix) {
            const parsedMatrix = await Editor.Message.request('project', 'query-config', 'project', 'physics.collisionMatrix');
            if (!parsedMatrix) {
              throw new Error("Failed to fetch actual collision matrix");
            }
            for (let collisions of collisionMatrix) {
              parsedMatrix[collisions.groupId] = 0;
              for (let i = 0; i < collisions.collidesWith.length; i++) {
                parsedMatrix[collisions.groupId] = parsedMatrix[collisions.groupId] | (1 << collisions.collidesWith[i]);
              }
            }
            const result = await Editor.Message.request('project', 'set-config', 'project', 'physics.collisionMatrix', parsedMatrix);
            if (!result) {
              throw new Error("Failed to set collision matrix");
            }
          }
        } catch (setSettingsError) {
          errors.push(`Error setting: ${setSettingsError instanceof Error ? setSettingsError.message : String(setSettingsError)}`);
        }

        // Initialize project settings object
        const projectSettings: any = {};

        try {

          // 1. Get design resolution
          const designResolution = await Editor.Message.request('project', 'query-config', 'project', 'general.designResolution');
          if (designResolution) {
            projectSettings.designResolution = designResolution;
          }

          // 2. Get object layers
          const objectLayers = await Editor.Message.request('project', 'query-config', 'project', 'layer');
          if (objectLayers) {
            // Add built-in layers
            const noneLayerIndex = objectLayers.findIndex((l: any) => l.name === 'NONE');
            if (noneLayerIndex !== -1) {
              objectLayers.splice(noneLayerIndex, 1);
            }
            objectLayers.unshift({name: 'NONE', value: 0});
            [
              {name: 'IGNORE_RAYCAST', value: 1048576},
              {name: 'GIZMOS', value: 2097152},
              {name: 'EDITOR', value: 4194304},
              {name: 'UI_3D', value: 8388608},
              {name: 'SCENE_GIZMO', value: 16777216},
              {name: 'UI_2D', value: 33554432},
              {name: 'PROFILER', value: 268435456},
              {name: 'DEFAULT', value: 1073741824},
              {name: 'ALL', value: 4294967295}
            ].forEach(defLayer => {
              const defLayerIndex = objectLayers.findIndex((l: any) => l.name === defLayer.name);
              if (defLayerIndex !== -1) {
                objectLayers.splice(defLayerIndex, 1);
              }
              objectLayers.push(defLayer);
            })

            projectSettings.objectLayers = objectLayers;
          }

          // 3. Get sorting layers
          const sortingLayers = await Editor.Message.request('project', 'query-config', 'project', 'sorting-layer.layers');
          if (sortingLayers) {
            projectSettings.sortingLayers = sortingLayers;
          }

          // 4. Get collision groups
          const collisionGroups = await Editor.Message.request('project', 'query-config', 'project', 'physics.collisionGroups');
          if (collisionGroups) {
            collisionGroups.unshift({index: 0, name: 'DEFAULT'});
            projectSettings.collisionGroups = collisionGroups;
          }

          // 5. Get collision matrix
          const collisionMatrix = await Editor.Message.request('project', 'query-config', 'project', 'physics.collisionMatrix');
          if (collisionMatrix) {
            // Parse collision matrix from bitmask array to input format
            const parsedCollisionMatrix = [];
            for (let groupId in collisionMatrix) {
              const groupIndex = Number(groupId);
              if (Number.isNaN(groupIndex)) {
                continue;
              }

              const bitmask = collisionMatrix[groupIndex];
              if (bitmask !== undefined) {
                const collidesWith = [];
                // Decode bitmask to get collision group IDs
                for (let i = 0; i < 32; i++) { // 32-bit bitmask
                  if (bitmask & (1 << i)) {
                    collidesWith.push(i);
                  }
                }
                if (collidesWith.length > 0) {
                  parsedCollisionMatrix.push({
                    groupId: groupIndex,
                    collidesWith: collidesWith
                  });
                }
              }
            }
            projectSettings.collisionMatrix = parsedCollisionMatrix;
          }

        } catch (getSettingsError) {
          errors.push(`Error getting settings: ${getSettingsError instanceof Error ? getSettingsError.message : String(getSettingsError)}`);
        }

        const result: any = {};

        // Build response message
        if (Object.keys(projectSettings).length > 0) {
          result.actualSettings = projectSettings;
        } else {
          result.errors = ['Failed to retrieve project settings'];
        }

        if (errors.length > 0) {
          if (result.errors) {
            result.errors.push(...errors);
          } else {
            result.errors = errors;
          }
        }

        await Editor.Message.request('scene', 'soft-reload');
        await Editor.Message.request('scene', 'snapshot');

        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        if (capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }]
        };

      } catch (error) {
        let result: any = { error: error };

        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        if (capturedLogs.length > 0) {
          result.logs = capturedLogs;
        }

        return {
          content: [{
            type: "text",
            text: JSON.stringify(result)
          }]
        };
      }
    }
  );
}