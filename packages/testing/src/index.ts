import { CodegenDocument, CodegenState, CodegenConfig, CodegenGeneratorConstructor } from '@openapi-generator-plus/types'
import { constructGenerator, createCodegenState, createCodegenInput, createCodegenDocument } from '@openapi-generator-plus/core'

export interface CodegenResult {
	doc: CodegenDocument
	state: CodegenState
}

export async function createCodegenResult(inputPath: string, config: CodegenConfig, generatorConstructor: CodegenGeneratorConstructor): Promise<CodegenResult> {
	const generator = constructGenerator(config, generatorConstructor)
	const state = createCodegenState(generator)
	const input = await createCodegenInput(inputPath)
	const doc = createCodegenDocument(input, state)
	return {
		doc,
		state,
	}
}
