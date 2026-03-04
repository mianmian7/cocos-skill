import { ExecuteSceneScriptMethodOptions } from "@cocos/creator-types/editor/packages/scene/@types/public";
import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';

export function registerGetAvailableAssetTypesTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_available_asset_types",
    {
      title: "Get Available Asset Types",
      description: "Get available asset types",
      inputSchema: {
        // No input parameters needed
      }
    },
    async (args) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];
        let assetTypes: Array<string> = [];

        try {
          const options: ExecuteSceneScriptMethodOptions = {
              name: packageJSON.name,
              method: 'queryAssetTypes',
              args: []
          };
          assetTypes = await Editor.Message.request('scene', 'execute-scene-script', options);
        } catch (queryError) {
          errors.push(`Error querying asset types: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
        }

        // Build response message
        let message = '';
        
        if (assetTypes.length > 0) {
          message = assetTypes.join(', ');
        } else {
          message = 'No asset types found';
        }

        if (errors.length > 0) {
          message += `\n\nWarnings/Errors:\n${errors.join('\n')}`;
        }

        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        capturedLogs.forEach(log => message += ("\n" + log));

        return {
          content: [{
            type: "text",
            text: message
          }]
        };

      } catch (error) {
        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });
        
        let errorMessage = `Error retrieving asset types: ${error instanceof Error ? error.message : String(error)}`;
        capturedLogs.forEach(log => errorMessage += ("\n" + log));

        return {
          content: [{
            type: "text",
            text: errorMessage
          }]
        };
      }
    }
  );
}