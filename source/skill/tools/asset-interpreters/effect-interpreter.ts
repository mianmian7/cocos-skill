import { BaseAssetInterpreter } from "./base-interpreter";

export class EffectInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'effect';
    }
}