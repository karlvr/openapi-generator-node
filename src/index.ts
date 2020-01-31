import SwaggerParser, { parse } from 'swagger-parser'
import { OpenAPI, OpenAPIV2, OpenAPIV3 } from 'openapi-types'
import Handlebars, { HelperOptions } from 'handlebars'
import { promises as fs } from 'fs'
import path from 'path'
import camelcase from 'camelcase'
import { CodegenDocument, CodegenConfig, CodegenOperation, CodegenOperationGroup, CodegenResponse, CodegenState, CodegenProperty, CodegenParameter, CodegenMediaType, CodegenVendorExtensions, CodegenModel, CodegenOptionsJava, CodegenRootContext, CodegenRootContextJava } from './types'
import { isOpenAPIV2ResponseObject, isOpenAPIVReferenceObject, isOpenAPIV3ResponseObject, isOpenAPIV2GeneralParameterObject, isOpenAPIV2Operation, isOpenAPIV2Document } from './openapi-type-guards'
import { OpenAPIX } from './types/patches'

function capitalize(value: string) {
	if (value.length > 0) {
		return value.substring(0, 1).toUpperCase() + value.substring(1)
	} else {
		return value
	}
}

/**
 * Camel case and capitalize suitable for a class name. Doesn't change existing
 * capitalization in the value.
 * e.g. "FAQSection" remains "FAQSection", and "faqSection" will become "FaqSection" 
 * @param value string to be turned into a class name
 */
function classCamelCase(value: string) {
	let result = value.replace(/[^-_\.a-zA-Z0-9]+/g, '-')
	result = result.replace(/(-|_\.)([a-zA-Z])/g, (whole, sep, letter) => capitalize(letter))
	result = result.replace(/(-|_\.)/g, '')
	result = result.replace(/^[0-9]*/, '')
	// result = camelcase(result, { pascalCase: true }) // This didn't work as it changes "FAQSection" to "FaqSection"
	result = capitalize(result)
	if (result.length === 0) {
		throw new Error(`Unrepresentable class name: ${name}`)
	}
	return result
}

const JavaCodegenConfig: CodegenConfig = {
	toClassName: (name) => {
		return classCamelCase(name)
	},
	toIdentifier: (name) => {
		let result = name.replace(/[^-_\.a-zA-Z0-9]/g, '-')
		result = result.replace(/^[0-9]*/, '')
		result = camelcase(result)
		if (result.length === 0) {
			throw new Error(`Unrepresentable identifier name: ${name}`)
		}
		return result
	},
	toNativeType: (type, format, required, refName) => {
		if (type === 'object' && refName) {
			return refName
		}

		/* See https://github.com/OAI/OpenAPI-Specification/blob/master/versions/2.0.md#data-types */
		switch (type) {
			case 'integer': {
				if (format === 'int32') {
					return required ? 'Integer' : 'int'
				} else if (format === 'int64') {
					return required ? 'Long' : 'long'
				} else {
					return required ? 'Integer' : 'int'
				}
			}
			case 'number': {
				if (format === 'float') {
					return required ? 'Float' : 'float'
				} else if (format === 'double') {
					return require ? 'Double' : 'double'
				} else {
					return required ? 'Float' : 'float'
				}
			}
			case 'string': {
				if (format === 'byte') {
					return required ? 'Byte' : 'byte'
				} else if (format === 'binary') {
					return 'Object'
				} else if (format === 'date') {
					return 'LocalDate'
				} else if (format === 'date-time') {
					return 'ZonedDateTime'
				} else {
					return 'String'
				}
			}
			case 'boolean': {
				return required ? 'Boolean' : 'boolean'
			}
			case 'object': {
				return 'UHOH' // TODO an anonymous object?
			}
		}

		throw new Error(`Unsupported type name: ${type}`)
	},
	toNativeArrayType: (type, format, refName, uniqueItems) => {
		const itemNativeType = JavaCodegenConfig.toNativeType(type, format, false, refName)
		if (uniqueItems) {
			return `Set<${itemNativeType}>`
		} else {
			return `Collection<${itemNativeType}>`
		}
	},
	toDefaultValue: (defaultValue, type, required) => {
		if (defaultValue !== undefined) {
			return `${defaultValue}`
		}

		if (!required) {
			return 'null'
		}

		switch (type) {
			case 'integer':
			case 'number':
				return '0'
			case 'boolean':
				return 'false'
			case 'string':
			case 'object':
			case 'array':
				return 'null'
		}

		throw new Error(`Unsupported type name: ${type}`)
	},
	options: (): CodegenOptionsJava => {
		return {
			hideGenerationTimestamp: true,
			apiPackage: 'com.example.api',
			apiServiceImplPackage: 'com.example.api.impl',
			modelPackage: 'com.example.model',
			invokerPackage: 'com.example.invoker',
			useBeanValidation: true,
		}
	},
	noReturnNativeType: () => {
		return ''
	},
}

// TODO this represents a strategy for grouping operations
/**
 * See JavaJAXRSSpecServerCodegen.addOperationToGroup
 * @param operationInfo 
 * @param apiInfo 
 */
function addOperationToGroup(operationInfo: CodegenOperation, apiInfo: CodegenDocument) {
	let basePath = operationInfo.path
	
	const pos = basePath.indexOf('/', 1)
	if (pos > 0) {
		basePath = basePath.substring(0, pos)
	}
	if (basePath === '' || basePath === '/') {
		basePath = 'default'
	} else {
		/* Convert operation path to be relative to basePath */
		operationInfo = { ...operationInfo }
		operationInfo.path = operationInfo.path.substring(basePath.length)
	}

	let groupName = basePath
	if (groupName.startsWith('/')) {
		groupName = groupName.substring(1)
	}

	if (!apiInfo.groups[groupName]) {
		apiInfo.groups[groupName] = {
			name: groupName,
			path: basePath,
			operations: {
				operation: [],
			},
			consumes: [], // TODO in OpenAPIV2 these are on the document, but not on OpenAPIV3
			produces: [], // TODO in OpenAPIV2 these are on the document, but not on OpenAPIV3
		}
	}
	apiInfo.groups[groupName].operations.operation.push(operationInfo)
}

function addOperationsToGroups(operationInfos: CodegenOperation[], apiInfo: CodegenDocument) {
	for (const operationInfo of operationInfos) {
		addOperationToGroup(operationInfo, apiInfo)
	}
}

function processCodegenDocument(doc: CodegenDocument) {
	for (const name in doc.groups) {
		doc.groups[name].operations.operation.sort((a, b) => a.operationId!.localeCompare(b.operationId!))
	}
}

async function compileTemplate(templatePath: string) {
	const templateSource = await fs.readFile(templatePath, 'UTF-8')
	return Handlebars.compile(templateSource)
}

async function loadTemplates(templateDirPath: string) {
	const files = await fs.readdir(templateDirPath)
	for (const file of files) {
		const template = await compileTemplate(path.resolve(templateDirPath, file))
		Handlebars.registerPartial(path.parse(file).name, template)
	}
}

async function emit(templateName: string, outputPath: string, context: object) {
	const template = Handlebars.partials[templateName]
	if (!template) {
		throw new Error(`Unknown template: ${templateName}`)
	}
	const outputString = template(context)

	if (outputPath === '-') {
		console.log(outputString)
	} else {
		await fs.mkdir(path.dirname(outputPath), { recursive: true })
		fs.writeFile(outputPath, outputString, 'UTF-8')
	}
}

function createCodegenOperation(path: string, method: string, operation: OpenAPI.Operation | undefined, result: CodegenOperation[], state: CodegenState) {
	if (!operation) {
		return
	}

	const op = toCodegenOperation(path, method, operation, state)
	result.push(op)
}

function toCodegenParameter(parameter: OpenAPI.Parameter, state: CodegenState): CodegenParameter {
	if (isOpenAPIVReferenceObject(parameter)) {
		parameter = state.parser.$refs.get(parameter.$ref) as OpenAPIV3.ParameterObject | OpenAPIV2.Parameter
	}

	let property: CodegenProperty | undefined
	if (parameter.schema) {
		property = toCodegenProperty(parameter.name, parameter.schema, parameter.required || false, state)
	} else if (isOpenAPIV2GeneralParameterObject(parameter)) {
		const type = parameter.type
		let nativeType: string
		if (type === 'array') {
			let itemsRefName: string | undefined
			if (isOpenAPIVReferenceObject(parameter.items)) {
				itemsRefName = nameFromRef(parameter.items.$ref)
			}
			const itemsSchema = resolveReference(parameter.items, state)!
			nativeType = state.config.toNativeArrayType(itemsSchema.type, itemsSchema.format, itemsRefName, parameter.uniqueItems)
		} else {
			nativeType = state.config.toNativeType(parameter.type, parameter.format, !!parameter.required, undefined)
		}
		property = {
			name: state.config.toIdentifier(parameter.name),
			originalName: parameter.name,
			nativeType,
			description: parameter.description,
			type,
			required: !!parameter.required,
			defaultValue: state.config.toDefaultValue(parameter.default, parameter.type, !!parameter.required),
			readOnly: false,
			isBoolean: parameter.type === 'boolean',
		}
	}

	const result: CodegenParameter = {
		name: state.config.toIdentifier(parameter.name),
		originalName: parameter.name,
		type: property ? property.type : undefined,
		nativeType: property ? property.nativeType : undefined,
		in: parameter.in,
		description: parameter.description,
		required: parameter.required,
	}
	switch (parameter.in) {
		case 'query':
			result.isQueryParam = true
			break
		case 'path':
			result.isPathParam = true
			result.required = true
			break
		case 'header':
			result.isHeaderParam = true
			break
		case 'cookie':
			result.isCookieParam = true
			break
		case 'body':
			result.isBodyParam = true
			break
		case 'form':
			result.isFormParam = true
			break
	}
	// console.log(result)
	return result
}

function toCodegenVendorExtensions(ob: OpenAPI.Operation | OpenAPIX.Response): CodegenVendorExtensions | undefined {
	const result: CodegenVendorExtensions = {}
	let found = false

	for (const name in ob) {
		if (name.startsWith('x-')) {
			result[name] = (ob as any)[name]
			found = true
		}
	}

	return found ? result : undefined
}

function toCodegenOperation(path: string, method: string, operation: OpenAPI.Operation, state: CodegenState): CodegenOperation {
	const responses: CodegenResponse[] | undefined = operation.responses ? toCodegenResponses(operation.responses, state) : undefined
	const defaultResponse = responses ? responses.find(r => r.isDefault) : undefined

	let parameters: CodegenParameter[] | undefined
	if (operation.parameters) {
		parameters = []
		for (const parameter of operation.parameters) {
			parameters.push(toCodegenParameter(parameter, state))
		}
	}

	const op: CodegenOperation = {
		operationId: operation.operationId,
		httpMethod: method,
		path,
		returnType: defaultResponse ? defaultResponse.type : undefined,
		returnNativeType: defaultResponse ? defaultResponse.nativeType : state.config.noReturnNativeType(),
		consumes: toConsumeMediaTypes(operation, state),
		produces: toProduceMediaTypes(operation, state),
		allParams: parameters,
		defaultResponse,
		responses,
		isDeprecated: operation.deprecated,
		summary: operation.summary,
		description: operation.description,
		tags: operation.tags,
		vendorExtensions: toCodegenVendorExtensions(operation),
	}
	return op
}

function toConsumeMediaTypes(op: OpenAPI.Operation, state: CodegenState): CodegenMediaType[] | undefined {
	if (isOpenAPIV2Operation(op)) {
		return op.consumes?.map(mediaType => ({
			mediaType,
		}))
	} else if (op.requestBody) {
		let requestBody = resolveReference(op.requestBody, state)
		return toCodegenMediaTypes(requestBody.content)
	} else {
		return undefined
	}
}

/**
 * Resolve anything that may also be a ReferenceObject to the base type.
 * @param ob 
 * @param state 
 */
function resolveReference<T>(ob: T | OpenAPIV3.ReferenceObject | OpenAPIV2.ReferenceObject, state: CodegenState): T {
	if (isOpenAPIVReferenceObject(ob)) {
		return state.parser.$refs.get(ob.$ref)
	} else {
		return ob
	}
}

function toProduceMediaTypes(op: OpenAPI.Operation, state: CodegenState): CodegenMediaType[] | undefined {
	if (isOpenAPIV2Operation(op)) {
		return op.produces?.map(mediaType => ({
			mediaType,
		}))
 	} else if (op.responses) {
		const defaultResponse = toCodegenResponses(op.responses, state).find(r => r.isDefault)
		if (defaultResponse) {
			let response = op.responses[defaultResponse.code]
			if (response) {
				response = resolveReference(response, state)
				if (response.content) {
					return toCodegenMediaTypes(response.content)
				}
			}
		}
		return undefined
	} else {
		return undefined
	}
}

function toCodegenMediaTypes(content: { [media: string]: OpenAPIV3.MediaTypeObject }) {
	const result: CodegenMediaType[] = []
	for (const mediaType in content) {
		result.push({
			mediaType,
		})
	}
	return result
}

function processCodegenOperations(operationInfos: CodegenOperation[], state: CodegenState) {
	for (const operationInfo of operationInfos) {
		processOperationInfo(operationInfo, state)
	}
}

function processOperationInfo(op: CodegenOperation, state: CodegenState) {
	
}

function toCodegenResponses(responses: OpenAPIX.ResponsesObject, state: CodegenState): CodegenResponse[] {
	const result: CodegenResponse[] = []

	let bestCode: number | undefined
	let bestResponse: CodegenResponse | undefined

	for (const responseCodeString in responses) {
		const responseCode = responseCodeString === 'default' ? 0 : parseInt(responseCodeString, 10)
		const response = toCodegenResponse(responseCode, responses[responseCodeString], false, state)

		result.push(response)

		/* See DefaultCodegen.findMethodResponse */
		if (responseCode === 0 || Math.floor(responseCode / 100) === 2) {
			if (bestCode === undefined || responseCode < bestCode) {
				bestCode = responseCode
				bestResponse = response
			}
		}
	}

	if (bestCode !== undefined && bestResponse) {
		bestResponse.isDefault = true
	}

	return result
}

/**
 * Convert a `$ref` into a name that could be turned into a type.
 * @param $ref 
 */
function nameFromRef($ref: string): string | undefined {
	if ($ref.startsWith('#/definitions/')) {
		return $ref.substring('#/definitions/'.length)
	}
	return undefined
}

function toCodegenResponse(code: number, response: OpenAPIX.Response, isDefault: boolean, state: CodegenState): CodegenResponse {
	response = resolveReference(response, state)

	if (code === 0) {
		code = 200
	}
	
	if (isOpenAPIV2ResponseObject(response)) {
		const property = response.schema ? toCodegenProperty('response', response.schema, true, state) : undefined
		
		return {
			code,
			description: response.description,
			isDefault,
			type: property ? property.type : undefined,
			nativeType: property ? property.nativeType : state.config.noReturnNativeType(),
			vendorExtensions: toCodegenVendorExtensions(response),
		}
	} else if (isOpenAPIV3ResponseObject(response)) {
		return {
			code,
			description: response.description,
			isDefault,
			vendorExtensions: toCodegenVendorExtensions(response),
		}
	} else {
		throw new Error(`Unsupported response: ${JSON.stringify(response)}`)
	}
}

function toCodegenProperty(name: string, schema: OpenAPIV2.Schema | OpenAPIV3.SchemaObject, required: boolean, state: CodegenState): CodegenProperty {
	let type: string | undefined
	let refName: string | undefined
	if (isOpenAPIVReferenceObject(schema)) {
		refName = nameFromRef(schema.$ref)
	}

	schema = resolveReference(schema, state)

	let nativeType: string
	
	if (schema.type === 'array' && schema.items) {
		type = schema.type

		let itemsRefName: string | undefined
		if (isOpenAPIVReferenceObject(schema.items)) {
			itemsRefName = nameFromRef(schema.items.$ref)
		}
		const itemsSchema = resolveReference(schema.items, state)
		nativeType = state.config.toNativeArrayType(itemsSchema.type, itemsSchema.format, itemsRefName, schema.uniqueItems)
	} else if (typeof schema.type === 'string') {
		type = schema.type
		nativeType = state.config.toNativeType(type, schema.format, required, refName)
	} else if (schema.allOf || schema.anyOf || schema.oneOf) {
		type = 'object'
		nativeType = state.config.toNativeType(type, schema.format, required, refName)
	} else {
		throw new Error(`Unsupported schema.type ${schema.type} in ${JSON.stringify(schema)}`)
	}

	return {
		name: state.config.toIdentifier(name),
		originalName: name,
		description: schema.description,
		title: schema.title,
		defaultValue: state.config.toDefaultValue(schema.default, type, required),
		readOnly: !!schema.readOnly,
		required,
		type,
		nativeType,
		isBoolean: type === 'boolean',
	}
}

function toCodegenModel(name: string, schema: OpenAPIV2.SchemaObject | OpenAPIV3.SchemaObject, state: CodegenState): CodegenModel {
	const vars: CodegenProperty[] = []
	
	for (const propertyName in schema.properties) {
		const required = schema.required ? schema.required.indexOf(propertyName) !== -1 : false
		const propertySchema = schema.properties[propertyName]
		const property = toCodegenProperty(propertyName, propertySchema, required, state)
		vars.push(property)
	}

	if (schema.allOf) {
		for (let subSchema of schema.allOf) {
			subSchema = resolveReference(subSchema, state)
			const subModel = toCodegenModel('ignore', subSchema as OpenAPIV2.Schema, state)
			vars.push(...subModel.vars)
		}
	} else if (schema.anyOf) {
		throw new Error('anyOf not supported')
	} else if (schema.oneOf) {
		throw new Error('oneOf not supported')
	}

	return {
		name,
		description: schema.description,
		isEnum: false, // TODO
		vars,
		vendorExtensions: toCodegenVendorExtensions(schema),
	}
}

const enum HttpMethods {
	DELETE = 'DELETE',
	GET = 'GET',
	HEAD = 'HEAD',
	OPTIONS = 'OPTIONS',
	PATCH = 'PATCH',
	POST = 'POST',
	PUT = 'PUT',
}

function prepareApiContext(context: any, config: CodegenConfig, root?: CodegenRootContext): any {
	return {
		...context,
		...config.options(),
		...root,
		// classname: config.toApiName(context.name),
	}
}

export async function run() {
	try {
		const parser = new SwaggerParser()
		const root = await parser.parse('./swagger.yml')
		const config = JavaCodegenConfig

		const state: CodegenState = {
			parser,
			root,
			config,
		}

		// console.log('refs', parser.$refs)
		// return
		
		// console.log(JSON.stringify(api, null, 2))

		const operations: CodegenOperation[] = []

		for (const path in root.paths) {
			const pathItem: OpenAPIV2.PathItemObject | OpenAPIV3.PathItemObject = root.paths[path]

			createCodegenOperation(path, HttpMethods.DELETE, pathItem.delete, operations, state)
			createCodegenOperation(path, HttpMethods.GET, pathItem.get, operations, state)
			createCodegenOperation(path, HttpMethods.HEAD, pathItem.head, operations, state)
			createCodegenOperation(path, HttpMethods.OPTIONS, pathItem.options, operations, state)
			createCodegenOperation(path, HttpMethods.PATCH, pathItem.patch, operations, state)
			createCodegenOperation(path, HttpMethods.POST, pathItem.post, operations, state)
			createCodegenOperation(path, HttpMethods.PUT, pathItem.put, operations, state)
		}

		// console.log(operationInfos)

		processCodegenOperations(operations, state)

		const doc: CodegenDocument = {
			groups: {},
			schemas: {},
		}
		addOperationsToGroups(operations, doc)

		if (isOpenAPIV2Document(root)) {
			if (root.definitions) {
				for (const schemaName in root.definitions) {
					const model = toCodegenModel(schemaName, root.definitions[schemaName], state)
					doc.schemas[schemaName] = model
				}
			}
		} else {
			// TODO
		}

		processCodegenDocument(doc)

		/** Convert the string argument to a Java class name. */
		Handlebars.registerHelper('className', function(name: string) {
			if (typeof name === 'string') {
				return new Handlebars.SafeString(config.toClassName(name))
			} else {
				throw new Error(`className helper has name parameter: ${name}`)
			}
		})
		/** Convert the given name to be a safe appropriately named identifier for the language */
		Handlebars.registerHelper('identifier', function(this: any, name: string, options: HelperOptions) {
			return new Handlebars.SafeString(config.toIdentifier(name))
		})
		Handlebars.registerHelper('capitalize', function(this: any, name: string) {
			return capitalize(name)
		})
		// Handlebars.registerHelper('hasConsumes', function(this: any, options: HelperOptions) {
		// 	if (this.consumes) {
		// 		return options.fn({
		// 			...this,
		// 			consumes: this.consumes.map((mediaType: string) => ({ mediaType })),
		// 		})
		// 	} else {
		// 		return options.inverse(this)
		// 	}
		// })
		// Handlebars.registerHelper('hasProduces', function(this: any, options: HelperOptions) {
		// 	if (this.produces) {
		// 		return options.fn({
		// 			...this,
		// 			produces: this.produces.map((mediaType: string) => ({ mediaType })),
		// 		})
		// 	} else {
		// 		return options.inverse(this)
		// 	}
		// })
		// Handlebars.registerHelper('subresourceOperation', function(this: any, options: HelperOptions) {
		// 	if (this.path) {
		// 		return options.fn(this)
		// 	} else {
		// 		return options.inverse(this)
		// 	}
		// })
		Handlebars.registerHelper('hasMore', function(this: any, options: HelperOptions) {
			if (options.data.last === false) {
				return options.fn(this)
			} else {
				return options.inverse(this)
			}
		})
		// Handlebars.registerHelper('dataType', function(this: any, name: string) {
		// 	/* Convert the given swagger type to a type appropriate to the language */
		// 	if (this.type) {
		// 		return new Handlebars.SafeString(config.toDataType(this.type, this.format, this.required, this.refName))
		// 	}
		// })
		// Handlebars.registerHelper('returnBaseType', function(this: CodegenOperationDetail, options: HelperOptions) {
		// 	// console.log('returnBaseType', options)
		// 	if (this.responses) {

		// 	}
		// 	if (options.fn) {
		// 		/* Block helper */
		// 		return options.fn(this)
		// 	} else {
		// 		return 'OK'
		// 	}
		// })
		// Handlebars.registerHelper('httpMethod', function(this: any, options: HelperOptions) {
		// 	console.log('HTTP METHOD', this)
		// 	return this.method
		// })
		// Handlebars.registerHelper('helperMissing', function(this: any) {
		// 	const options = arguments[arguments.length - 1];

		// 	console.log(options.name)


		// 	// const args = Array.prototype.slice.call(arguments, 0, arguments.length-1)
		// 	// return new Handlebars.SafeString("Missing: " + options.name + "(" + args + ")")
		// })
		// console.log(JSON.stringify(apiInfo, undefined, 2))

		// await loadTemplates('./server-stub/templates')
		// await emit('pom', './output/pom.xml', api)
		// await emit('api', './output/Api.java', api)
		await loadTemplates('./templates/cactuslab')

		const options: CodegenOptionsJava = config.options() as CodegenOptionsJava
		const rootContext: CodegenRootContextJava = {
			generatorClass: 'openapi-generator-node',
			generatedDate: new Date().toISOString(),

			package: options.apiPackage,
		}

		const apiPackagePath = packageToPath(rootContext.package)
		for (const groupName in doc.groups) {
			await emit('api', `./output/${apiPackagePath}/${config.toClassName(groupName)}Api.java`, prepareApiContext(doc.groups[groupName], config, rootContext))
		}

		for (const groupName in doc.groups) {
			await emit('apiService', `./output/${apiPackagePath}/${config.toClassName(groupName)}ApiService.java`, prepareApiContext(doc.groups[groupName], config, rootContext))
		}

		rootContext.package = options.apiServiceImplPackage

		const apiImplPackagePath = packageToPath(rootContext.package)
		for (const groupName in doc.groups) {
			await emit('apiServiceImpl', `./output/${apiImplPackagePath}/${config.toClassName(groupName)}ApiServiceImpl.java`, prepareApiContext(doc.groups[groupName], config, rootContext))
		}

		rootContext.package = options.modelPackage

		const modelPackagePath = packageToPath(rootContext.package)
		for (const modelName in doc.schemas) {
			const context = {
				models: {
					model: [doc.schemas[modelName]],
				},
			}
			await emit('model', `./output/${modelPackagePath}/${config.toClassName(modelName)}.java`, prepareApiContext(context, config, rootContext))
		}

		
	} catch (error) {
		console.warn('API validation failed', error)
	}
}

/**
 * Turns a Java package name into a path
 * @param packageName Java package name
 */
function packageToPath(packageName: string) {
	return packageName.replace(/\./g, path.sep)
}

run().then(() => {
	console.log('done')
})