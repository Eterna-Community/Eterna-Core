export const setMethodMetadata = (
	key: string,
	value: any /** Replace Later with more TypeSafe Solution */,
	target: any /** Replace Later with more TypeSafe Solution */,
	propertyKey: string | symbol
) => {
	const metadata = Reflect.getMetadata(key, target) || {};
	metadata[propertyKey] = value;

	Reflect.defineMetadata(key, metadata, target);
};

export const addMethodMetadata = (
	key: string,
	value: any /** Replace Later with more TypeSafe Solution */,
	target: any /** Replace Later with more TypeSafe Solution */,
	propertyKey: string | symbol
) => {
	const metadata = Reflect.getMetadata(key, target) || {};
	metadata[propertyKey] ||= [];
	metadata[propertyKey].push(value);

	Reflect.defineMetadata(key, metadata, target);
};

export const getMethodMetadata = <R>(
	key: string,
	target: any /** Replace Later with more TypeSafe Solution */,
	propertyKey?: string | symbol
) => Reflect.getMetadata(key, target, propertyKey) as R;
