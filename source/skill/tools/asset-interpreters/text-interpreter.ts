import { BaseAssetInterpreter } from "./base-interpreter";

export class TextInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'text';
    }
}