import { BaseAssetInterpreter } from "./base-interpreter";

export class TypescriptInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'typescript';
    }
}