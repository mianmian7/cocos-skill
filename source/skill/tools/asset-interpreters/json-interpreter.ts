import { BaseAssetInterpreter } from "./base-interpreter";

export class JsonInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'json';
    }
}