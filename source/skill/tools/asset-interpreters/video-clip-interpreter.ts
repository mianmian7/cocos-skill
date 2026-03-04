import { BaseAssetInterpreter } from "./base-interpreter";

export class VideoClipInterpreter extends BaseAssetInterpreter {
    get importerType() {
        return 'video-clip';
    }
}