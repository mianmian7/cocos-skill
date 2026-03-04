import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription, PropertySetSpec, PropertySetResult } from "./interface";
import { BaseAssetInterpreter } from "./base-interpreter";

export class ImageInterpreter extends BaseAssetInterpreter {

    get importerType() {
        return 'image';
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

            // Extract properties from subMetas (texture, sprite-frame, etc.)
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
                error: `Error getting image properties: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }



    async setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]> {
        const results: PropertySetResult[] = [];
        
        try {
            const meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            if (!meta) {
                return properties.map(prop => ({
                    propertyPath: prop.propertyPath,
                    success: false,
                    error: `Asset meta not found for ${assetInfo.uuid}`
                }));
            }

            for (const prop of properties) {
                try {
                    const success = await this.setImageProperty(meta, prop);
                    results.push({
                        propertyPath: prop.propertyPath,
                        success
                    });
                } catch (error) {
                    results.push({
                        propertyPath: prop.propertyPath,
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Save the meta after all properties are set
            if (results.some(r => r.success)) {
                await Editor.Message.request('asset-db', 'save-asset-meta', assetInfo.uuid, JSON.stringify(meta));
            }

        } catch (error) {
            return properties.map(prop => ({
                propertyPath: prop.propertyPath,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            }));
        }

        return results;
    }

    private async setImageProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        const pathParts = prop.propertyPath.split('.');
        
        // Main image properties go to userData
        const mainImageProps = ['type', 'flipVertical', 'fixAlphaTransparencyArtifacts', 'flipGreenChannel', 'isRGBE'];
        
        if (pathParts.length === 1 && mainImageProps.includes(pathParts[0])) {
            if (!meta.userData) {
                meta.userData = {};
            }
            meta.userData[pathParts[0]] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
            return true;
        }
        
        // Sub-asset properties
        if (pathParts.length > 1) {
            const subAssetName = pathParts[0];
            const propertyName = pathParts.slice(1).join('.');
            
            // Find the sub-meta by name
            if (meta.subMetas) {
                for (const [subUuid, subMeta] of Object.entries(meta.subMetas)) {
                    if (subMeta && typeof subMeta === 'object' && 'userData' in subMeta) {
                        // Check if this is the right sub-asset (simplified check)
                        if (subAssetName === subUuid || subAssetName === 'texture' || subAssetName === 'spriteFrame') {
                            if (!subMeta.userData) {
                                subMeta.userData = {};
                            }
                            
                            const propParts = propertyName.split('.');
                            let current: any = subMeta.userData;
                            
                            // Navigate to parent
                            for (let i = 0; i < propParts.length - 1; i++) {
                                if (!current[propParts[i]]) {
                                    current[propParts[i]] = {};
                                }
                                current = current[propParts[i]];
                            }
                            
                            // Set final property
                            const finalKey = propParts[propParts.length - 1];
                            current[finalKey] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
                            return true;
                        }
                    }
                }
            }
        }
        
        return false;
    }
}