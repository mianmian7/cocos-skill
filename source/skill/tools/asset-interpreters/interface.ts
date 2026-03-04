import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";

export type AssetPropertiesDescription = {
    uuid?: string,
    importer?: string,
    properties?: {[path: string]: { type: string, value?: any, tooltip?: string, enumList?: string[] }},
    arrays?: {[path: string]: { type: string, tooltip?: string }},
    error?: string,
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

export interface IAssetInterpreter {
    
    get importerType(): string;
    
	getProperties(assetInfo: AssetInfo, includeTooltips?: boolean, useAdvancedInspection?: boolean): Promise<AssetPropertiesDescription>;
    setProperties(assetInfo: AssetInfo, properties: PropertySetSpec[]): Promise<PropertySetResult[]>;
}