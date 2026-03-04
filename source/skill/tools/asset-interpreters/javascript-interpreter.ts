import { BaseAssetInterpreter } from "./base-interpreter";

export class JavascriptInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'javascript';
    }
}