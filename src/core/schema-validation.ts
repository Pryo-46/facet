import Ajv2020 from 'ajv/dist/2020.js'
import type { JsonSchema } from './canonical'

export interface SchemaValidationResult {
  ok: boolean
  /** 不合格時の人間可読メッセージ（レベル1「開けない」の理由表示に使う） */
  errors: string[]
}

export function createSchemaValidator(
  schema: JsonSchema,
): (data: unknown) => SchemaValidationResult {
  const ajv = new Ajv2020({ allErrors: true, strict: false })
  const validate = ajv.compile(schema)
  return (data) => {
    if (validate(data)) return { ok: true, errors: [] }
    const errors = (validate.errors ?? []).map(
      (e) => `${e.instancePath || '(ルート)'}: ${e.message ?? ''}`,
    )
    return { ok: false, errors }
  }
}
