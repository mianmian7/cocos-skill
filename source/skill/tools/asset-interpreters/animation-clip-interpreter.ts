import { BaseAssetInterpreter } from "./base-interpreter";

export class AnimationClipInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'animation-clip';
    }
}