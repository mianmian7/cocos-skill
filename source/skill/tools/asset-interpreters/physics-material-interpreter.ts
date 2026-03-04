import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription, PropertySetSpec, PropertySetResult } from "./interface";
import { BaseAssetInterpreter } from "./base-interpreter";

export class PhysicsMaterialInterpreter extends BaseAssetInterpreter {

    get importerType() {
        return 'physics-material';
    }

    async getProperties(assetInfo: AssetInfo, includeTooltips: boolean = false): Promise<AssetPropertiesDescription> {
        try {
            // Get physics material data from scene
            const physicsData = await Editor.Message.request('scene', 'query-physics-material', assetInfo.uuid);
            
            // Debug: Log the structure
            console.log('Physics Data Structure:', JSON.stringify(physicsData, null, 2));
            
            const description: AssetPropertiesDescription = {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                properties: {},
                arrays: {}
            };

            if (physicsData) {
                // Use the flexible extraction method for physics data
                this.extractPropertiesFromUserData(physicsData, description, '', includeTooltips);
            }

            // Also extract from meta userData if available
            const meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
            if (meta && meta.userData) {
                this.extractPropertiesFromUserData(meta.userData, description, '', includeTooltips);
            }

            return description;
        } catch (error) {
            return { 
                uuid: assetInfo.uuid, 
                importer: assetInfo.importer,
                error: `Error getting physics material properties: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }

    async setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]> {
        const results: PropertySetResult[] = [];
        
        try {
            let physicsData = await Editor.Message.request('scene', 'query-physics-material', assetInfo.uuid);
            if (!physicsData) {
                return properties.map(prop => ({
                    propertyPath: prop.propertyPath,
                    success: false,
                    error: 'Physics material data not found'
                }));
            }

            let hasChanges = false;

            for (const prop of properties) {
                try {
                    if (physicsData[prop.propertyPath] && typeof physicsData[prop.propertyPath] === 'object') {
                        const convertedValue = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
                        
                        // Validate the converted value for physics properties
                        if (!this.validatePhysicsProperty(prop.propertyPath, convertedValue)) {
                            results.push({
                                propertyPath: prop.propertyPath,
                                success: false,
                                error: `Invalid value for ${prop.propertyPath}: ${convertedValue}`
                            });
                            continue;
                        }

                        physicsData[prop.propertyPath].value = convertedValue;
                        hasChanges = true;
                        results.push({
                            propertyPath: prop.propertyPath,
                            success: true
                        });
                    } else {
                        results.push({
                            propertyPath: prop.propertyPath,
                            success: false,
                            error: `Property ${prop.propertyPath} not found`
                        });
                    }
                } catch (error) {
                    results.push({
                        propertyPath: prop.propertyPath,
                        success: false,
                        error: error instanceof Error ? error.message : String(error)
                    });
                }
            }

            // Apply the physics material changes using the proper workflow
            if (hasChanges) {
                // First call change-physics-material to validate and process the changes
                physicsData = await Editor.Message.request('scene', 'change-physics-material', physicsData);
                
                // Then apply the changes to persist them
                await Editor.Message.request('scene', 'apply-physics-material', assetInfo.uuid, physicsData);
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

    private validatePhysicsProperty(propertyPath: string, value: any): boolean {
        // Ensure the value is a number for all physics properties
        if (typeof value !== 'number' || isNaN(value)) {
            return false;
        }

        // Validate specific property ranges
        switch (propertyPath) {
            case 'restitution':
                // Restitution should be between 0 and 1
                return value >= 0 && value <= 1;
            case 'friction':
            case 'rollingFriction':
            case 'spinningFriction':
                // Friction values should be non-negative
                return value >= 0;
            default:
                return true;
        }
    }
}