import { BaseAssetInterpreter } from "./base-interpreter";

export class AudioClipInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'audio-clip';
    }
}