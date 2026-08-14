import { describe, expect, it } from 'vitest'
import { serialize } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import { logicTreeModule } from './module'

const validate = createSchemaValidator(logicTreeModule.schema)

describe('logicTreeModule', () => {
  it('規約1・単一性・ID プレフィクスを宣言している', () => {
    expect(logicTreeModule.type).toBe('logicTree')
    expect(logicTreeModule.displayName).toBe('ロジックツリー')
    expect(logicTreeModule.schemaVersion).toBe(1)
    expect([...logicTreeModule.idPrefixes]).toEqual(['node'])
    // 用語集と違いハブではないので、プロジェクトに何本あってもよい
    expect(logicTreeModule.singleton).toBe(false)
  })

  it('createEmpty はルート1件で作り、スキーマ検証を通る', () => {
    // 空状態の「クリックして開始」を廃止したので、最初の1ノードは雛形が持つ
    const empty = logicTreeModule.createEmpty('ロジックツリー')
    expect(empty.nodes).toHaveLength(1)
    expect(empty.nodes[0].parentId).toBe(null)
    expect(empty.nodes[0].text).toBe('')
    expect(validate(empty).ok).toBe(true)
    expect(logicTreeModule.checkConsistency(empty)).toEqual([])
  })

  it('createEmpty は正規形で書ける', () => {
    const empty = logicTreeModule.createEmpty('ロジックツリー')
    expect(serialize(empty, logicTreeModule.schema)).toBe(
      `{\n  "schemaVersion": 1,\n  "type": "logicTree",\n  "title": "ロジックツリー",\n  "nodes": [\n    {\n      "id": "${empty.nodes[0].id}",\n      "parentId": null,\n      "text": ""\n    }\n  ]\n}\n`,
    )
  })

  it('マイグレータは恒等（初版なので旧版が存在しない）', () => {
    const data = logicTreeModule.createEmpty('T')
    expect(logicTreeModule.migrate(data, 1)).toBe(data)
  })

  it('整合性検証が繋がっている（多重ルートを指摘する）', () => {
    // 規約4 の口が実際にロジックツリーの検証を指していることを見る。
    // 検証ルールそのものは consistency.test.ts が網羅する
    const issues = logicTreeModule.checkConsistency({
      schemaVersion: 1,
      type: 'logicTree',
      title: 'T',
      nodes: [
        { id: 'node_AAAAAAAAAA', parentId: null, text: 'a' },
        { id: 'node_BBBBBBBBBB', parentId: null, text: 'b' },
      ],
    })
    expect(issues.map((i) => i.rule)).toContain('multiple-root')
  })
})

describe('出力プロファイル（規約5）', () => {
  it('0本を宣言している（Markdown / Mermaid 出力は M2）', () => {
    // **0本は「出力を作っていないツール」の状態として正しい。**
    // 額縁の ExportMenu は outputs[0] が undefined のとき両ボタンを
    // disabled にするので、押せるが壊れた文字列が出るボタンは生まれない
    expect(logicTreeModule.outputs).toEqual([])
  })
})

describe('レジストリ登録', () => {
  it('appRegistry から type で引ける（新規作成メニューに出る）', () => {
    expect(appRegistry.get('logicTree')).toBe(logicTreeModule)
  })

  it('先行モジュールの登録を壊していない', () => {
    expect(appRegistry.get('glossary')?.type).toBe('glossary')
    expect(appRegistry.get('errorCatalog')?.type).toBe('errorCatalog')
    expect(appRegistry.list().map((m) => m.type)).toContain('logicTree')
  })
})
