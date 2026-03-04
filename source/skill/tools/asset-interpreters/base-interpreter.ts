import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription, IAssetInterpreter, PropertySetSpec, PropertySetResult } from "./interface";

export abstract class BaseAssetInterpreter implements IAssetInterpreter {
    
    abstract get importerType(): string;
    
    async getProperties(assetInfo: AssetInfo, includeTooltips: boolean = false, useAdvancedInspection: boolean = false): Promise<AssetPropertiesDescription> {
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

            // Extract properties from userData
            if (meta.userData) {
                this.extractPropertiesFromUserData(meta.userData, description, '', includeTooltips);
            }

            // Extract properties from subMetas if they exist
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
                error: `Error getting properties: ${error instanceof Error ? error.message : String(error)}` 
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

    protected extractPropertiesFromUserData(
        userData: any, 
        description: AssetPropertiesDescription, 
        pathPrefix: string,
        includeTooltips: boolean = false
    ): void {
        if (!userData || typeof userData !== 'object') {
            return;
        }

        // Use the same recursive extraction logic as getComponentInfo
        const extractPropertiesRecursive = (obj: any, basePath: string = ''): 
            { properties: { [path: string]: any }, arrays: { [path: string]: any } } => {
            const properties: { [path: string]: any } = {};
            const arrays: { [path: string]: any } = {};

            Object.keys(obj).forEach(key => {
                if (key.startsWith('_')) return; // Skip private properties

                const currentPath = basePath ? `${basePath}.${key}` : key;
                const propertyData = obj[key];

                if (propertyData && typeof propertyData === 'object' && propertyData.hasOwnProperty('value')) {
                    // This is a property with metadata (following Cocos Creator pattern)
                    const propertyInfo: any = {
                        type: propertyData.type || 'Unknown',
                        value: propertyData.value
                    };

                    // Add tooltip if available
                    if (propertyData.tooltip && includeTooltips) {
                        try {
                            propertyInfo.tooltip = Editor.I18n.t(propertyData.tooltip.replace('i18n:', ''));
                        } catch (i18nError) {
                            propertyInfo.tooltip = propertyData.tooltip;
                        }
                    }

                    // Add enum options if this is an enum type
                    if (propertyData.type === 'Enum' && propertyData.enumList) {
                        propertyInfo.enumList = propertyData.enumList;
                    }

                    if (propertyData.isArray) {
                        arrays[currentPath] = {
                            type: propertyInfo.type,
                            tooltip: propertyInfo.tooltip
                        }
                    }

                    const simpleTypes = ['String', 'Number', 'Boolean', 'cc.ValueType', 'cc.Object'];

                    // Handle nested objects (following Cocos Creator logic)
                    if (propertyData.value && 
                        ((typeof propertyData.value === 'object' && 
                            !simpleTypes.includes(propertyData.type) && 
                            !(propertyData.extends && propertyData.extends.some((ext: string) => simpleTypes.includes(ext)))) 
                        || Array.isArray(propertyData.value))) {
                        const extractionResult = extractPropertiesRecursive(propertyData.value, currentPath);
                        Object.assign(properties, extractionResult.properties);
                        Object.assign(arrays, extractionResult.arrays);
                    } else {
                        properties[currentPath] = propertyInfo;
                    }
                } else if (propertyData !== null && typeof propertyData === 'object' && !Array.isArray(propertyData)) {
                    // Nested object without metadata - recurse
                    const extractionResult = extractPropertiesRecursive(propertyData, currentPath);
                    Object.assign(properties, extractionResult.properties);
                    Object.assign(arrays, extractionResult.arrays);
                } else {
                    // Simple value - create property info
                    properties[currentPath] = {
                        type: this.inferPropertyType(propertyData),
                        value: propertyData
                    };
                }
            });

            return { properties, arrays };
        };

        const extractionResult = extractPropertiesRecursive(userData, pathPrefix);
        Object.assign(description.properties!, extractionResult.properties);
        Object.assign(description.arrays!, extractionResult.arrays);
    }

    protected inferPropertyType(value: any): string {
        if (value === null || value === undefined) {
            return 'Unknown';
        }
        
        if (typeof value === 'boolean') {
            return 'Boolean';
        }
        
        if (typeof value === 'number') {
            // Use Cocos Creator's Number type for consistency
            return 'Number';
        }
        
        if (typeof value === 'string') {
            return 'String';
        }
        
        if (Array.isArray(value)) {
            return 'Array';
        }
        
        if (typeof value === 'object') {
            // Check if it's a Cocos Creator specific object
            if (value.hasOwnProperty('__type__')) {
                return value.__type__;
            }
            return 'Object';
        }
        
        return 'Unknown';
    }

    protected getSubAssetName(assetInfo: AssetInfo, subUuid: string): string {
        // Try to get sub-asset name from the asset info
        if (assetInfo.subAssets && assetInfo.subAssets[subUuid]) {
            return assetInfo.subAssets[subUuid].name || subUuid;
        }
        return subUuid;
    }

    protected async setProperty(meta: any, prop: PropertySetSpec): Promise<boolean> {
        // Define valid property patterns for meta properties
        const validMetaPatterns = [
            /^userData\./,           // userData properties
            /^importer$/,            // importer type
            /^importerVersion$/,     // importer version
            /^subMetas\./,          // sub-meta properties
            /^platformSettings\./,   // platform-specific settings
            /^sourceUuid$/,         // source asset UUID
            /^isGroup$/,            // group flag
            /^folder$/              // folder flag
        ];
        
        // Validate property path
        const isValidPath = validMetaPatterns.some(pattern => 
            pattern.test(prop.propertyPath)
        );
        
        if (!isValidPath) {
            throw new Error(`Invalid property path for asset meta: ${prop.propertyPath}. Valid patterns: userData.*, importer, importerVersion, subMetas.*, platformSettings.*`);
        }
        
        const pathParts = prop.propertyPath.split('.');
        let current = meta;
        
        // Navigate to the parent object (with validation)
        for (let i = 0; i < pathParts.length - 1; i++) {
            const part = pathParts[i];
            if (!current[part]) {
                // Only create valid intermediate objects
                if (part === 'userData' || part === 'subMetas' || part === 'platformSettings') {
                    current[part] = {};
                } else {
                    throw new Error(`Cannot create intermediate object: ${part} in path ${prop.propertyPath}`);
                }
            }
            current = current[part];
        }
        
        // Set the final property
        const finalKey = pathParts[pathParts.length - 1];
        current[finalKey] = this.convertPropertyValue(prop.propertyValue, prop.propertyType);
        
        return true;
    }

    protected convertPropertyValue(value: any, type: string): any {
        // Handle Cocos Creator specific types
        switch (type) {
            case 'Boolean':
                return Boolean(value);
            case 'Number':
                return parseFloat(String(value));
            case 'String':
                return String(value);
            case 'Integer':
                return parseInt(String(value), 10);
            case 'Float':
                return parseFloat(String(value));
            case 'Enum':
                // For enums, keep the original value (should be a valid enum option)
                return value;
            case 'cc.ValueType':
            case 'cc.Object':
                // For complex Cocos Creator types, preserve the structure
                return value;
            default:
                // For unknown types, try to infer from the value
                if (typeof value === 'boolean') {
                    return Boolean(value);
                } else if (typeof value === 'number') {
                    return Number(value);
                } else if (typeof value === 'string') {
                    return String(value);
                } else {
                    return value;
                }
        }
    }
}