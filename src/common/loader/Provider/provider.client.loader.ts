import { Injectable } from "../../decorator/Injectable";
import { ProviderLoader } from "./provider.loader";

@Injectable()
export class ClientProviderLoader extends ProviderLoader {
	public load(provider: any) {
		console.log("[DEBUG] ClientProviderLoader.load called with:", provider);
		super.load(provider);
	}

	public unload() {
		console.log("[DEBUG] ClientProviderLoader.unload called");
		super.unload();
	}
}
