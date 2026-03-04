import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription, PropertySetSpec, PropertySetResult } from "./interface";
import { BaseAssetInterpreter } from "./base-interpreter";
import { decodeUuid, encodeUuid } from "../../uuid-codec.js";
import packageJSON from '../../../../package.json';

export class MaterialInterpreter extends BaseAssetInterpreter {

    get importerType() {
        return 'material';
    }

    async getProperties(assetInfo: AssetInfo, includeTooltips: boolean = false, useAdvancedInspection: boolean = false): Promise<AssetPropertiesDescription> {
        try {
            // Get material data from scene
            const materialData = await Editor.Message.request('scene', 'query-material', assetInfo.uuid);
            
            const description: AssetPropertiesDescription = {
                uuid: assetInfo.uuid,
                importer: assetInfo.importer,
                properties: {},
                arrays: {}
            };

            if (materialData) {
                // Extract effect name and UUID
                if (materialData.effect) {
                    const effectProperty: any = {
                        type: 'String',
                        value: materialData.effect,
                        tooltip: 'The effect used by this material'
                    };

                    // Get all available effects to find UUID and create options
                    try {
                        const effectMap = await Editor.Message.request('scene', 'query-all-effects');
                        const effects = Object.values(effectMap).filter((effect: any) => !effect.hideInEditor);
                        
                        // Find current effect UUID
                        const currentEffect = effects.find((effect: any) => effect.name === materialData.effect);
                        if (currentEffect) {
                            effectProperty.uuid = (currentEffect as any).uuid;
                            effectProperty.tooltip += ` (UUID: ${(currentEffect as any).uuid})`;
                        }

                        // Add all available effects as options
                        if (effects.length > 0) {
                            effectProperty.options = effects.map((effect: any) => ({
                                label: effect.name,
                                value: effect.name,
                                uuid: effect.uuid
                            }));
                        }
                    } catch (error) {
                        // If we can't get effects, just use the basic property
                        console.warn('Could not fetch effects for material interpreter:', error);
                    }

                    description.properties!['effect'] = effectProperty;
                }

                // Extract technique index with all possible variants
                if (materialData.technique !== undefined) {
                    const techniqueProperty: any = {
                        type: 'Integer',
                        value: materialData.technique,
                        tooltip: 'The technique index used by this material'
                    };

                    // Add all possible technique variants from data array
                    if (materialData.data && Array.isArray(materialData.data)) {
                        const techniqueOptions: string[] = [];
                        for (let i = 0; i < materialData.data.length; i++) {
                            const technique = materialData.data[i];
                            const techniqueName = technique?.name || `Technique ${i}`;
                            techniqueOptions.push(`${i} - ${techniqueName}`);
                        }
                        if (techniqueOptions.length > 0) {
                            techniqueProperty.options = techniqueOptions;
                        }
                    }

                    description.properties!['technique'] = techniqueProperty;
                }

                // Extract material passes data for the currently selected technique only
                if (materialData.data && Array.isArray(materialData.data)) {
                    const currentTechniqueIndex = materialData.technique || 0;
                    const technique = materialData.data[currentTechniqueIndex];
                    
                    if (technique && technique.passes) {
                        for (let j = 0; j < technique.passes.length; j++) {
                            const pass = technique.passes[j];
                            if (pass) {
                                // Extract props using name field (without data.0 prefix)
                                if (pass.props && Array.isArray(pass.props) && pass.props.length > 0) {
                                    this.extractMaterialProperties(pass.props, description, `passes.${j}.props`, includeTooltips);
                                }
                                // Extract defines using name field (without data.0 prefix)
                                if (pass.defines && Array.isArray(pass.defines) && pass.defines.length > 0) {
                                    this.extractMaterialProperties(pass.defines, description, `passes.${j}.defines`, includeTooltips);
                                }
                            }
                        }
                    }
                }

                // Also extract from meta userData if available
                const meta = await Editor.Message.request('asset-db', 'query-asset-meta', assetInfo.uuid);
                if (meta && meta.userData) {
                    this.extractPropertiesFromUserData(meta.userData, description, '', includeTooltips);
                }
            }

            // Apply filtering when NOT using advanced inspection
            if (!useAdvancedInspection) {
                this.applyBasicInspectionFilter(description);
            }

            return description;
        } catch (error) {
            return { 
                uuid: assetInfo.uuid, 
                importer: assetInfo.importer,
                error: `Error getting material properties: ${error instanceof Error ? error.message : String(error)}` 
            };
        }
    }

    async setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]> {
        const results: PropertySetResult[] = [];
        
        try {
            const materialData = await Editor.Message.request('scene', 'query-material', assetInfo.uuid);
            if (!materialData) {
                return properties.map(prop => ({
                    propertyPath: prop.propertyPath,
                    success: false,
                    error: 'Material data not found'
                }));
            }

            for (const prop of properties) {
                try {
                    const success = await this.setMaterialProperty(materialData, prop);
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

            // Apply the material changes
            if (results.some(r => r.success)) {
                await Editor.Message.request('scene', 'apply-material', assetInfo.uuid, materialData);
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



    private async setMaterialProperty(materialData: any, prop: PropertySetSpec): Promise<boolean> {
        // Handle top-level properties with validation
        if (prop.propertyPath === 'effect') {
            return await this.setMaterialEffect(materialData, prop);
        } else if (prop.propertyPath === 'technique') {
            const technique = parseInt(String(prop.propertyValue), 10);
            if (isNaN(technique) || technique < 0) {
                throw new Error(`Invalid technique index: ${prop.propertyValue}`);
            }
            materialData.technique = technique;
            return true;
        }

        // Handle nested properties in passes (props/defines)
        const pathParts = prop.propertyPath.split('.');
        
        // Validate property path structure
        if (!this.isValidMaterialPropertyPath(pathParts)) {
            throw new Error(`Invalid property path: ${prop.propertyPath}. Valid patterns: effect, technique, passes.{number}.{props|defines}.{propertyName}`);
        }
        
        // Check if this is a material pass property (contains props or defines)
        if (pathParts.includes('props') || pathParts.includes('defines')) {
            return await this.setMaterialPassProperty(materialData, pathParts, prop);
        }

        // Reject any other property patterns
        throw new Error(`Unsupported property path: ${prop.propertyPath}`);
    }

    /**
     * Validate material property path structure
     */
    private isValidMaterialPropertyPath(pathParts: string[]): boolean {
        if (pathParts.length < 4) return false;
        
        // Valid patterns: passes.{number}.{props|defines}.{propertyName}
        return pathParts[0] === 'passes' && 
               !isNaN(parseInt(pathParts[1], 10)) &&
               (pathParts[2] === 'props' || pathParts[2] === 'defines') &&
               pathParts[3].length > 0;
    }

    /**
     * Set material effect with validation
     */
    private async setMaterialEffect(materialData: any, prop: PropertySetSpec): Promise<boolean> {
        const effectValue = String(prop.propertyValue);
        
        try {
            const effectMap = await Editor.Message.request('scene', 'query-all-effects');
            const effects = Object.values(effectMap).filter((effect: any) => !effect.hideInEditor);
            
            // Validate effect exists
            const effectExists = effects.some((effect: any) => 
                effect.name === effectValue || 
                effect.uuid === effectValue ||
                effect.assetPath === effectValue
            );
            
            if (!effectExists) {
                const availableEffects = effects.map((e: any) => e.name).slice(0, 5).join(', ');
                throw new Error(`Effect not found: ${effectValue}. Available effects: ${availableEffects}...`);
            }
            
            // Find the actual effect name to use
            const targetEffect = effects.find((effect: any) => 
                effect.name === effectValue || 
                effect.uuid === effectValue ||
                effect.assetPath === effectValue
            );
            
            materialData.effect = (targetEffect as any).name;
            return true;
            
        } catch (error) {
            throw new Error(`Failed to set effect: ${error instanceof Error ? error.message : String(error)}`);
        }
    }

    /**
     * Set properties in material passes (props/defines arrays) using name-based lookup
     */
    private async setMaterialPassProperty(materialData: any, pathParts: string[], prop: PropertySetSpec): Promise<boolean> {
        // Expected path format: passes.{passIndex}.{props|defines}.{propertyName}
        if (pathParts.length < 4) {
            return false;
        }

        const passIndex = parseInt(pathParts[1], 10);
        const arrayType = pathParts[2]; // 'props' or 'defines'
        const propertyName = pathParts[3];

        // Use the currently selected technique
        const currentTechniqueIndex = materialData.technique || 0;

        // Ensure the structure exists
        if (!materialData.data) materialData.data = [];
        if (!materialData.data[currentTechniqueIndex]) materialData.data[currentTechniqueIndex] = { passes: [] };
        if (!materialData.data[currentTechniqueIndex].passes) materialData.data[currentTechniqueIndex].passes = [];
        if (!materialData.data[currentTechniqueIndex].passes[passIndex]) {
            materialData.data[currentTechniqueIndex].passes[passIndex] = { props: [], defines: [] };
        }

        const pass = materialData.data[currentTechniqueIndex].passes[passIndex];
        if (!pass[arrayType]) pass[arrayType] = [];

        const propertiesArray = pass[arrayType];

        // Find the property by name
        let targetProperty = propertiesArray.find((p: any) => p && p.name === propertyName);

        if (!targetProperty) {
            // Create new property if it doesn't exist
            targetProperty = {
                name: propertyName,
                type: prop.propertyType || this.inferPropertyType(prop.propertyValue),
                value: await this.convertPropertyValueAsync(prop.propertyValue, prop.propertyType)
            };
            propertiesArray.push(targetProperty);
        } else {
            // Update existing property
            targetProperty.value = await this.convertPropertyValueAsync(prop.propertyValue, prop.propertyType);
            if (prop.propertyType) {
                targetProperty.type = prop.propertyType;
            }
        }

        // Handle automatic defines setting for props
        if (arrayType === 'props') {
            // Check if the property has required defines
            const propertyDefines = targetProperty.defines;
            if (propertyDefines && Array.isArray(propertyDefines)) {
                this.setRequiredDefines(pass, propertyDefines);
            }
        }

        return true;
    }

    /**
     * Set required defines to true for a property
     */
    private setRequiredDefines(pass: any, requiredDefines: string[]): void {
        if (!pass.defines || !Array.isArray(pass.defines)) {
            pass.defines = [];
        }

        for (const defineName of requiredDefines) {
            // Find the define by name
            let targetDefine = pass.defines.find((d: any) => d && d.name === defineName);

            if (!targetDefine) {
                // Create new define if it doesn't exist
                targetDefine = {
                    name: defineName,
                    type: 'Boolean',
                    value: true
                };
                pass.defines.push(targetDefine);
            } else {
                // Update existing define to true if it's boolean
                if (targetDefine.type === 'Boolean' || typeof targetDefine.value === 'boolean') {
                    targetDefine.value = true;
                }
            }
        }
    }

    /**
     * Extract properties from material props/defines arrays using the "name" field as property path
     */
    private extractMaterialProperties(
        propertiesArray: any[], 
        description: AssetPropertiesDescription, 
        pathPrefix: string,
        includeTooltips: boolean = false
    ): void {
        if (!Array.isArray(propertiesArray)) {
            return;
        }

        for (const propertyData of propertiesArray) {
            if (!propertyData || typeof propertyData !== 'object') {
                continue;
            }

            // Use the "name" field as the property identifier
            const propertyName = propertyData.name;
            if (!propertyName) {
                continue;
            }

            const currentPath = pathPrefix ? `${pathPrefix}.${propertyName}` : propertyName;

            // Create property info based on the structure
            const propertyInfo: any = {
                type: propertyData.type || this.inferPropertyType(propertyData.value),
                value: propertyData.value
            };

            // Add tooltip if available and requested
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

            // Add options array if available
            if (propertyData.options && Array.isArray(propertyData.options)) {
                propertyInfo.options = propertyData.options;
            }

            // Handle arrays
            if (propertyData.isArray) {
                description.arrays![currentPath] = {
                    type: propertyInfo.type,
                    tooltip: propertyInfo.tooltip
                };
            }

            // Add the property to the description
            description.properties![currentPath] = propertyInfo;
        }
    }

    /**
     * Apply basic inspection filtering to show only commonly used material properties and exclude defines
     */
    private applyBasicInspectionFilter(description: AssetPropertiesDescription): void {
        const allowedProperties = [
            'tilingOffset',
            'mainColor', 
            'roughness',
            'metallic',
            'specularIntensity',
            'mainTexture'
        ];

        if (description.properties) {
            const filteredProperties: { [path: string]: any } = {};
            
            // Filter properties to only include allowed ones and exclude defines
            for (const [path, propertyInfo] of Object.entries(description.properties)) {
                // Skip defines when not using advanced inspection
                if (path.includes('.defines.')) {
                    continue;
                }
                
                // Check if the property path ends with any of the allowed property names
                const propertyName = path.split('.').pop();
                if (propertyName && allowedProperties.includes(propertyName)) {
                    filteredProperties[path] = propertyInfo;
                }
            }
            
            description.properties = filteredProperties;
        }

        if (description.arrays) {
            const filteredArrays: { [path: string]: any } = {};
            
            // Filter arrays to only include allowed ones and exclude defines
            for (const [path, arrayInfo] of Object.entries(description.arrays)) {
                // Skip defines when not using advanced inspection
                if (path.includes('.defines.')) {
                    continue;
                }
                
                // Check if the array path ends with any of the allowed property names
                const propertyName = path.split('.').pop();
                if (propertyName && allowedProperties.includes(propertyName)) {
                    filteredArrays[path] = arrayInfo;
                }
            }
            
            description.arrays = filteredArrays;
        }
    }

    /**
     * Convert property value with proper asset type checking and UUID formatting
     */
    protected async convertPropertyValueAsync(value: any, type: string): Promise<any> {
        try {
            // Check if this is an asset type
            const isAsset: boolean = await Editor.Message.request('scene', 'execute-scene-script',
                { name: packageJSON.name, method: 'isCorrectAssetType', args: [type] });
            
            if (isAsset) {
                return await this.preprocessAssetProperty(value, type);
            }

            // For non-asset types, use the base implementation
            return this.convertPropertyValue(value, type);
        } catch (error) {
            console.warn('Asset type checking failed, using base conversion:', error);
            return this.convertPropertyValue(value, type);
        }
    }

    /**
     * Preprocess asset property values to ensure proper UUID formatting and validation
     */
    private async preprocessAssetProperty(rawProperty: any, propertyType: string): Promise<any> {
        try {
            let result: any = {};

            if (typeof rawProperty === 'string') {
                if (rawProperty.startsWith("db://")) {
                    const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', rawProperty);
                    if (!assetInfo) {
                        throw new Error(`Can't find asset with URL: ${rawProperty}`);
                    }
                    result = { uuid: assetInfo.uuid };
                } else {
                    result = { uuid: decodeUuid(rawProperty) };
                }
            } else if (rawProperty && typeof rawProperty === 'object' && rawProperty.hasOwnProperty('uuid')) {
                rawProperty.uuid = decodeUuid(rawProperty.uuid);
                result = rawProperty;
            } else {
                result = rawProperty;
            }

            // Validate referenced asset exists and is of correct type
            if (result.uuid) {
                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', result.uuid);
                if (!assetInfo) {
                    throw new Error(`Asset with UUID "${result.uuid}" not found`);
                }
                
                // For texture assets, we need to check the actual asset type, not just the property type
                // because cc.TextureBase can accept various texture types
                if (propertyType === 'cc.TextureBase' || propertyType === 'cc.Texture2D') {
                    // Accept any texture-related asset type
                    const validTextureTypes = ['cc.Texture2D', 'cc.TextureCube', 'cc.RenderTexture'];
                    if (!validTextureTypes.includes(assetInfo.type)) {
                        console.warn(`Asset type "${assetInfo.type}" may not be compatible with property type "${propertyType}"`);
                    }
                } else if (assetInfo.type !== propertyType) {
                    throw new Error(`Asset with UUID "${result.uuid}" has type "${assetInfo.type}" but expected "${propertyType}"`);
                }
            }

            return result;
        } catch (error) {
            console.warn('Asset preprocessing failed:', error);
            return rawProperty;
        }
    }
}