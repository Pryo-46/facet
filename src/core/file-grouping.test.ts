import { describe, expect, it } from 'vitest'
import { groupFiles, UNKNOWN_TYPE_KEY } from './file-grouping'
import type { ProjectFile } from './project-file'
import type { AnyToolModule } from './registry'

/** 見出しの検証に要るのは type と displayName だけなので、そこだけ持つ偽物を使う */
function mod(type: string, displayName: string): AnyToolModule {
  return { type, displayName } as unknown as AnyToolModule
}

const MODULES = [
  mod('glossary', '用語集'),
  mod('errorCatalog', 'エラーカタログ'),
  mod('logicTree', 'ロジックツリー'),
  mod('sequence', 'シーケンス'),
]

function editable(name: string, type: string, title: string): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'editable', type, title, data: {} },
    issues: [],
  }
}

function unreadable(name: string): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
    issues: [],
  }
}

describe('groupFiles', () => {
  it('見出しはレジストリの登録順に並ぶ（新規作成ボタンと同じ順）', () => {
    const groups = groupFiles(
      [editable('b.json', 'sequence', 'あ'), editable('a.json', 'glossary', 'い')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual(['用語集', 'シーケンス'])
  })

  it('ファイルが1つも無い種類は見出しごと出さない', () => {
    const groups = groupFiles([editable('a.json', 'glossary', '用語集')], MODULES)
    expect(groups).toHaveLength(1)
    expect(groups[0].key).toBe('glossary')
  })

  // **五十音順ではない。** 漢字は ICU の照合順（部首・画数）で並ぶので、
  // 期待値も読みの順（受注→問合せ→返品）ではなく localeCompare の順になる
  it("グループ内は title の localeCompare('ja') 順", () => {
    const groups = groupFiles(
      [
        editable('シーケンス.json', 'sequence', '問合せフロー'),
        editable('シーケンス-2.json', 'sequence', '受注フロー'),
        editable('シーケンス-3.json', 'sequence', '返品フロー'),
      ],
      MODULES,
    )
    expect(groups[0].files.map((f) => f.name)).toEqual([
      'シーケンス-2.json',
      'シーケンス-3.json',
      'シーケンス.json',
    ])
  })

  it('title が同じならファイル名で決める（順が揺れないため）', () => {
    const groups = groupFiles(
      [editable('b.json', 'sequence', '同じ'), editable('a.json', 'sequence', '同じ')],
      MODULES,
    )
    expect(groups[0].files.map((f) => f.name)).toEqual(['a.json', 'b.json'])
  })

  it('登録に無い type は type 文字列を見出しにし、登録済みの後ろに昇順で並ぶ', () => {
    const groups = groupFiles(
      [
        editable('z.json', 'stateMachine', '注文の状態遷移'),
        editable('y.json', 'dataModel', '在庫'),
        editable('a.json', 'glossary', '用語集'),
      ],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual([
      '用語集',
      'dataModel（未対応）',
      'stateMachine（未対応）',
    ])
  })

  it('type が読めないファイルは「種類不明」で最後', () => {
    const groups = groupFiles(
      [unreadable('メモ.json'), editable('z.json', 'stateMachine', 'X'), editable('a.json', 'glossary', '用語集')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual(['用語集', 'stateMachine（未対応）', '種類不明'])
    expect(groups[2].key).toBe(UNKNOWN_TYPE_KEY)
  })

  it('入力の配列を破壊しない', () => {
    const files = [editable('b.json', 'sequence', 'い'), editable('a.json', 'sequence', 'あ')]
    groupFiles(files, MODULES)
    expect(files.map((f) => f.name)).toEqual(['b.json', 'a.json'])
  })

  it('ファイルが0件なら空配列', () => {
    expect(groupFiles([], MODULES)).toEqual([])
  })
})
