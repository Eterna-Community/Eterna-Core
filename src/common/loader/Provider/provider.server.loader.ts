import { Injectable } from "../../decorator/Injectable";
import { ProviderLoader } from "./provider.loader";

/**
 * In this class, we only load Server specific providers
 */
@Injectable()
export class ServerProviderLoader extends ProviderLoader {
	public load(provider: any) {
		console.log("[DEBUG] ServerProviderLoader.load called with:", provider);
		super.load(provider);
	}

	public unload() {
		console.log("[DEBUG] ServerProviderLoader.unload called");
		super.unload();
	}
}
