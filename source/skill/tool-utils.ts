import path from "path";
import { decodeUuid } from "./uuid-codec.js";
import packageJSON from '../../package.json';

export type ComponentDescription = {
    uuid?: string,
    type?: string,
    properties?: {[path: string]: { type: string, value?: any, tooltip?: string, enumList?: string[] }},
    arrays?: {[path: string]: { type: string, tooltip?: string }},
    error?: string,
}

export async function getComponentInfo(component: string | object, includeProperties: boolean, includeTooltips: boolean): Promise<ComponentDescription> {
    // Build component description
    const componentDescription: ComponentDescription = { };
    
    try {
        let componentInfo: any = {};

        if (typeof component == 'string') {
            const decodedUuid = decodeUuid(component);
            componentInfo = await Editor.Message.request('scene', 'query-component', decodedUuid) as any;
            if (!componentInfo) {
                throw new Error(`Component with UUID "${decodedUuid}" not found`);
            }
            componentDescription.uuid = decodedUuid;
        } else {
            componentInfo = component;
            componentDescription.uuid = componentInfo.value?.uuid?.value;
        }
        
        if (!componentInfo) {
            throw new Error("Component not found or invalid");
        } else {
            componentDescription.type = componentInfo.type;

            if (includeProperties) {
                // Extract component properties with enhanced information
                const extractPropertiesRecursive = (obj: any, basePath: string = ''): 
                    { properties: { [path: string]: any }, arrays: { [path: string]: any } } => {
                    const properties: { [path: string]: any } = {};
                    const arrays: { [path: string]: any } = {};

                    Object.keys(obj).forEach(key => {
                    if (key.startsWith('_')) return; // Skip private properties

                    const currentPath = basePath ? `${basePath}.${key}` : key;
                    const propertyData = obj[key];

                    if (propertyData && typeof propertyData === 'object' && propertyData.hasOwnProperty('value')) {
                        // This is a property with metadata
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

                        // Handle nested objects
                        const propertyType = propertyData.type || 'Unknown';
                        if (propertyData.value && 
                            ((typeof propertyData.value === 'object' && 
                                !simpleTypes.includes(propertyType) && 
                                !(propertyData.extends && Array.isArray(propertyData.extends) && propertyData.extends.some((ext: string) => simpleTypes.includes(ext)))) 
                            || Array.isArray(propertyData.value))) {
                            const extractionResult = extractPropertiesRecursive(propertyData.value, currentPath);
                            Object.assign(properties, extractionResult.properties);
                            Object.assign(arrays, extractionResult.arrays);
                        } else {
                            properties[currentPath] = propertyInfo;
                        }
                    }
                    });

                    return { properties, arrays };
                };

                const extractionResult = extractPropertiesRecursive(componentInfo.value || componentInfo);
                componentDescription.properties = extractionResult.properties;
                componentDescription.arrays = extractionResult.arrays;
            }
        }
    } catch (queryError) {
        componentDescription.error = `Error querying component: ${queryError instanceof Error ? queryError.message : String(queryError)}`;
    }

    return componentDescription;
}

export async function tryToAddComponent(nodeUuid: string, componentType: string, includeProperties: boolean): Promise<ComponentDescription> {
    try {
        await Editor.Message.request('scene', 'create-component', {
            uuid: nodeUuid,
            component: componentType
        } as any);

        // Get updated node info to find the new component
        const updatedNodeInfo = await Editor.Message.request('scene', 'query-node', nodeUuid);
        if (updatedNodeInfo && updatedNodeInfo.__comps__ && updatedNodeInfo.__comps__.length > 0) {
            const lastAddedComponent = updatedNodeInfo.__comps__[updatedNodeInfo.__comps__.length - 1] as any;
            return await getComponentInfo(lastAddedComponent, includeProperties, false);
        } else {
            return { uuid: '', error: `Tried to add '${componentType}' but could not retrieve component info` };
        }

    } catch (componentError) {
        return { uuid: '', error: `Failed to add component '${componentType}' - ${componentError instanceof Error ? componentError.message : String(componentError)}` };
    }
}

export interface PropertySetSpec {
    propertyPath: string;
    propertyType: string;
    propertyValue: any;
}

export interface PropertySetResult {
    propertyPath: string;
    success: boolean;
    error?: string;
}

export async function setProperties(
    targetNodeUuid: string,
    pathPrefix: string,
    properties: PropertySetSpec[]
): Promise<PropertySetResult[]> {
    const results: PropertySetResult[] = [];

    for (const prop of properties) {
        try {
            // Preprocess property value for components, assets, and nodes
            const isComponent: boolean = await Editor.Message.request('scene', 'execute-scene-script', 
                { name: packageJSON.name, method: 'isCorrectComponentType', args: [prop.propertyType] });
            const isAsset: boolean = await Editor.Message.request('scene', 'execute-scene-script',
                { name: packageJSON.name, method: 'isCorrectAssetType', args: [prop.propertyType] });
            const isNode: boolean = prop.propertyType === "cc.Node";

            const preprocessProperty = async (rawProperty: any): Promise<any> => {
                try {
                    let result: any = {};

                    if (isComponent || isAsset || isNode) {
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

                        // Validate referenced objects exist and are of correct type
                        if (result.uuid) {
                            if (isComponent) {
                                const component = await Editor.Message.request('scene', 'query-component', result.uuid);
                                if (!component || component.type !== prop.propertyType) {
                                    throw new Error(`Component with UUID "${result.uuid}" and type "${prop.propertyType}" not found`);
                                }
                            }
                            if (isAsset) {
                                const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', result.uuid);
                                if (!assetInfo || assetInfo.type !== prop.propertyType) {
                                    throw new Error(`Asset with UUID "${result.uuid}" and type "${prop.propertyType}" not found`);
                                }
                            }
                            if (isNode) {
                                const node = await Editor.Message.request('scene', 'query-node', result.uuid);
                                if (!node) {
                                    throw new Error(`Node with UUID "${result.uuid}" not found`);
                                }
                            }
                        }

                        return result;
                    }

                    return rawProperty;
                } catch (typeCheckError) {
                    // Continue with original value if type checking fails
                    console.warn('Type checking failed:', typeCheckError);
                    return rawProperty;
                }
            };

            let processedValue: any;

            // Handle string that might be JSON
            let propertyValue = prop.propertyValue;
            if (typeof propertyValue === 'string') {
                try {
                    const parsedFromJson = JSON.parse(propertyValue);
                    if (parsedFromJson && Array.isArray(parsedFromJson)) {
                        propertyValue = parsedFromJson;
                    }
                } catch (error) {
                    // Keep original string value
                }
            }

            // Handle array properties
            const fullPath = pathPrefix ? `${pathPrefix}.${prop.propertyPath}` : prop.propertyPath;
            const isArrayProperty = Array.isArray(propertyValue);

            if (isArrayProperty) {
                // For array properties, we need to set elements individually
                // This is more reliable than setting the entire array at once
                // because Cocos Creator's set-property API has specific requirements for arrays

                // First, try to get the current property info to understand the array structure
                let arraySetSuccess = false;
                let arraySetError: string | undefined;

                // Strategy 1: Try setting elements one by one (most reliable)
                try {
                    // Process each array element
                    for (let i = 0; i < propertyValue.length; i++) {
                        const elementValue = propertyValue[i];
                        const processedElementValue = await preprocessProperty(elementValue);
                        const elementPath = `${fullPath}.${i}`;

                        await Editor.Message.request('scene', 'set-property', {
                            uuid: targetNodeUuid,
                            path: elementPath,
                            dump: {
                                value: processedElementValue,
                                type: prop.propertyType
                            }
                        } as any);
                    }
                    arraySetSuccess = true;
                } catch (elementSetError) {
                    arraySetError = `Element-by-element setting failed: ${elementSetError instanceof Error ? elementSetError.message : String(elementSetError)}`;

                    // Strategy 2: Try setting the entire array with isArray flag
                    try {
                        processedValue = [];
                        for (let value of propertyValue) {
                            const processedArrayValue = await preprocessProperty(value);
                            // For array elements, wrap in IProperty-like structure
                            processedValue.push({
                                value: processedArrayValue,
                                type: prop.propertyType
                            });
                        }

                        await Editor.Message.request('scene', 'set-property', {
                            uuid: targetNodeUuid,
                            path: fullPath,
                            dump: {
                                value: processedValue,
                                type: prop.propertyType,
                                isArray: true
                            }
                        } as any);
                        arraySetSuccess = true;
                        arraySetError = undefined;
                    } catch (wholeArrayError) {
                        // Strategy 3: Try with raw values (no wrapping)
                        try {
                            processedValue = [];
                            for (let value of propertyValue) {
                                const processedArrayValue = await preprocessProperty(value);
                                processedValue.push(processedArrayValue);
                            }

                            await Editor.Message.request('scene', 'set-property', {
                                uuid: targetNodeUuid,
                                path: fullPath,
                                dump: {
                                    value: processedValue,
                                    type: prop.propertyType,
                                    isArray: true
                                }
                            } as any);
                            arraySetSuccess = true;
                            arraySetError = undefined;
                        } catch (rawArrayError) {
                            arraySetError = `All array setting strategies failed. Last error: ${rawArrayError instanceof Error ? rawArrayError.message : String(rawArrayError)}`;
                        }
                    }
                }

                if (arraySetSuccess) {
                    results.push({ propertyPath: prop.propertyPath, success: true });
                } else {
                    results.push({
                        propertyPath: prop.propertyPath,
                        success: false,
                        error: arraySetError || 'Unknown array setting error'
                    });
                }
            } else {
                // Non-array property
                processedValue = await preprocessProperty(propertyValue);

                await Editor.Message.request('scene', 'set-property', {
                    uuid: targetNodeUuid,
                    path: fullPath,
                    dump: {
                        value: processedValue,
                        type: prop.propertyType
                    }
                } as any);

                results.push({ propertyPath: prop.propertyPath, success: true });
            }

        } catch (error) {
            results.push({
                propertyPath: prop.propertyPath,
                success: false,
                error: error instanceof Error ? error.message : String(error)
            });
        }
    }

    return results;
}
