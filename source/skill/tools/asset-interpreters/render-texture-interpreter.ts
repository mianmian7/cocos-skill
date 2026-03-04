import { BaseAssetInterpreter } from "./base-interpreter";

export class RenderTextureInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'render-texture';
    }
}