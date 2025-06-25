import "reflect-metadata";
import { Application } from "../../common/app";
import {
	bindInstance,
	bindService,
	unloadGlobalContainer,
} from "../../common/global";
import { ChainMiddlewareEventServerFactory } from "../../common/middleware/Events/event.server.middleware";
import { ChainMiddlewareTickServerFactory } from "../../common/middleware/Tick/middleware.tick.server";
import { ServerProviderLoader } from "../../common/loader/Provider/provider.server.loader";
import { setMaxListeners } from "events";

async function Bootstrap() {
	// await bindInstance("Store", Store);
	await bindService<ChainMiddlewareEventServerFactory>(
		"ChainMiddlewareEventServerFactory",
		ChainMiddlewareEventServerFactory
	);

	await bindService<ChainMiddlewareTickServerFactory>(
		"ChainMiddlewareTickServerFactory",
		ChainMiddlewareTickServerFactory
	);

	try {
		setMaxListeners(20);
	} catch (e) {}

	const application = await Application.create(ServerProviderLoader);

	await application.stop();

	unloadGlobalContainer();
}

Bootstrap();
