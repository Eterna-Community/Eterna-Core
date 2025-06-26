import { decorate, inject, injectable, multiInject } from "inversify";
import { getGlobalContainer } from "../global";

export const Inject = inject;
export const MultiInject = multiInject;

export const Injectable =
	(...tokens: any[]): ClassDecorator =>
	(target) => {
		decorate(injectable(), target);

		// Use the classname as the default token
		const primaryToken = tokens.length > 0 ? tokens[0] : target.name || target;

		const container = getGlobalContainer();

		// Check if the Token is already bound
		if (!container.isBound(primaryToken)) {
			container
				.bind(primaryToken)
				.to(target as any)
				.inSingletonScope();
			console.log(
				`Injectable Service - ${target.name} registered successfully.`
			);
		}

		// Bind the rest of the tokens
		tokens.slice(1).forEach((token) => {
			if (!container.isBound(token)) {
				container.bind(token).toService(primaryToken);
				console.log(`Injectable Service 2 - ${token} registered successfully.`);
			}
		});
	};
