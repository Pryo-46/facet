import { describe, expect, it } from 'vitest'
import { serialize, type JsonSchema } from '@/core/canonical'
import { createSchemaValidator } from '@/core/schema-validation'
import logicTreeSchema from '../../../schemas/logic-tree.schema.json'

const validate = createSchemaValidator(logicTreeSchema as JsonSchema)

const base = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '退会フローの検討',
  nodes: [
    { id: 'node_aB3xY9kLm2', parentId: null, text: '退会できない' },
    { id: 'node_Qw7zR1nP4t', parentId: 'node_aB3xY9kLm2', text: '導線が分からない' },
  ],
}

describe('logicTree のスキーマ検証（レベル1）', () => {
  it('最小の正しいファイルを受け入れる', () => {
    expect(validate(base).ok).toBe(true)
  })

  it('ノード0件（新規作成直後）を受け入れる', () => {
    expect(validate({ ...base, nodes: [] }).ok).toBe(true)
  })

  it('空の文言を受け入れる', () => {
    // 追加した直後の状態がそのまま自動保存されうる。ここを弾くと
    // 打ち終わる前の保存が「自分で作った開けないファイル」になる
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', parentId: null, text: '' }] }).ok).toBe(true)
  })

  it('ID のプレフィクスが違うものを拒否する', () => {
    expect(validate({ ...base, nodes: [{ id: 'term_aB3xY9kLm2', parentId: null, text: 'x' }] }).ok).toBe(false)
  })

  it('ID の長さが違うものを拒否する', () => {
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm', parentId: null, text: 'x' }] }).ok).toBe(false)
  })

  it('未知のキーを拒否する', () => {
    // 座標をデータに入れる経路をスキーマで塞ぐ（rev 3章）
    expect(
      validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', parentId: null, text: 'x', x: 10 }] }).ok,
    ).toBe(false)
  })

  it('parentId の欠損を拒否する（全キー常在）', () => {
    expect(validate({ ...base, nodes: [{ id: 'node_aB3xY9kLm2', text: 'x' }] }).ok).toBe(false)
  })

  it('循環しているファイルはスキーマ検証を通る（レベル2の担当）', () => {
    // 「拒否は解釈不能な場合に限る」（rev 5章）。構造は読めるので開ける
    expect(
      validate({
        ...base,
        nodes: [
          { id: 'node_aB3xY9kLm2', parentId: 'node_Qw7zR1nP4t', text: 'a' },
          { id: 'node_Qw7zR1nP4t', parentId: 'node_aB3xY9kLm2', text: 'b' },
        ],
      }).ok,
    ).toBe(true)
  })

  it('正規形のキー順はスキーマの properties 記載順になる', () => {
    const shuffled = { nodes: [], title: 'T', type: 'logicTree', schemaVersion: 1 }
    expect(serialize(shuffled, logicTreeSchema as JsonSchema)).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "logicTree",\n  "title": "T",\n  "nodes": []\n}\n',
    )
  })
})
