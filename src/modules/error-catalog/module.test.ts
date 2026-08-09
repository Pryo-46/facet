import { describe, expect, it } from 'vitest'
import { serialize } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import type { ErrorCatalogSchemaVersion1 } from '@/types/error-catalog'
import { errorCatalogModule } from './module'

const validate = createSchemaValidator(errorCatalogModule.schema)

describe('errorCatalogModule', () => {
  it('規約1・単一性・ID プレフィクスを宣言している', () => {
    expect(errorCatalogModule.type).toBe('errorCatalog')
    expect(errorCatalogModule.displayName).toBe('エラーカタログ')
    expect(errorCatalogModule.schemaVersion).toBe(1)
    expect([...errorCatalogModule.idPrefixes]).toEqual(['error'])
    // プロジェクトにつき1ファイル（コア横断検証が singleton フラグだけを見る）
    expect(errorCatalogModule.singleton).toBe(true)
  })

  it('createEmpty はスキーマ検証を通り、正規形で書ける', () => {
    const empty = errorCatalogModule.createEmpty('エラーカタログ')
    expect(validate(empty).ok).toBe(true)
    expect(serialize(empty, errorCatalogModule.schema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "errorCatalog",\n  "title": "エラーカタログ",\n  "errors": []\n}\n',
    )
  })

  it('マイグレータは恒等（初版なので旧版が存在しない）', () => {
    const data = errorCatalogModule.createEmpty('T')
    expect(errorCatalogModule.migrate(data, 1)).toBe(data)
  })
})

describe('出力プロファイル（規約5）', () => {
  it('2本を宣言し、id と fileSuffix が定義どおり', () => {
    expect(errorCatalogModule.outputs.map((o) => o.id)).toEqual(['support', 'dev'])
    expect(errorCatalogModule.outputs.map((o) => o.label)).toEqual(['サポート向け', '開発向け'])
    expect(errorCatalogModule.outputs.map((o) => o.fileSuffix)).toEqual([
      '-サポート向け',
      '-開発向け',
    ])
  })

  it('プロファイルごとに違う列で出す', () => {
    const data: ErrorCatalogSchemaVersion1 = {
      schemaVersion: 1,
      type: 'errorCatalog',
      title: 'T',
      errors: [
        {
          id: 'error_AAAAAAAAAA',
          name: 'E',
          occurrence: '',
          resolutionLevel: 'user',
          causeForSupport: '',
          causeForSpec: '仕様レベルの原因',
          userAction: '',
          supportAction: '',
          engineerAction: '',
          notes: '',
        },
      ],
    }
    const [support, dev] = errorCatalogModule.outputs
    expect(support.toMarkdown(data)).not.toContain('仕様レベルの原因')
    expect(dev.toMarkdown(data)).toContain('仕様レベルの原因')
  })
})

describe('レジストリ登録', () => {
  it('appRegistry から type で引ける（新規作成メニューに出る）', () => {
    expect(appRegistry.get('errorCatalog')).toBe(errorCatalogModule)
  })

  it('用語集の登録を壊していない', () => {
    expect(appRegistry.get('glossary')?.type).toBe('glossary')
    expect(appRegistry.list().map((m) => m.type)).toContain('errorCatalog')
  })
})
