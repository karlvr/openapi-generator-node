import { CodegenGeneratorConstructor, CodegenGenerator, CodegenDocument, CodegenState, CodegenGeneratorType, CodegenSchemaType, CodegenOperationGroupingStrategy, CodegenSchemaPurpose } from '@openapi-generator-plus/types'
import { addToGroupsByPath } from '../operation-grouping'
import { constructGenerator, createCodegenState, createCodegenDocument, createCodegenInput } from '..'
import path from 'path'
import pluralize from 'pluralize'

interface TestCodegenOptions {
	config: TestCodegenConfig
}

export interface TestCodegenConfig {
	operationGroupingStrategy?: CodegenOperationGroupingStrategy
}

const testGeneratorConstructor: CodegenGeneratorConstructor = (config, generatorContext) => {
	const generatorOptions: TestCodegenOptions = {
		config: config as TestCodegenConfig,
	}

	return {
		generatorType: () => CodegenGeneratorType.SERVER,
		toClassName: (name) => `${name}_class`,
		toIdentifier: (name) => `${name}_identifier`,
		toConstantName: (name) => `${name}_constant`,
		toEnumMemberName: (name) => `${name.replace('-', '')}_enum_member`,
		toOperationName: (path, method) => `${method} ${path} operation`,
		toOperationGroupName: (name) => `${name} api`,
		toSchemaName: (name) => {
			return name
		},
		toSuggestedSchemaName: (name, options) => {
			if (options.purpose === CodegenSchemaPurpose.ARRAY_ITEM || options.purpose === CodegenSchemaPurpose.MAP_VALUE) {
				name = pluralize.singular(name)
			}
			if (options.schemaType === CodegenSchemaType.ENUM) {
				return `${name}_enum`
			} else if (options.schemaType === CodegenSchemaType.OBJECT) {
				return `${name}_model`
			} else {
				return name
			}
		},
		toIteratedSchemaName: (name, _, iteration) => `${name}${iteration}`,
		toLiteral: (value) => `literal ${value}`,
		toNativeType: (options) => new generatorContext.NativeType(options.type),
		toNativeObjectType: (options) => new generatorContext.NativeType(options.scopedName.join('.')),
		toNativeArrayType: (options) => new generatorContext.NativeType(`array ${options.componentNativeType}`),
		toNativeMapType: (options) => new generatorContext.NativeType(`map ${options.componentNativeType}`),
		nativeTypeUsageTransformer: () => ({
			default: (nativeType) => nativeType.nativeType,
		}),
		defaultValue: (options) => {
			if (!options.required) {
				return { value: undefined, literalValue: 'undefined' }
			}

			switch (options.schemaType) {
				case CodegenSchemaType.ARRAY:
					return { value: [], literalValue: '[]' }
				case CodegenSchemaType.OBJECT:
					return { value: {}, literalValue: '{}' }
				case CodegenSchemaType.NUMBER:
					return { value: 0.0, literalValue: '0.0' }
				case CodegenSchemaType.INTEGER:
					return { value: 0, literalValue: '0' }
				case CodegenSchemaType.BOOLEAN:
					return { value: false, literalValue: 'false' }
				default:
					return { value: undefined, literalValue: 'undefined' }
			}
		},
		initialValue: (options) => {
			if (!options.required) {
				return null
			}

			switch (options.schemaType) {
				case CodegenSchemaType.ARRAY:
					return { value: [], literalValue: '[]' }
				case CodegenSchemaType.OBJECT:
					return { value: {}, literalValue: '{}' }
				case CodegenSchemaType.NUMBER:
					return { value: 0.0, literalValue: '0.0' }
				case CodegenSchemaType.INTEGER:
					return { value: 0, literalValue: '0' }
				case CodegenSchemaType.BOOLEAN:
					return { value: false, literalValue: 'false' }
				default:
					return { value: undefined, literalValue: 'undefined' }
			}
		},
		operationGroupingStrategy: () => generatorOptions.config.operationGroupingStrategy || addToGroupsByPath,
		exportTemplates: async() => {
			// NOOP
		},
		watchPaths: () => [],
		cleanPathPatterns: () => undefined,
		templateRootContext: () => ({}),
	}
}

export function createTestGenerator(config?: TestCodegenConfig): CodegenGenerator {
	return constructGenerator(config || {}, testGeneratorConstructor)
}

export async function createTestDocument(inputPath: string, config?: TestCodegenConfig): Promise<CodegenDocument> {
	return (await createTestResult(inputPath, config)).result
}

export interface TestResult {
	result: CodegenDocument
	state: CodegenState
}

export async function createTestResult(inputPath: string, config?: TestCodegenConfig): Promise<TestResult> {
	const generator = createTestGenerator(config)
	const state = createCodegenState(generator)
	const input = await createCodegenInput(path.resolve(__dirname, inputPath))
	const result = createCodegenDocument(input, state)
	return {
		result,
		state,
	}
}
