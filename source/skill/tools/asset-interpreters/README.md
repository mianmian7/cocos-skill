# Asset Interpreters

This directory contains asset interpreters that handle property extraction and modification for different asset types in Cocos Creator.

## Overview

The asset interpreter system provides a unified way to:
- Extract properties from assets based on their importer type **using the exact same logic as component properties**
- Set properties on assets with proper validation and type conversion
- Handle sub-assets (like textures within images, materials within FBX files, etc.)
- **Full compatibility with Cocos Creator's property system** including simple types, extends checking, arrays, and i18n tooltips

## Architecture

### Core Components

- **`interface.ts`** - Defines the core interfaces and types
- **`base-interpreter.ts`** - Base class providing common functionality
- **`asset-interpreter-manager.ts`** - Central manager that routes requests to appropriate interpreters
- **Individual interpreters** - Specialized handlers for each asset type

### Asset Interpreters

Each interpreter corresponds to an asset importer type:

- **MaterialInterpreter** (`material`) - Handles material assets, extracts effect properties, technique settings, and pass parameters
- **ImageInterpreter** (`image`) - Handles image assets, extracts texture settings, sprite frame properties, and import options
- **PhysicsMaterialInterpreter** (`physics-material`) - Handles physics material properties
- **FbxInterpreter** (`fbx`) - Handles FBX model imports, animation settings, and sub-asset properties
- **ParticleInterpreter** (`particle`) - Handles particle system assets
- **TextInterpreter** (`text`) - Handles text-based assets
- **And more...** - Additional interpreters for other asset types

## Usage

### Getting Asset Properties

```typescript
const assetInfo = await Editor.Message.request('asset-db', 'query-asset-info', assetPath);
const properties = await AssetInterpreterManager.getAssetProperties(assetInfo);
```

### Setting Asset Properties

```typescript
const propertySpecs = [
    {
        propertyPath: 'flipVertical',
        propertyType: 'Boolean',
        propertyValue: true
    }
];
const results = await AssetInterpreterManager.setAssetProperties(assetInfo, propertySpecs);
```

## Property Structure

Properties follow **the exact same structure as component properties**:

- **Properties with metadata** - Objects with `value`, `type`, `tooltip`, `enumList`, `isArray`, `extends` properties
- **Simple types** - `['String', 'Number', 'Boolean', 'cc.ValueType', 'cc.Object']`
- **Nested objects** - Recursively extracted when not simple types and no matching `extends`
- **Array properties** - Detected via `isArray` flag
- **Sub-asset properties** - Properties of sub-assets (e.g., `texture.wrapModeS`)
- **Hierarchical paths** - Dot notation for nested properties (e.g., `fbx.animationBakeRate`)

## Property Types (Cocos Creator Compatible)

Supported property types matching Cocos Creator's system:
- `Boolean` - True/false values
- `Number` - Numeric values (integers and floats)
- `String` - Text values
- `Enum` - Enumerated values with `enumList` options
- `cc.ValueType` - Cocos Creator value types
- `cc.Object` - Cocos Creator object references
- `Array` - Collections identified by `isArray` flag
- **Custom types** - Any type defined in Cocos Creator's property system

## Adding New Interpreters

To add support for a new asset type:

1. Create a new interpreter class extending `BaseAssetInterpreter`
2. Implement the `importerType` getter
3. Override `getProperties()` and/or `setProperties()` if custom logic is needed
4. Register the interpreter in `AssetInterpreterManager`

Example:

```typescript
export class CustomInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'custom-asset-type';
    }
    
    // Custom implementation if needed
    async getProperties(assetInfo: AssetInfo): Promise<AssetPropertiesDescription> {
        // Custom property extraction logic
        return super.getProperties(assetInfo);
    }
}
```

## Integration with Tooling

The interpreters are used by the `operate_assets` tool for the `get-properties` and `set-properties` operations, providing a consistent interface for asset property management across different asset types.
