import { BaseAssetInterpreter } from "./base-interpreter";

export class TextureInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'texture';
    }
}