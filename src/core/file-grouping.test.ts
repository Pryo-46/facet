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

/** 登録済み4種の見出し。ファイルの有無によらず常にこの4つが先頭に並ぶ */
const ALL_HEADINGS = ['用語集', 'エラーカタログ', 'ロジックツリー', 'シーケンス']

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

/** 種類でグループを引く。並び順に依存しない検証を書くため */
function group(groups: ReturnType<typeof groupFiles>, key: string) {
  const found = groups.find((g) => g.key === key)
  if (!found) throw new Error(`グループ ${key} が無い`)
  return found
}

describe('groupFiles', () => {
  it('見出しはレジストリの登録順に並ぶ', () => {
    const groups = groupFiles(
      [editable('b.json', 'sequence', 'あ'), editable('a.json', 'glossary', 'い')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual(ALL_HEADINGS)
  })

  // 見出しは新規作成の入口も兼ねる（右端の＋ボタン）ので、ファイルが無い種類も出す。
  // 出さないと、まだ1つも作っていないツールへ辿り着く手段が一覧から消える
  it('ファイルが1つも無い登録済みの種類も、空の見出しとして出す', () => {
    const groups = groupFiles([editable('a.json', 'glossary', '用語集')], MODULES)
    expect(groups.map((g) => g.heading)).toEqual(ALL_HEADINGS)
    expect(group(groups, 'sequence').files).toEqual([])
  })

  // ＋ボタンを出せるかどうかを、FileList が見出し文字列から推し量らずに済ませる
  it('登録済みのグループはモジュールを持ち、未対応 type と種類不明は持たない', () => {
    const groups = groupFiles(
      [editable('z.json', 'stateMachine', 'X'), unreadable('メモ.json')],
      MODULES,
    )
    expect(group(groups, 'glossary').module).toBe(MODULES[0])
    expect(group(groups, 'stateMachine').module).toBeNull()
    expect(group(groups, UNKNOWN_TYPE_KEY).module).toBeNull()
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
    expect(group(groups, 'sequence').files.map((f) => f.name)).toEqual([
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
    expect(group(groups, 'sequence').files.map((f) => f.name)).toEqual(['a.json', 'b.json'])
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
      ...ALL_HEADINGS,
      'dataModel（未対応）',
      'stateMachine（未対応）',
    ])
  })

  // 未対応 type と種類不明には作成の入口が無いので、空の見出しを出す理由も無い
  it('未対応 type と種類不明は、該当ファイルが無ければ出さない', () => {
    const groups = groupFiles([editable('a.json', 'glossary', '用語集')], MODULES)
    expect(groups.map((g) => g.key)).toEqual(MODULES.map((m) => m.type))
  })

  it('type が読めないファイルは「種類不明」で最後', () => {
    const groups = groupFiles(
      [unreadable('メモ.json'), editable('z.json', 'stateMachine', 'X'), editable('a.json', 'glossary', '用語集')],
      MODULES,
    )
    expect(groups.map((g) => g.heading)).toEqual([
      ...ALL_HEADINGS,
      'stateMachine（未対応）',
      '種類不明',
    ])
    expect(groups[groups.length - 1].key).toBe(UNKNOWN_TYPE_KEY)
  })

  it('入力の配列を破壊しない', () => {
    const files = [editable('b.json', 'sequence', 'い'), editable('a.json', 'sequence', 'あ')]
    groupFiles(files, MODULES)
    expect(files.map((f) => f.name)).toEqual(['b.json', 'a.json'])
  })

  it('ファイルが0件でも、登録済みの種類の見出しは出る', () => {
    const groups = groupFiles([], MODULES)
    expect(groups.map((g) => g.heading)).toEqual(ALL_HEADINGS)
    expect(groups.every((g) => g.files.length === 0)).toBe(true)
  })
})
