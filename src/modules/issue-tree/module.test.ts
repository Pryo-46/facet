import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { serialize } from '@/core/canonical'
import { classifyFile } from '@/core/load'
import { createSchemaValidator } from '@/core/schema-validation'
import { appRegistry } from '@/modules'
import type { IssueTreeSchemaVersion2 } from '@/types/issue-tree'
import { poseQuestions, tallyQuestions } from './derive'
import { issueTreeModule } from './module'

const validate = createSchemaValidator(issueTreeModule.schema)

describe('issueTreeModule', () => {
  it('規約1・単一性・ID プレフィクスを宣言している', () => {
    expect(issueTreeModule.type).toBe('issueTree')
    expect(issueTreeModule.displayName).toBe('課題ツリー')
    expect(issueTreeModule.schemaVersion).toBe(2)
    expect([...issueTreeModule.idPrefixes]).toEqual(['issue', 'hypothesis'])
    // PoC のテーマごとに1本作るのが普通の使い方。ハブではない
    expect(issueTreeModule.singleton).toBe(false)
  })

  it('createEmpty はルート課題1件で作り、スキーマ検証と整合性検証を通る', () => {
    const empty = issueTreeModule.createEmpty('課題ツリー')
    expect(empty.issues).toHaveLength(1)
    expect(empty.issues[0].parentId).toBe(null)
    expect(empty.issues[0].text).toBe('')
    expect(empty.issues[0].events).toEqual([])
    expect(empty.hypotheses).toEqual([])
    expect(validate(empty).ok).toBe(true)
    expect(issueTreeModule.checkConsistency(empty)).toEqual([])
  })

  it('createEmpty は正規形で書ける（キー順はスキーマの properties 記載順）', () => {
    const empty = issueTreeModule.createEmpty('課題ツリー')
    expect(serialize(empty, issueTreeModule.schema)).toBe(
      `{\n  "schemaVersion": 2,\n  "type": "issueTree",\n  "title": "課題ツリー",\n  "issues": [\n    {\n      "id": "${empty.issues[0].id}",\n      "parentId": null,\n      "text": "",\n      "events": []\n    }\n  ],\n  "hypotheses": []\n}\n`,
    )
  })

  it('マイグレータが繋がっている（現行版はそのまま・旧版は現行版へ移る）', () => {
    // 1 → 2 の中身は migrate.test.ts が見る。ここは module の配線だけを固める
    const data = issueTreeModule.createEmpty('T')
    expect(issueTreeModule.migrate(data, 2)).toBe(data)
    expect(issueTreeModule.migrate({ ...data, schemaVersion: 1 }, 1).schemaVersion).toBe(2)
  })

  it('整合性検証が繋がっている（多重ルートを指摘する）', () => {
    const issues = issueTreeModule.checkConsistency({
      schemaVersion: 2,
      type: 'issueTree',
      title: 'T',
      issues: [
        { id: 'issue_AAAAAAAAAA', parentId: null, text: 'a', events: [] },
        { id: 'issue_BBBBBBBBBB', parentId: null, text: 'b', events: [] },
      ],
      hypotheses: [],
    })
    expect(issues.map((i) => i.rule)).toContain('multiple-root')
  })
})

describe('出力プロファイル（規約5）', () => {
  it('0本を宣言している（Markdown 出力は観察後に判断する＝設計ノートの OUT）', () => {
    // 0本は「出力を作っていないツール」の状態として正しい。額縁の ExportMenu は
    // outputs[0] が undefined のとき両ボタンを disabled にする
    expect(issueTreeModule.outputs).toEqual([])
  })
})

describe('お手本ファイル（sample-project）', () => {
  it('schemaVersion 2 のお手本は editable で開け、保留が1件観測できる', () => {
    const raw = readFileSync(
      new URL('../../../sample-project/課題ツリー.json', import.meta.url),
      'utf8',
    )
    const result = classifyFile(raw, appRegistry)
    expect(result.status).toBe('editable')
    if (result.status === 'editable') {
      const data = result.data as IssueTreeSchemaVersion2
      expect(tallyQuestions(poseQuestions(data)).hold).toBe(1)
    }
  })
})

describe('レジストリ登録', () => {
  it('appRegistry から type で引ける（新規作成メニューに出る）', () => {
    expect(appRegistry.get('issueTree')).toBe(issueTreeModule)
  })

  it('先行モジュールの登録を壊していない', () => {
    for (const type of ['glossary', 'errorCatalog', 'logicTree', 'sequence']) {
      expect(appRegistry.get(type)?.type).toBe(type)
    }
    expect(appRegistry.list().map((m) => m.type)).toContain('issueTree')
  })
})
