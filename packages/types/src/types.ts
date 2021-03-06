import { OpenAPI } from 'openapi-types'
import { IndexedType } from '@openapi-generator-plus/indexed-type'
import { CodegenNativeTypeStringTransformer, CodegenNativeTypeTransformers } from './native-types'

export interface CodegenInputDocument {
	$refs: {
		get: <T>(name: string) => T
	}
	root: OpenAPI.Document
}

export interface CodegenState {
	generator: CodegenGenerator
	log?: CodegenLogFunction
}

export type CodegenLogFunction = (level: CodegenLogLevel, message: string) => void

export enum CodegenLogLevel {
	INFO,
	WARN,
}

export enum CodegenGeneratorType {
	SERVER = 'SERVER',
	CLIENT = 'CLIENT',
	DOCUMENTATION = 'DOCUMENTATION',
}

/**
 * The interface implemented by language-specific generator modules.
 */
export interface CodegenGenerator {
	generatorType: () => CodegenGeneratorType
	
	/** Convert the given name to the native class name style */
	toClassName: (name: string) => string
	/** Convert the given name to the native identifier style */
	toIdentifier: (name: string) => string
	/** Convert the given name to the native constant identifier style */
	toConstantName: (name: string) => string
	/** Convert the given name to the native enum member name style */
	toEnumMemberName: (name: string) => string
	toOperationName: (path: string, method: string) => string
	toOperationGroupName: (name: string) => string
	/** Convert the given name to the native schema name style */
	toSchemaName: (name: string, options: CodegenSchemaNameOptions) => string
	/**
	 * For schemas that don't have names but need one, suggest a name for the schema in the context
	 * of the API (rather than of the generated language), as it doesn't have to be in the correct form  
	 * for the language as it will be passed through `toSchemaName` before being used.
	 */
	toSuggestedSchemaName: (suggestedName: string, options: CodegenSchemaNameSuggestionOptions) => string
	/**
	 * Return an iteration of a schema name in order to generate a unique schema name.
	 * The method MUST return a different name for each iteration.
	 * @param name the schema name
	 * @param parentNames the parent schema names, if any, for reference
	 * @param iteration the iteration number of searching for a unique name, starts from 1
	 * @param state the state
	 * @returns an iterated schema name
	 */
	toIteratedSchemaName: (name: string, parentNames: string[] | undefined, iteration: number) => string

	/** Format a value as a literal in the language */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	toLiteral: (value: any, options: CodegenLiteralValueOptions) => string
	toNativeType: (options: CodegenNativeTypeOptions) => CodegenNativeType
	toNativeObjectType: (options: CodegenNativeObjectTypeOptions) => CodegenNativeType
	toNativeArrayType: (options: CodegenNativeArrayTypeOptions) => CodegenNativeType
	toNativeMapType: (options: CodegenNativeMapTypeOptions) => CodegenNativeType
	/**
	 * Return a transformer to apply to native types when they are used.
	 */
	nativeTypeUsageTransformer: (options: CodegenNativeTypeUsageOptions) => CodegenNativeTypeTransformers | CodegenNativeTypeStringTransformer
	/**
	 * Return a default value to use for a property, where we MUST provide a default value. This will
	 * usuaully be an undefined, null or initial value for primitives.
	 */
	defaultValue: (options: CodegenDefaultValueOptions) => CodegenValue
	/** Return the initial value to use for a property, or `null` if it shouldn't have an initial value */
	initialValue: (options: CodegenInitialValueOptions) => CodegenValue | null

	operationGroupingStrategy: () => CodegenOperationGroupingStrategy

	/** Apply any post-processing to the given schema.
	 * @returns `false` if the schema should be excluded.
	 */
	postProcessSchema?: (model: CodegenSchema) => boolean | void

	/**
	 * Apply any post-processing to the given document.
	 */
	postProcessDocument?: (doc: CodegenDocument) => void

	/** Create the root context for the templates */
	templateRootContext: () => Record<string, unknown>
	
	exportTemplates: (outputPath: string, doc: CodegenDocument) => Promise<void>

	/** Return an array of paths to include in fs.watch when in watch mode */
	watchPaths: () => string[] | undefined

	/**
	 * Return an array of file patterns, relative to the output path, to delete if they
	 * haven't been modified after exporting.
	 */
	cleanPathPatterns: () => string[] | undefined
}

/**
 * The options from a config file.
 */
export interface CodegenConfig {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[name: string]: any

	/** The path to the config file, if any */
	configPath?: string
}

export interface CodegenDocument {
	info: CodegenInfo
	groups: CodegenOperationGroup[]
	schemas: CodegenNamedSchemas
	servers: CodegenServer[] | null
	securitySchemes: CodegenSecurityScheme[] | null
	securityRequirements: CodegenSecurityRequirements | null
	externalDocs: CodegenExternalDocs | null
}

export interface CodegenInfo {
	title: string
	description: string | null
	termsOfService: string | null
	contact: CodegenContactObject | null
	license: CodegenLicenseObject | null
	version: string
}

export interface CodegenContactObject {
	name: string | null
	url: string | null
	email: string | null
}
export interface CodegenLicenseObject {
	name: string
	url: string | null
}

export interface CodegenServer {
	/** The base URL of the API */
	url: string
	description: string | null
	vendorExtensions: CodegenVendorExtensions | null
}

export interface CodegenOperationGroups {
	[name: string]: CodegenOperationGroup
}

export interface CodegenOperationGroup {
	name: string
	/** The base path for operations in this group, relative to the server URLs */
	path: string
	description: string | null
	
	operations: CodegenOperation[]
	consumes: CodegenMediaType[] | null // TODO in OpenAPIV2 these are on the document, but not on OpenAPIV3
	produces: CodegenMediaType[] | null // TODO in OpenAPIV2 these are on the document, but not on OpenAPIV3
}

export interface CodegenOperation {
	name: string
	httpMethod: string
	/** The operation path, relative to the containing CodegenOperationGroup */
	path: string
	/** The full operation path, relative to the server URLs */
	fullPath: string

	returnType: string | null
	returnNativeType: CodegenNativeType | null
	consumes: CodegenMediaType[] | null
	produces: CodegenMediaType[] | null

	parameters: CodegenParameters | null
	queryParams: CodegenParameters | null
	pathParams: CodegenParameters | null
	headerParams: CodegenParameters | null
	cookieParams: CodegenParameters | null
	formParams: CodegenParameters | null

	requestBody: CodegenRequestBody | null

	securityRequirements: CodegenSecurityRequirements | null
	vendorExtensions: CodegenVendorExtensions | null
	responses: CodegenResponses | null
	defaultResponse: CodegenResponse | null
	deprecated: boolean
	summary: string | null
	description: string | null
	tags: string[] | null

	hasParamExamples: boolean
	hasQueryParamExamples: boolean
	hasPathParamExamples: boolean
	hasHeaderParamExamples: boolean
	hasCookieParamExamples: boolean
	hasFormParamExamples: boolean
	hasRequestBodyExamples: boolean
	hasResponseExamples: boolean
}

export type IndexedCollectionType<T> = IndexedType<string, T>

export type CodegenResponses = IndexedCollectionType<CodegenResponse>
export type CodegenParameters = IndexedCollectionType<CodegenParameter>

export interface CodegenResponse {
	code: number
	description: string

	/** The responses contents */
	contents: CodegenContent[] | null
	produces: CodegenMediaType[] | null

	defaultContent: CodegenContent | null

	isDefault: boolean
	vendorExtensions: CodegenVendorExtensions | null
	headers: CodegenHeaders | null
}

export type CodegenHeaders = IndexedCollectionType<CodegenHeader>

export interface CodegenHeader extends CodegenParameterBase {
	name: string
}

export interface CodegenContent extends CodegenSchemaUsage {
	mediaType: CodegenMediaType
}

export type CodegenExamples = IndexedCollectionType<CodegenExample>

export interface CodegenExample extends CodegenTypeInfo {
	name: string | null
	mediaType: CodegenMediaType | null
	summary: string | null
	description: string | null
	/** The raw example value, may be a string or any other JSON/YAML type */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any
	/** The example as a literal in the native language */
	valueLiteral: string
	/** The example value formatted as a string literal by the generator */
	valueString: string
	valuePretty: string
}

export interface CodegenNativeTypeConstructor {
	/**
	 * 
	 * @param nativeType The type in the native language
	 * @param additionalTypes Special-purpose versions of the native type. Any omitted properties will default to the `nativeType`, 
	 * 	any null properties will end up `undefined`.
	 */
	new(nativeType: string, additionalTypes?: {
		serializedType?: string | null
		literalType?: string | null
		concreteType?: string | null
		componentType?: CodegenNativeType | null
	}): CodegenNativeType
}

export interface CodegenNativeType {
	/** The type in the native language */
	nativeType: string

	/**
	 * The native language type to use if no translation is done from the communication layer.
	 * e.g. the type as it will be when deserialised from JSON.
	 */
	serializedType: string | null
	/**
	 * The native language type when expressing this type as a type literal, e.g. in java `java.util.List`
	 * as opposed to `java.util.List<java.lang.String>`, which is not valid as a type literal.
	 */
	literalType: string | null
	/**
	 * The concrete native language type to use when creating an object of this type. 
	 */
	concreteType: string | null
	/**
	 * The native language type when this type is a parent of another type.
	 */
	parentType: string | null
	/**
	 * The native language type when this type is a component of another type, e.g. an array.
	 * NOTE: The `componentType` may be set to `this` if there is no special component type for this type.
	 */
	componentType: CodegenNativeType | null

	toString(): string

	equals(other: CodegenNativeType | undefined): boolean

}

export enum CodegenSchemaType {
	OBJECT = 'OBJECT',
	MAP = 'MAP',
	ARRAY = 'ARRAY',
	BOOLEAN = 'BOOLEAN',
	NUMBER = 'NUMBER',
	INTEGER = 'INTEGER',
	ENUM = 'ENUM',
	STRING = 'STRING',
	DATETIME = 'DATETIME',
	DATE = 'DATE',
	TIME = 'TIME',
	FILE = 'FILE',
}

export interface CodegenTypeInfo {
	/** OpenAPI type */
	type: string
	format: string | null
	schemaType: CodegenSchemaType

	/** Type in native language */
	nativeType: CodegenNativeType
	// TODO we should have a CodegenNativeArrayType implementation of CodegenNativeType that has componentType, and same for map
	// and then rename componentType in CodegenNativeType to be less confusing

	/** Component schema usage for array and map properties */
	component: CodegenSchemaUsage | null
}


export interface CodegenSchemaInfo extends CodegenTypeInfo {
	nullable: boolean
	readOnly: boolean
	writeOnly: boolean
	deprecated: boolean
}

/**
 * An interface for objects that use CodegenSchemas. It contains information from the API
 * spec schema, applicable to the object that uses the schema.
 */
export interface CodegenSchemaUsage extends CodegenSchemaInfo {
	schema: CodegenSchema
	required: boolean
	examples: CodegenExamples | null
	defaultValue: CodegenValue | null
}

export interface CodegenProperty extends CodegenSchemaUsage {
	name: string
	description: string | null

	/** The initial value that the property should have. This is either the defaultValue, if there is one, or a default default from the generator. */
	initialValue: CodegenValue | null
}

export interface CodegenSchema extends CodegenSchemaInfo {
	/* The name of the schema */
	name: string | null
	/** The scoped name of this schema as an array. The components are as returned by CodegenGenerator.toSchemaName */
	scopedName: string[] | null
	/** The name of the schema in the API spec as it should be used when serialized (e.g. in JSON), if the schema was named in the spec */
	serializedName: string | null

	description: string | null
	title: string | null

	vendorExtensions: CodegenVendorExtensions | null
}

export type CodegenSchemas = IndexedCollectionType<CodegenSchema>

/**
 * A schema that _requires_ a name
 */
export interface CodegenNamedSchema extends CodegenSchema {
	/* The name of the schema */
	name: string

	/** The scoped name of this schema as an array. The components are as returned by CodegenGenerator.toSchemaName */
	scopedName: string[]
}

export type CodegenNamedSchemas = IndexedCollectionType<CodegenNamedSchema>

export interface CodegenNumericSchema extends CodegenSchema {
	type: 'number' | 'integer'
	schemaType: CodegenSchemaType.NUMBER | CodegenSchemaType.INTEGER

	maximum: number | null
	exclusiveMaximum: boolean | null
	minimum: number | null
	exclusiveMinimum: boolean | null
	multipleOf: number | null
}

export interface CodegenBooleanSchema extends CodegenSchema {
	type: 'boolean'
	schemaType: CodegenSchemaType.BOOLEAN
}

export interface CodegenStringSchema extends CodegenSchema {
	type: 'string'
	schemaType: CodegenSchemaType.STRING | CodegenSchemaType.DATE | CodegenSchemaType.DATETIME | CodegenSchemaType.TIME

	maxLength: number | null
	minLength: number | null
	pattern: string | null

}

export interface CodegenArraySchema extends CodegenSchema {
	type: 'array'
	schemaType: CodegenSchemaType.ARRAY

	maxItems: number | null
	minItems: number | null
	uniqueItems: boolean | null
}

export interface CodegenMapSchema extends CodegenSchema {
	type: 'object'
	schemaType: CodegenSchemaType.MAP
	
	maxProperties: number | null
	minProperties: number | null
}

export interface CodegenEnumSchema extends CodegenSchema {
	schemaType: CodegenSchemaType.ENUM

	/** Enums */
	/** The native type of the enum value */
	enumValueNativeType: CodegenNativeType | null
	/** The values making up the enum */
	enumValues: CodegenEnumValues | null

	examples: CodegenExamples | null
}

/**
 * Represents a value to be included in the generated output.
 */
export interface CodegenValue {
	/** The value in its raw JavaScript format */
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	value: any | null
	/** The value formatted as a literal in the native language */
	literalValue: string
}

/**
 * An object that defines a naming scope in the generated result.
 * Allows room in future for operations to define a naming scope.
 */
export interface CodegenScope {
	/** The scoped name of this schema as an array. The components are as returned by CodegenGenerator.toSchemaName */
	scopedName: string[]
	
	/** Nested schemas */
	schemas: CodegenNamedSchemas | null
}

export interface CodegenObjectSchema extends CodegenNamedSchema, CodegenScope {
	type: 'object'
	schemaType: CodegenSchemaType.OBJECT

	properties: CodegenProperties | null

	/** If the object supports additional properties */
	additionalProperties: CodegenMapSchema | null

	examples: CodegenExamples | null

	/* Polymorphism */

	/** Information about the discriminator that this model uses to differentiate either its children or submodels */
	discriminator: CodegenDiscriminator | null

	/** Information about the values of discriminators for this model */
	discriminatorValues: CodegenDiscriminatorValue[] | null

	/** The models that have this model as their parent */
	children: CodegenObjectSchemas | null

	/** Whether this model is an interface; it has no properties and exists as a marker in the type system rather than a functional object */
	isInterface: boolean

	/** The interface models that this model complies with */
	implements: CodegenSchemas | null
	implementors: CodegenSchemas | null

	/** Parent model */
	parent: CodegenObjectSchema | null
	/** The native type of the parent.
	 * This may be set even when `parent` is not set, in case the native parent is not a model.
	 */
	parentNativeType: CodegenNativeType | null
}

export type CodegenObjectSchemas = IndexedCollectionType<CodegenObjectSchema>

export type CodegenProperties = IndexedCollectionType<CodegenProperty>

export interface CodegenDiscriminatorReference {
	model: CodegenObjectSchema
	name: string
	/** The value literal in the native language */
	value: string
}

export interface CodegenDiscriminator extends CodegenTypeInfo {
	name: string
	mappings: CodegenDiscriminatorMappings | null
	references: CodegenDiscriminatorReference[]
}

export interface CodegenDiscriminatorValue {
	/** The model containing the discriminator */
	model: CodegenObjectSchema
	/** The value literal in the native language */
	value: string
}

export interface CodegenDiscriminatorMappings {
	[$ref: string]: string
}

export interface CodegenSchemaNameOptions {
	schemaType: CodegenSchemaType
}

export interface CodegenSchemaNameSuggestionOptions {
	purpose: CodegenSchemaPurpose
	schemaType: CodegenSchemaType
}

interface CodegenTypeOptions {
	type: string
	format?: string | null
	vendorExtensions?: CodegenVendorExtensions | null
}

/**
 * Possible transformations to a native type based upon usage of that type.
 */
export interface CodegenNativeTypeUsageOptions {
	required: boolean
	nullable: boolean
	readOnly: boolean
	writeOnly: boolean
}

export interface CodegenDefaultValueOptions extends CodegenTypeOptions, CodegenNativeTypeUsageOptions {
	schemaType: CodegenSchemaType
	nativeType: CodegenNativeType
}

export type CodegenInitialValueOptions = CodegenDefaultValueOptions

export type CodegenLiteralValueOptions = CodegenDefaultValueOptions

/**
 * Describes the purpose for which a schema is being used.
 */
export enum CodegenSchemaPurpose {
	/**
	 * The schema is being used as an item in an array.
	 */
	ARRAY_ITEM = 'ARRAY_ITEM',
	/**
	 * The schema is being used as a value in a map.
	 */
	MAP_VALUE = 'MAP_VALUE',
	/**
	 * The schema is being used as an object model.
	 */
	MODEL = 'MODEL',
	/**
	 * The schema is being used as a parameter.
	 */
	PARAMETER = 'PARAMETER',
	/**
	 * The schema is being used for a model property.
	 */
	PROPERTY = 'PROPERTY',
	/**
	 * The schema is being used for a request body.
	 */
	REQUEST_BODY = 'REQUEST_BODY',
	/**
	 * The schema is being used for a response.
	 */
	RESPONSE = 'RESPONSE',
	HEADER = 'HEADER',
}

export interface CodegenNativeTypeOptions extends CodegenTypeOptions {
}

export interface CodegenNativeObjectTypeOptions extends CodegenTypeOptions {
	scopedName: string[]
	vendorExtensions: CodegenVendorExtensions | null
}

export enum CodegenArrayTypePurpose {
	/** A type for an object property */
	PROPERTY = 'PROPERTY',
	/** A type for a model parent */
	PARENT = 'PARENT',
}

export interface CodegenNativeArrayTypeOptions extends CodegenTypeOptions {
	componentNativeType: CodegenNativeType
	/** The uniqueItems property from the API spec */
	uniqueItems?: boolean
	scopedName?: string[]
	purpose: CodegenArrayTypePurpose
}

export enum CodegenMapTypePurpose {
	/** A type for an object property */
	PROPERTY = 'PROPERTY',
	/** A type for a model parent */
	PARENT = 'PARENT',
}

export interface CodegenNativeMapTypeOptions extends CodegenTypeOptions {
	keyNativeType: CodegenNativeType
	componentNativeType: CodegenNativeType
	modelNames?: string[]
	purpose: CodegenMapTypePurpose
}

export type CodegenEnumValues = IndexedCollectionType<CodegenEnumValue>

export interface CodegenEnumValue {
	name: string
	literalValue: string
	value: string
}

export type CodegenParameterIn = 'query' | 'header' | 'path' | 'formData' | 'body'

interface CodegenParameterBase extends CodegenSchemaUsage {
	name: string
	
	description: string | null
	collectionFormat: string | null

	vendorExtensions: CodegenVendorExtensions | null
}

export interface CodegenParameter extends CodegenParameterBase {
	in: CodegenParameterIn

	isQueryParam: boolean
	isPathParam: boolean
	isHeaderParam: boolean
	isCookieParam: boolean
	isFormParam: boolean
}
export interface CodegenRequestBody extends CodegenParameterBase {
	contents: CodegenContent[]
	consumes: CodegenMediaType[]
	defaultContent: CodegenContent
}

export interface CodegenVendorExtensions {
	// eslint-disable-next-line @typescript-eslint/no-explicit-any
	[name: string]: any
}

/** The list of security requirement options. One of which must be satisfied, unless `optional` is `true`. */
export interface CodegenSecurityRequirements {
	/**
	 * Whether the security requirements are optional or not.
	 */
	optional: boolean

	requirements: CodegenSecurityRequirement[]
}

/**
 * All of the security requirements required.
 */
export interface CodegenSecurityRequirement {
	schemes: CodegenSecurityRequirementScheme[]
}

export interface CodegenSecurityRequirementScheme {
	scheme: CodegenSecurityScheme
	scopes: CodegenAuthScope[] | null
}

export interface CodegenSecurityScheme {
	name: string
	type: 'apiKey' | 'http' | 'oauth2' | 'openIdConnect'
	description: string | null

	/** The header or query parameter name for apiKey */
	paramName: string | null
	in: 'header' | 'query' | 'cookie' | null

	/** The http auth scheme for http auth */
	scheme: string | null
	
	flows: CodegenOAuthFlow[] | null
	openIdConnectUrl: string | null

	isBasic: boolean
	isHttp: boolean
	isApiKey: boolean
	isOAuth: boolean
	isOpenIdConnect: boolean

	isInQuery: boolean
	isInHeader: boolean

	vendorExtensions: CodegenVendorExtensions | null
}

export interface CodegenOAuthFlow {
	type: string
	authorizationUrl: string | null
	tokenUrl: string | null
	refreshUrl: string | null
	scopes: CodegenAuthScope[] | null

	vendorExtensions: CodegenVendorExtensions | null
}

export interface CodegenAuthScope {
	name: string
	description: string | null
	
	vendorExtensions: CodegenVendorExtensions | null
}

export interface CodegenMediaType {
	/** The media type as it appears in the API spec */
	mediaType: string
	/** Just the mimeType part of the media type */
	mimeType: string
	/** The encoding / charset part of the media type, if present */
	encoding: string | null
}

export type CodegenOperationGroupingStrategy = (operation: CodegenOperation, groups: CodegenOperationGroups, state: CodegenState) => void

/**
 * The different HTTP methods supported by OpenAPI.
 * NB. The order of entries in the enum may be used for sorting, see compareHttpMethods
 */
export enum HttpMethods {
	GET = 'GET',
	HEAD = 'HEAD',
	OPTIONS = 'OPTIONS',
	POST = 'POST',
	PUT = 'PUT',
	PATCH = 'PATCH',
	DELETE = 'DELETE',
	TRACE = 'TRACE',
}

export interface CodegenExternalDocs {
	description: string | null
	url: string
}
