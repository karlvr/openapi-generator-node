import { createTestDocument } from './common'
import { idx } from '../'
import { CodegenSchemaType } from '../../../types/dist'

test('array of strings without collection models', async() => {
	const result = await createTestDocument('odd-models/array-of-strings-v2.yml')

	const models = idx.allValues(result.schemas)
	expect(models.length).toEqual(0)

	const response = result.groups[0].operations[0].defaultResponse
	expect(response).not.toBeNull()

	const nativeType = response!.defaultContent?.nativeType
	expect(nativeType).not.toBeNull()
	expect(nativeType!.toString()).toEqual('array string')
})

test('uuid', async() => {
	const result = await createTestDocument('odd-models/uuid-v2.yml')

	/* We don't parse the UUID type as a model */
	expect(idx.size(result.schemas)).toEqual(0)

	/* Note that there doesn't seem to be a way to _use_ schemas like this actually */
})

test('missing schema', async() => {
	const result = await createTestDocument('odd-models/missing-schema.yml')
	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.queryParams!['param1']).toBeDefined()
	expect(op.queryParams!['param1'].schemaType).toEqual(CodegenSchemaType.STRING)
	expect(op.responses![200]).toBeDefined()
	expect(op.responses![200].headers!['ResponseHeader']).toBeDefined()
	expect(op.responses![200].headers!['ResponseHeader'].schemaType).toEqual(CodegenSchemaType.STRING)
})
