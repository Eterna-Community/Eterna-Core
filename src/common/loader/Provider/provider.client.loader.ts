import { Injectable } from "../../decorator/Injectable";
import { ProviderLoader } from "./provider.loader";

@Injectable(ProviderLoader)
export class ClientProviderLoader extends ProviderLoader {
	public load(provider: any) {
		super.load(provider);
	}

	public unload() {
		super.unload();
	}
}
