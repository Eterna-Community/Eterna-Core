import { DecoratorMetadataKey } from "../../constants";
import { RpcClient } from "../../events/ClientRpc";
import { RpcServer } from "../../events/ServerRpc";
import { addMethodMetadata } from "../../reflect";

export interface RpcOptions {
	timeout?: number;
	retries?: number;
	middleware?: string[];
	validator?: (data: any) => boolean;
	serializer?: (data: any) => any;
	deserializer?: (data: any) => any;
}

export interface RpcCall<TRequest = any, TResponse = any> {
	id: string;
	method: string;
	params: TRequest;
	timestamp: number;
}

export interface RpcResponse<TResponse = any> {
	id: string;
	success: boolean;
	result?: TResponse;
	error?: {
		code: string;
		message: string;
		details?: any;
	};
	timestamp: number;
}

export interface RpcMethod {
	name: string;
	handler: Function;
	options: RpcOptions;
	metadata: {
		paramTypes?: any[];
		returnType?: any;
		isAsync: boolean;
	};
}

export class RpcError extends Error {
	constructor(public code: string, message: string, public details?: any) {
		super(message);
		this.name = "RpcError";
	}
}

export class RpcTimeoutError extends RpcError {
	constructor(method: string, timeout: number) {
		super("TIMEOUT", `RPC call '${method}' timed out after ${timeout}ms`);
	}
}

export class RpcValidationError extends RpcError {
	constructor(method: string, details: any) {
		super("VALIDATION_ERROR", `Validation failed for RPC '${method}'`, details);
	}
}

export const Rpc = <TRequest = any, TResponse = any>(
	rpcEvent: RpcClient | RpcServer,
	options: RpcOptions = {}
): MethodDecorator => {
	return (target, propertyKey, descriptor) => {
		const methodMetadata = {
			event: rpcEvent,
			options: {
				timeout: 30000,
				retries: 0,
				middleware: [],
				...options,
			},
			paramTypes: Reflect.getMetadata("design:paramtypes", target, propertyKey),
			returnType: Reflect.getMetadata("design:returntype", target, propertyKey),
			isAsync: descriptor?.value?.constructor?.name === "AsyncFunction",
		};

		addMethodMetadata(
			DecoratorMetadataKey.rpc,
			methodMetadata,
			target,
			propertyKey
		);

		return descriptor;
	};
};
