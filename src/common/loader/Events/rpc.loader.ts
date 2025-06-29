import { isServer } from "../../app";
import { DecoratorMetadataKey } from "../../constants";
import {
	RpcCall,
	RpcError,
	RpcMethod,
	RpcOptions,
	RpcResponse,
	RpcTimeoutError,
	RpcValidationError,
} from "../../decorator/Events/Rpc";
import { Inject, Injectable } from "../../decorator/Injectable";
import { Logger } from "../../logger/logger";
import { MiddlewareFactory } from "../../middleware/middleware";
import { getMethodMetadata } from "../../reflect";

@Injectable()
export class RpcLoader {
	private rpcMethods = new Map<string, RpcMethod>();
	private pendingCalls = new Map<
		string,
		{
			resolve: (value: any) => void;
			reject: (error: any) => void;
			timeout: NodeJS.Timeout;
		}
	>();

	@Inject("MiddlewareFactory")
	private middlewareFactory: MiddlewareFactory;

	@Inject(Logger)
	private logger: Logger;

	public load(provider: any): void {
		const rpcMethodList = getMethodMetadata<any>(
			DecoratorMetadataKey.rpc,
			provider
		);

		for (const [methodName, metadata] of Object.entries(rpcMethodList)) {
			this.registerRpcMethod(provider, methodName, metadata);
		}
	}

	private registerRpcMethod(
		provider: any,
		methodName: string,
		metadata: any
	): void {
		const rpcName = metadata.event;

		if (this.rpcMethods.has(rpcName)) {
			this.logger.error(`RPC method '${rpcName}' already exists`);
			return;
		}

		const boundMethod = provider[methodName].bind(provider);
		const rpcMethod: RpcMethod = {
			name: rpcName,
			handler: boundMethod,
			options: metadata.options,
			metadata: {
				paramTypes: metadata.paramTypes,
				returnType: metadata.returnType,
				isAsync: metadata.isAsync,
			},
		};

		// Event Handler registrieren
		const eventHandler = this.createEventHandler(rpcMethod);
		addEventListener(rpcName, eventHandler, true);

		this.rpcMethods.set(rpcName, rpcMethod);
		this.logger.debug(`Registered RPC method: ${rpcName}`);
	}

	private createEventHandler(rpcMethod: RpcMethod) {
		return async (...args: any[]) => {
			try {
				if (isServer) {
					await this.handleServerRpc(rpcMethod, args);
				} else {
					await this.handleClientRpc(rpcMethod, args);
				}
			} catch (error) {
				this.logger.error(`RPC Error in ${rpcMethod.name}:`, error);
			}
		};
	}

	private async handleServerRpc(
		rpcMethod: RpcMethod,
		args: any[]
	): Promise<void> {
		const [source, callData] = args;
		const rpcCall: RpcCall = this.deserializeCall(callData);

		try {
			// Validierung
			if (
				rpcMethod.options.validator &&
				!rpcMethod.options.validator(rpcCall.params)
			) {
				throw new RpcValidationError(rpcMethod.name, rpcCall.params);
			}

			// Middleware anwenden
			const middlewareHandler = this.middlewareFactory.create(
				{
					name: rpcMethod.name,
					networked: true,
					methodName: rpcMethod.name,
					context: false,
				},
				///@ts-expect-error TODO: Fix
				rpcMethod.handler
			);

			// RPC ausführen
			const result = await middlewareHandler(source, ...rpcCall.params);

			// Erfolgreiche Antwort senden
			const response: RpcResponse = {
				id: rpcCall.id,
				success: true,
				result: this.serializeData(result, rpcMethod.options),
				timestamp: Date.now(),
			};

			TriggerClientEvent(`${rpcMethod.name}_response`, source, response);
		} catch (error) {
			// Fehlerantwort senden
			const response: RpcResponse = {
				id: rpcCall.id,
				success: false,
				error: {
					code: error instanceof RpcError ? error.code : "INTERNAL_ERROR",
					message: error.message,
					details: error instanceof RpcError ? error.details : undefined,
				},
				timestamp: Date.now(),
			};

			TriggerClientEvent(`${rpcMethod.name}_response`, source, response);
		}
	}

	private async handleClientRpc(
		rpcMethod: RpcMethod,
		args: any[]
	): Promise<void> {
		const [callData] = args;
		const rpcCall: RpcCall = this.deserializeCall(callData);

		try {
			// Validierung
			if (
				rpcMethod.options.validator &&
				!rpcMethod.options.validator(rpcCall.params)
			) {
				throw new RpcValidationError(rpcMethod.name, rpcCall.params);
			}

			// Middleware anwenden
			const middlewareHandler = this.middlewareFactory.create(
				{
					name: rpcMethod.name,
					networked: true,
					methodName: rpcMethod.name,
					context: false,
				},
				///@ts-expect-error TODO: Fix
				rpcMethod.handler
			);

			// RPC ausführen
			const result = await middlewareHandler(...rpcCall.params);

			// Erfolgreiche Antwort senden
			const response: RpcResponse = {
				id: rpcCall.id,
				success: true,
				result: this.serializeData(result, rpcMethod.options),
				timestamp: Date.now(),
			};

			TriggerServerEvent(`${rpcMethod.name}_response`, response);
		} catch (error) {
			// Fehlerantwort senden
			const response: RpcResponse = {
				id: rpcCall.id,
				success: false,
				error: {
					code: error instanceof RpcError ? error.code : "INTERNAL_ERROR",
					message: error.message,
					details: error instanceof RpcError ? error.details : undefined,
				},
				timestamp: Date.now(),
			};

			TriggerServerEvent(`${rpcMethod.name}_response`, response);
		}
	}

	// RPC Call ausführen (für Client-Code)
	public async call<TResponse = any>(
		method: string,
		params: any[] = [],
		options?: RpcOptions
	): Promise<TResponse> {
		const rpcMethod = this.rpcMethods.get(method);
		if (!rpcMethod) {
			throw new RpcError(
				"METHOD_NOT_FOUND",
				`RPC method '${method}' not found`
			);
		}

		const callId = this.generateCallId();
		const timeout = options?.timeout || rpcMethod.options.timeout || 30000;

		const rpcCall: RpcCall = {
			id: callId,
			method,
			params,
			timestamp: Date.now(),
		};

		return new Promise<TResponse>((resolve, reject) => {
			// Timeout einrichten
			const timeoutHandle = setTimeout(() => {
				this.pendingCalls.delete(callId);
				reject(new RpcTimeoutError(method, timeout));
			}, timeout);

			// Call in pending Liste aufnehmen
			this.pendingCalls.set(callId, {
				resolve,
				reject,
				timeout: timeoutHandle,
			});

			// Response Handler registrieren (einmalig)
			const responseHandler = (response: RpcResponse) => {
				if (response.id === callId) {
					const pendingCall = this.pendingCalls.get(callId);
					if (pendingCall) {
						clearTimeout(pendingCall.timeout);
						this.pendingCalls.delete(callId);

						if (response.success) {
							resolve(this.deserializeData(response.result, rpcMethod.options));
						} else {
							const error = new RpcError(
								response.error?.code || "UNKNOWN_ERROR",
								response.error?.message || "Unknown error occurred",
								response.error?.details
							);
							reject(error);
						}
					}
					// Event Listener entfernen
					removeEventListener(`${method}_response`, responseHandler);
				}
			};

			addEventListener(`${method}_response`, responseHandler, true);

			// RPC Call senden
			if (isServer) {
				// Server -> Client call würde hier implementiert werden
				// TriggerClientEvent(method, targetPlayer, this.serializeCall(rpcCall));
			} else {
				// Client -> Server call
				TriggerServerEvent(method, this.serializeCall(rpcCall));
			}
		});
	}

	private generateCallId(): string {
		return `rpc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
	}

	private serializeCall(call: RpcCall): any {
		return JSON.stringify(call);
	}

	private deserializeCall(data: any): RpcCall {
		return typeof data === "string" ? JSON.parse(data) : data;
	}

	private serializeData(data: any, options: RpcOptions): any {
		if (options.serializer) {
			return options.serializer(data);
		}
		return data;
	}

	private deserializeData(data: any, options: RpcOptions): any {
		if (options.deserializer) {
			return options.deserializer(data);
		}
		return data;
	}

	public unload(): void {
		// Alle pending calls abbrechen
		for (const [callId, pendingCall] of this.pendingCalls) {
			clearTimeout(pendingCall.timeout);
			pendingCall.reject(
				new RpcError("SYSTEM_SHUTDOWN", "RPC system is shutting down")
			);
		}
		this.pendingCalls.clear();

		// Event Listener entfernen
		for (const [rpcName] of this.rpcMethods) {
			// Hier müssten wir die tatsächlichen Handler-Referenzen speichern
			// um sie korrekt zu entfernen
		}

		this.rpcMethods.clear();
		this.logger.debug("RPC Loader unloaded");
	}

	public getRegisteredMethods(): string[] {
		return Array.from(this.rpcMethods.keys());
	}

	public getMethodInfo(methodName: string): RpcMethod | undefined {
		return this.rpcMethods.get(methodName);
	}
}
