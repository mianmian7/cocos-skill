import { AssetInfo } from "@cocos/creator-types/editor/packages/asset-db/@types/public";
import { AssetPropertiesDescription, IAssetInterpreter, PropertySetSpec, PropertySetResult } from "./interface";
import { MaterialInterpreter } from "./material-interpreter";
import { ImageInterpreter } from "./image-interpreter";
import { TextureInterpreter } from "./texture-interpreter";
import { PhysicsMaterialInterpreter } from "./physics-material-interpreter";
import { TextInterpreter } from "./text-interpreter";
import { FbxInterpreter } from "./fbx-interpreter";
import { AudioClipInterpreter } from "./audio-clip-interpreter";
import { EffectInterpreter } from "./effect-interpreter";
import { PrefabInterpreter } from "./prefab-interpreter";
import { SpriteFrameInterpreter } from "./sprite-frame-interpreter";
import { RenderTextureInterpreter } from "./render-texture-interpreter";
import { AnimationClipInterpreter } from "./animation-clip-interpreter";
import { LabelAtlasInterpreter } from "./label-atlas-interpreter";
import { ParticleInterpreter } from "./particle-interpreter";
import { VideoClipInterpreter } from "./video-clip-interpreter";
import { JavascriptInterpreter } from "./javascript-interpreter";
import { TypescriptInterpreter } from "./typescript-interpreter";
import { JsonInterpreter } from "./json-interpreter";
import { UnknownInterpreter } from "./unknown-interpreter";

export class AssetInterpreterManager {
    private static interpreters: Map<string, IAssetInterpreter> = new Map();
    
    static {
        // Register all interpreters
        this.registerInterpreter(new MaterialInterpreter());
        this.registerInterpreter(new ImageInterpreter());
        this.registerInterpreter(new TextureInterpreter());
        this.registerInterpreter(new PhysicsMaterialInterpreter());
        this.registerInterpreter(new TextInterpreter());
        this.registerInterpreter(new FbxInterpreter());
        this.registerInterpreter(new AudioClipInterpreter());
        this.registerInterpreter(new EffectInterpreter());
        this.registerInterpreter(new PrefabInterpreter());
        this.registerInterpreter(new SpriteFrameInterpreter());
        this.registerInterpreter(new RenderTextureInterpreter());
        this.registerInterpreter(new AnimationClipInterpreter());
        this.registerInterpreter(new LabelAtlasInterpreter());
        this.registerInterpreter(new ParticleInterpreter());
        this.registerInterpreter(new VideoClipInterpreter());
        this.registerInterpreter(new JavascriptInterpreter());
        this.registerInterpreter(new TypescriptInterpreter());
        this.registerInterpreter(new JsonInterpreter());
        this.registerInterpreter(new UnknownInterpreter());
    }
    
    private static registerInterpreter(interpreter: IAssetInterpreter): void {
        this.interpreters.set(interpreter.importerType, interpreter);
    }
    
    static getInterpreter(importerType: string): IAssetInterpreter {
        return this.interpreters.get(importerType) || this.interpreters.get('*')!;
    }
    
    static async getAssetProperties(assetInfo: AssetInfo, includeTooltips: boolean = false, useAdvancedInspection: boolean = false): Promise<AssetPropertiesDescription> {
        const interpreter = this.getInterpreter(assetInfo.importer);
        return await interpreter.getProperties(assetInfo, includeTooltips, useAdvancedInspection);
    }
    
    static async setAssetProperties(
        assetInfo: AssetInfo, 
        properties: PropertySetSpec[]
    ): Promise<PropertySetResult[]> {
        const interpreter = this.getInterpreter(assetInfo.importer);
        return await interpreter.setProperties(assetInfo, properties);
    }
}