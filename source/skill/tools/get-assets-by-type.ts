import type { ToolRegistrar } from "../../core/tool-contract.js";
import { z } from "zod";
import packageJSON from '../../../package.json';
import { runToolWithContext } from "../runtime/tool-runtime.js";
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
    async ({ ccType, lookForTemplates, nameFilter }) =>
      runToolWithContext(
        {
          toolName: "get_assets_by_type",
          operation: "get-assets-by-type",
          effect: "read",
          packageName: packageJSON.name,
        },
        async ({ request }) => {
          const typeCandidates = getAssetTypeCandidates(ccType);
          const assetInfos = await request("asset-db", "query-assets", {
            pattern: lookForTemplates ? "db://internal/**" : "db://assets/**",
          });

          if (!Array.isArray(assetInfos)) {
            throw new Error(`Unexpected asset query result for asset type '${ccType}'`);
          }

          const assets = assetInfos
            .filter((assetInfo: any) => {
              const hasName = typeof assetInfo?.name === "string";
              const matchesName = !nameFilter || (hasName && assetInfo.name.includes(nameFilter));
              return Boolean(assetInfo?.url) && matchesRequestedAssetType(assetInfo, typeCandidates) && matchesName;
            })
            .map((assetInfo: any) => ({
              name: assetInfo.name || "Unknown",
              url: assetInfo.url,
              uuid: encodeUuid(assetInfo.uuid),
            }))
            .sort((a, b) => a.name.localeCompare(b.name));

          return {
            data: { assets },
            warnings:
              assets.length === 0
                ? [
                    `No assets found for asset type '${ccType}${nameFilter ? ` with name filter '${nameFilter}'` : ""}'`,
                  ]
                : [],
          };
        }
      )
  );
}
