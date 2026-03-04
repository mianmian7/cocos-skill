import { ExecuteSceneScriptMethodOptions } from "@cocos/creator-types/editor/packages/scene/@types/public";
import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';

export function registerGetAvailableComponentTypesTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_available_component_types",
    {
      title: "Get Available Component Types",
      description: "Get available component types",
      inputSchema: {
        nameFilter: z.string().optional().describe("Optional substring to filter component types")
      }
    },
    async ({ nameFilter }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];
        let componentTypes: Array<string> = [];

        try {
          const options: ExecuteSceneScriptMethodOptions = {
              name: packageJSON.name,
              method: 'queryComponentTypes',
              args: []
          };
          componentTypes = await Editor.Message.request('scene', 'execute-scene-script', options);
        } catch (queryError) {
          errors.push(`Error querying component types: ${queryError instanceof Error ? queryError.message : String(queryError)}`);
        }

        componentTypes = componentTypes.filter(type => !nameFilter || type.includes(nameFilter));

        // Build response message
        let message = '';
        
        if (componentTypes.length > 0) {
          message = componentTypes.join(', ');
        } else {
          message = 'No component types found';
          if (nameFilter) {
            message += ` with name filter '${nameFilter}'`;
          }
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
        
        let errorMessage = `Error retrieving component types: ${error instanceof Error ? error.message : String(error)}`;
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