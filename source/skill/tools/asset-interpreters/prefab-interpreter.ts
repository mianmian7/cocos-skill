import { BaseAssetInterpreter } from "./base-interpreter";

export class PrefabInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'prefab';
    }
}