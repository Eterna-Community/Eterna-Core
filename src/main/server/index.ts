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
import { TestModule } from "./test/test.module";

async function Bootstrap() {
	try {
		await bindService<ChainMiddlewareEventServerFactory>(
			"MiddlewareFactory",
			ChainMiddlewareEventServerFactory
		);
		await bindService<ChainMiddlewareTickServerFactory>(
			"MiddlewareTickFactory",
			ChainMiddlewareTickServerFactory
		);

		try {
			setMaxListeners(20);
		} catch (e) {
			console.warn("Konnte setMaxListeners nicht setzen:", e);
		}

		const application = await Application.create(
			ServerProviderLoader,
			[TestModule],
			{
				gracefulShutdownTimeout: 30000,
				enableResourceListener: true,
			}
		);

		console.log("Application läuft... Warte auf Shutdown-Signal");
		await application.waitForShutdown();
	} catch (error) {
		console.error("Fehler beim Bootstrap:", error);
	} finally {
		unloadGlobalContainer();
	}
}

Bootstrap();

process.on("SIGINT", () => process.exit(0));
process.on("SIGTERM", () => process.exit(0));

process.on("uncaughtException", (error) => {
	console.error("Uncaught Exception:", error);
	process.exit(1);
});

process.on("unhandledRejection", (error) => {
	console.error("Unhandled Rejection:", error);
	process.exit(1);
});

process.on("exit", () => {
	unloadGlobalContainer();
});
