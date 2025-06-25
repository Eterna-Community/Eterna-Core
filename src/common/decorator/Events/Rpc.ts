import { DecoratorMetadataKey } from "../../constants";
import { RpcClient } from "../../events/ClientRpc";
import { RpcServer } from "../../events/ServerRpc";
import { addMethodMetadata } from "../../reflect";

export const Rpc =
	(rpcEvent: RpcClient | RpcServer): MethodDecorator =>
	(target, propertyKey) => {
		addMethodMetadata(DecoratorMetadataKey.rpc, rpcEvent, target, propertyKey);
	};
