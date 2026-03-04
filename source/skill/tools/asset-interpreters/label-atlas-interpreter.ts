import { BaseAssetInterpreter } from "./base-interpreter";

export class LabelAtlasInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'label-atlas';
    }
}