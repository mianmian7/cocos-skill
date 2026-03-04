import { BaseAssetInterpreter } from "./base-interpreter";

export class UnknownInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return '*';
    }
}