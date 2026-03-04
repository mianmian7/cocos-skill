import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { BaseAssetInterpreter } from "./base-interpreter";
import { PropertySetSpec, PropertySetResult } from "./interface";

export class SpriteFrameInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'sprite-frame';
    }

    // Define read-only properties that are computed from the source image
    private readonly readOnlyProperties = new Set([
        'width', 'height', 'rawWidth', 'rawHeight', 
        'trimX', 'trimY', 'offsetX', 'offsetY',
        'vertices', 'rotated', 'isUuid', 'imageUuidOrDatabaseUri'
    ]);

    // Define writable properties that can be user-configured
    private readonly writableProperties = new Set([
        'pivotX', 'pivotY', 'packable', 'pixelsToUnit',
        'borderTop', 'borderBottom', 'borderLeft', 'borderRight',
        'trimThreshold', 'meshType', 'trimType', 'atlasUuid'
    ]);

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
                    // Extract the property name from the path (removing userData. prefix)
                    const propertyName = prop.propertyPath.replace(/^userData\./, '');
                    
                    // Check if this property is read-only
                    if (this.readOnlyProperties.has(propertyName)) {
                        results.push({
                            propertyPath: prop.propertyPath,
                            success: false,
                            error: `Property '${propertyName}' is read-only and computed from the source image`
                        });
                        continue;
                    }

                    // Check if this property is known to be writable
                    if (!this.writableProperties.has(propertyName)) {
                        // For unknown properties, add a warning but still try to set them
                        console.warn(`Warning: Property '${propertyName}' is not in the known writable properties list. This might not take effect.`);
                    }

                    const success = await this.setProperty(meta, prop);
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
                // Refresh the asset to apply the changes
                await Editor.Message.request('asset-db', 'refresh-asset', assetInfo.url);
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
}