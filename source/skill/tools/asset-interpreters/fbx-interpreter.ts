import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription } from "./interface";
import { BaseAssetInterpreter } from "./base-interpreter";

export class FbxInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'fbx';
    }

    async getProperties(assetInfo: AssetInfo, includeTooltips: boolean = false): Promise<AssetPropertiesDescription> {
        try {
            const meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            if (!meta) {
                return { 
                    uuid: assetInfo.uuid, 
                    importer: assetInfo.importer,
                    error: `Asset meta not found for ${assetInfo.uuid}` 
                };
            }

            const description: AssetPropertiesDescription = {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                properties: {},
                arrays: {}
            };

            // Use the flexible extraction from base class
            if (meta.userData) {
                this.extractPropertiesFromUserData(meta.userData, description, '', includeTooltips);
            }

            // Extract properties from subMetas (model, materials, animations, etc.)
            if (meta.subMetas) {
                for (const [subUuid, subMeta] of Object.entries(meta.subMetas)) {
                    if (subMeta && typeof subMeta === 'object' && 'userData' in subMeta && subMeta.userData) {
                        const subAssetName = this.getSubAssetName(assetInfo, subUuid);
                        this.extractPropertiesFromUserData(subMeta.userData, description, subAssetName, includeTooltips);
                    }
                }
            }

            return description;
        } catch (error) {
            return { 
                uuid: assetInfo.uuid, 
                importer: assetInfo.importer,
                error: `Error getting FBX properties: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }
}