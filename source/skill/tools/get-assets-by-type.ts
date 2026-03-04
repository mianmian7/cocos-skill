import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { encodeUuid } from "../uuid-codec.js";

const ASSET_TYPE_ALIASES: Readonly<Record<string, readonly string[]>> = Object.freeze({
  "cc.TypeScript": ["cc.TypeScript", "cc.Script"],
  "cc.Script": ["cc.Script", "cc.TypeScript"],
});

function getAssetTypeCandidates(ccType: string): Set<string> {
  const normalizedType = ccType.trim();
  const aliases = ASSET_TYPE_ALIASES[normalizedType] ?? [];
  return new Set([normalizedType, ...aliases]);
}

function matchesRequestedAssetType(assetInfo: any, typeCandidates: Set<string>): boolean {
  if (!assetInfo || typeof assetInfo !== "object") {
    return false;
  }

  const assetType = typeof assetInfo.type === "string" ? assetInfo.type : "";
  if (assetType && typeCandidates.has(assetType)) {
    return true;
  }

  const inheritedTypes: string[] = Array.isArray(assetInfo.extends)
    ? assetInfo.extends.filter((entry: unknown): entry is string => typeof entry === "string")
    : [];

  return inheritedTypes.some((entry: string) => typeCandidates.has(entry));
}

export function registerGetAssetsByTypeTool(server: ToolRegistrar): void {
  server.registerTool(
    "get_assets_by_type",
    {
      title: "Get Assets By Type",
      description: "Get assets by type",
      inputSchema: {
        ccType: z.string().describe("Asset ccType to search for (e.g., 'cc.Prefab', 'cc.Material', 'cc.Texture2D')"),
        lookForTemplates: z.boolean().optional().default(false).describe("Look for templates in db://internal"),
        nameFilter: z.string().optional().describe("Optional substring to filter asset names")
      }
    },
    async ({ ccType, lookForTemplates, nameFilter }) => {
      await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'startCaptureSceneLogs', args: [] });
      try {
        const errors: string[] = [];
        let assets: Array<{ name: string; url: string; uuid: string }> = [];
        const typeCandidates = getAssetTypeCandidates(ccType);

        try {
          // Query for assets of the specified type
          const assetInfos = await Editor.Message.request('asset-db', 'query-assets', {
            pattern: (lookForTemplates ? 'db://internal/**' : 'db://assets/**')
          });

          if (assetInfos && Array.isArray(assetInfos)) {
            assets = assetInfos
              .filter((assetInfo: any) => {
                const hasName = typeof assetInfo?.name === "string";
                const matchesName = !nameFilter || (hasName && assetInfo.name.includes(nameFilter));
                return Boolean(assetInfo?.url) && matchesRequestedAssetType(assetInfo, typeCandidates) && matchesName;
              })
              .map((assetInfo: any) => ({
                name: assetInfo.name || 'Unknown',
                url: assetInfo.url,
                uuid: encodeUuid(assetInfo.uuid),
              }))
              .sort((a, b) => a.name.localeCompare(b.name)); // Sort by name for better UX
          }

          // If no results found, provide helpful message
          if (assets.length === 0) {
            errors.push(`No assets found for asset type '${ccType}'`);
          }

        } catch (queryError) {
          errors.push(`Error querying assets for asset type '${ccType}': ${queryError instanceof Error ? queryError.message : String(queryError)}`);
        }

        // Build response message
        let result: any = {};
        
        if (assets.length > 0) {
          result.assets = assets;
        } else {
          result.errors = [ `No assets found for asset type '${ccType + (nameFilter ? ` with name filter '${nameFilter}'` : '')}'. Tip: Use 'get-available-asset-types' tool to see all available asset types.` ];
        }

        if (errors.length > 0) {
          if (result.errors) {
            result.errors.push(...errors);
          }
        }

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
        const capturedLogs: Array<string> = 
          await Editor.Message.request('scene', 'execute-scene-script', { name: packageJSON.name, method: 'getCapturedSceneLogs', args: [] });

        let result: any = { error: `Error retrieving assets for asset type '${ccType}': ${error instanceof Error ? error.message : String(error)}` };
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
