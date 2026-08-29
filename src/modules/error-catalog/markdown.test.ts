import { describe, expect, it } from 'vitest'
import type { ErrorCatalogSchemaVersion1, ErrorEntry } from '@/types/error-catalog'
import { errorCatalogToMarkdown } from './markdown'
import { DEV_PROFILE, markdownFields, SUPPORT_PROFILE } from './profiles'

const SUPPORT = markdownFields(SUPPORT_PROFILE)
const DEV = markdownFields(DEV_PROFILE)

function entry(over: Partial<ErrorEntry> = {}): ErrorEntry {
  return {
    id: 'error_AAAAAAAAAA',
    name: 'ログインできない',
    occurrence: '送信したとき',
    resolutionLevel: 'user',
    causeForSupport: '入力誤り',
    causeForSpec: '401 が返る',
    userAction: '入れ直す',
    supportAction: '確認する',
    engineerAction: '調べる',
    notes: 'メモ',
    ...over,
  }
}

function catalog(errors: ErrorEntry[], title = 'テストカタログ'): ErrorCatalogSchemaVersion1 {
  return { schemaVersion: 1, type: 'errorCatalog', title, errors }
}

describe('見出しと構造', () => {
  it('title は h2、解決レベルのグループは h3。h1 は使わない', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), SUPPORT)
    expect(md).toContain('## テストカタログ')
    expect(md).toContain('### ユーザー対応')
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
  })

  it('グループは enum の定義順に並ぶ（データの登場順ではない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_BBBBBBBBBB', name: 'あと', resolutionLevel: 'engineer' }),
        entry({ id: 'error_CCCCCCCCCC', name: 'さき', resolutionLevel: 'user' }),
      ]),
      SUPPORT,
    )
    expect(md.indexOf('### ユーザー対応')).toBeLessThan(md.indexOf('### エンジニア対応'))
  })

  it('空のグループは見出しごと省略する', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ resolutionLevel: 'user' })]), SUPPORT)
    expect(md).toContain('### ユーザー対応')
    expect(md).not.toContain('### サポート対応')
    expect(md).not.toContain('### 未分類')
  })

  it('グループ内はデータ配列順（並べ替えない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_BBBBBBBBBB', name: 'ん' }),
        entry({ id: 'error_CCCCCCCCCC', name: 'あ' }),
      ]),
      SUPPORT,
    )
    expect(md.indexOf('| ん |')).toBeLessThan(md.indexOf('| あ |'))
  })

  it('undecided は「未分類」グループとして出す（サポート向けでも省略しない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ resolutionLevel: 'undecided' })]),
      SUPPORT,
    )
    expect(md).toContain('### 未分類')
  })

  it('enum に無い解決レベルも落とさず末尾のグループに出す', () => {
    const data = catalog([
      entry({ name: '未知レベル', resolutionLevel: 'escalated' as ErrorEntry['resolutionLevel'] }),
    ])
    const md = errorCatalogToMarkdown(data, SUPPORT)
    expect(md).toContain('### escalated')
    expect(md).toContain('| 未知レベル |')
  })

  it('title に改行が入っていても h1 が混入しない', () => {
    const md = errorCatalogToMarkdown(catalog([], 'カタログ\n# 見出しのつもり'), SUPPORT)
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
    expect(md).toBe('## カタログ # 見出しのつもり\n')
  })

  it('0件なら見出しだけ。末尾は改行1つ', () => {
    expect(errorCatalogToMarkdown(catalog([]), SUPPORT)).toBe('## テストカタログ\n')
  })
})

describe('プロファイルごとの列', () => {
  it('サポート向けは仕様レベルの原因・備考・解決レベルを列に出さない', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), SUPPORT)
    expect(md).toContain(
      '| No | エラー名 | 発生タイミング | 原因（業務） | ユーザーの対応 | サポートの対応 | エンジニアの対応 |',
    )
    expect(md).not.toContain('原因（仕様）')
    expect(md).not.toContain('| 備考 |')
    expect(md).not.toContain('| 解決レベル |')
    expect(md).not.toContain('401 が返る')
    expect(md).not.toContain('メモ')
  })

  it('開発向けは仕様レベルの原因と備考も出す（解決レベルは見出しに出るので列にしない）', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), DEV)
    expect(md).toContain(
      '| No | エラー名 | 発生タイミング | 原因（業務） | 原因（仕様） | ユーザーの対応 | サポートの対応 | エンジニアの対応 | 備考 |',
    )
    expect(md).toContain('401 が返る')
    expect(md).toContain('メモ')
    expect(md).not.toContain('| 解決レベル |')
  })

  it('区切り行の列数が見出し行と一致する', () => {
    const md = errorCatalogToMarkdown(catalog([entry()]), DEV)
    const lines = md.split('\n')
    const header = lines.find((l) => l.startsWith('| No |')) as string
    const divider = lines[lines.indexOf(header) + 1]
    expect(divider.split('|')).toHaveLength(header.split('|').length)
  })

  it('ID は出さない', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ id: 'error_ZZZZZZZZZZ' })]), DEV)
    expect(md).not.toContain('error_ZZZZZZZZZZ')
  })
})

describe('No 列', () => {
  it('No はデータ配列の位置（index + 1）。グループをまたいでも振り直さない', () => {
    const md = errorCatalogToMarkdown(
      catalog([
        entry({ id: 'error_AAAAAAAAAA', name: '1件目', resolutionLevel: 'user' }),
        entry({ id: 'error_BBBBBBBBBB', name: '2件目', resolutionLevel: 'support' }),
        entry({ id: 'error_CCCCCCCCCC', name: '3件目', resolutionLevel: 'user' }),
      ]),
      SUPPORT,
    )
    // 画面の No と同じ番号を指す（会議中に口頭で指すための目印）
    expect(md).toContain('| 1 | 1件目 |')
    expect(md).toContain('| 2 | 2件目 |')
    expect(md).toContain('| 3 | 3件目 |')
  })
})

describe('空欄とエスケープ', () => {
  it('空フィールドは（未定義）と書く（負債を出力にも残す）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ occurrence: '', causeForSupport: '', userAction: '' })]),
      SUPPORT,
    )
    expect(md).toContain('| 1 | ログインできない | （未定義） | （未定義） | （未定義） |')
  })

  it('備考の空欄は（未定義）にしない（検知対象外の自由メモ。用語集と揃える）', () => {
    const md = errorCatalogToMarkdown(catalog([entry({ notes: '' })]), DEV)
    const row = md.split('\n').find((l) => l.startsWith('| 1 |')) as string
    expect(row.endsWith('| 調べる |  |')).toBe(true)
  })

  it('セル内の | はエスケープし、改行は <br> にする（表を壊さない）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ causeForSupport: 'a|b', userAction: '1行目\n2行目' })]),
      SUPPORT,
    )
    expect(md).toContain('a\\|b')
    expect(md).toContain('1行目<br>2行目')
    expect(md.split('\n').filter((l) => l.startsWith('| 1 |'))).toHaveLength(1)
  })

  it('バックスラッシュを先にエスケープする（順序が逆だと二重エスケープになる）', () => {
    const md = errorCatalogToMarkdown(
      catalog([entry({ causeForSupport: 'C:\\Users\\bin' })]),
      SUPPORT,
    )
    expect(md).toContain('C:\\\\Users\\\\bin')
    expect(md.split('\n').filter((l) => l.includes('C:\\\\Users\\\\bin'))).toHaveLength(1)
  })
})

describe('errorCatalogToMarkdown: 絞り込み（M29）', () => {
  const data = {
    schemaVersion: 1 as const,
    type: 'errorCatalog' as const,
    title: 'T',
    errors: [
      {
        id: 'error_aaaaaaaaaa', name: 'A', occurrence: 'o', resolutionLevel: 'support' as const,
        causeForSupport: 'c', causeForSpec: 'c', userAction: 'u', supportAction: 's',
        engineerAction: 'e', notes: '',
      },
      {
        id: 'error_bbbbbbbbbb', name: 'B', occurrence: 'o', resolutionLevel: 'support' as const,
        causeForSupport: 'c', causeForSpec: 'c', userAction: 'u', supportAction: 's',
        engineerAction: 'e', notes: '',
      },
    ],
  }
  const fields = ['name'] as const

  it('visible を渡すと、その ID のエラーだけを出す', () => {
    const md = errorCatalogToMarkdown(data, fields, new Set(['error_bbbbbbbbbb']))
    expect(md).toContain('| B |')
    expect(md).not.toContain('| A |')
  })

  it('**絞り込んでも No を振り直さない**（画面の No と食い違わせない）', () => {
    const md = errorCatalogToMarkdown(data, fields, new Set(['error_bbbbbbbbbb']))
    expect(md).toContain('| 2 | B |')
    expect(md).not.toContain('| 1 | B |')
  })

  it('絞り込みで空になった解決レベルのグループは見出しごと消える', () => {
    const mixed = {
      ...data,
      errors: [data.errors[0], { ...data.errors[1], resolutionLevel: 'user' as const }],
    }
    const md = errorCatalogToMarkdown(mixed, fields, new Set(['error_bbbbbbbbbb']))
    expect(md).not.toContain('### サポート対応')
    expect(md).toContain('### ユーザー対応')
  })

  it('visible を渡さなければ従来どおり全件', () => {
    // 等価性だけでは「絞り込んで空にする実装」でも通ってしまう
    // （`f(data)` と `f(data, null)` がどちらも空文字になり一致するため）。
    // 両方のエラーが実際に出力へ含まれることまで確かめる
    const md = errorCatalogToMarkdown(data, fields)
    expect(md).toBe(errorCatalogToMarkdown(data, fields, null))
    expect(md).toContain('| A |')
    expect(md).toContain('| B |')
  })
})
