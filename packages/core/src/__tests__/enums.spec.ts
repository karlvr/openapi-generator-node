import { createTestDocument } from './common'
import { idx } from '..'
import { CodegenEnumSchema, CodegenSchemaType } from '../../../types/dist'

test('non-unique enum values', async() => {
	const result = await createTestDocument('enums/non-unique-enum-values.yml')

	const op = result.groups[0].operations[0]
	expect(op).toBeDefined()
	expect(op.queryParams!['param1']).toBeDefined()
	expect(op.queryParams!['param1'].schemaType).toEqual(CodegenSchemaType.ENUM)
	const schema: CodegenEnumSchema = op.queryParams!['param1'].schema as CodegenEnumSchema
	expect(schema).toBeDefined()
	expect(schema.enumValues).not.toBeNull()
	expect(idx.size(schema.enumValues!)).toBe(5)

	const seenNames = new Set()
	for (const enumValue of idx.allValues(schema.enumValues!)) {
		if (seenNames.has(enumValue.name)) {
			throw new Error(`Duplicate enum value: ${enumValue.name}`)
		}
		seenNames.add(enumValue.name)
	}
	expect(seenNames.size).toBe(5)
})
