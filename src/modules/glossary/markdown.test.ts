import { describe, expect, it } from 'vitest'
import type { GlossarySchemaVersion1, Term } from '@/types/glossary'
import { glossaryToMarkdown } from './markdown'

function term(over: Partial<Term> = {}): Term {
  return {
    id: 'term_AAAAAAAAAA',
    name: '用語',
    kind: 'other',
    definition: '定義',
    aliases: [],
    notes: '',
    ...over,
  }
}

function glossary(terms: Term[], title = 'テスト用語集'): GlossarySchemaVersion1 {
  return { schemaVersion: 1, type: 'glossary', title, terms }
}

describe('glossaryToMarkdown', () => {
  it('title は h2、種別グループは h3。h1 は使わない（NotePM の目次は h1〜h3）', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor' })]))
    expect(md).toContain('## テスト用語集')
    expect(md).toContain('### アクター')
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
  })

  // M13: 帯から title を空にできるようになったので、空欄が出力に漏れる経路が
  // 生まれた。空のまま出すと `## ` だけの行になり、Markdown 上で見出しですらない
  it('title が空なら (無題) を出す（`## ` だけの行にしない）', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor' })], ''))
    expect(md).toContain('## (無題)')
    expect(md.split('\n').some((line) => line === '## ')).toBe(false)
  })

  it('グループは kind enum の定義順に並ぶ（データの登場順ではない）', () => {
    const md = glossaryToMarkdown(
      glossary([
        term({ id: 'term_BBBBBBBBBB', name: 'あとの種別', kind: 'data' }),
        term({ id: 'term_CCCCCCCCCC', name: 'さきの種別', kind: 'actor' }),
      ]),
    )
    expect(md.indexOf('### アクター')).toBeLessThan(md.indexOf('### データ'))
  })

  it('空の種別は見出しごと省略する', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor' })]))
    expect(md).toContain('### アクター')
    expect(md).not.toContain('### 状態')
    expect(md).not.toContain('### 未分類')
  })

  it('グループ内はデータ配列順（並べ替えない）', () => {
    const md = glossaryToMarkdown(
      glossary([
        term({ id: 'term_BBBBBBBBBB', name: 'ん', kind: 'actor' }),
        term({ id: 'term_CCCCCCCCCC', name: 'あ', kind: 'actor' }),
      ]),
    )
    expect(md.indexOf('| ん |')).toBeLessThan(md.indexOf('| あ |'))
  })

  it('列は 名称／種別／定義／別名／備考 で、ID は出さない', () => {
    const md = glossaryToMarkdown(
      glossary([term({ id: 'term_ZZZZZZZZZZ', name: '応募者', kind: 'actor', notes: 'メモ' })]),
    )
    expect(md).toContain('| 名称 | 種別 | 定義 | 別名 | 備考 |')
    expect(md).toContain('| --- | --- | --- | --- | --- |')
    expect(md).toContain('| 応募者 | アクター | 定義 |  | メモ |')
    expect(md).not.toContain('term_ZZZZZZZZZZ')
  })

  it('definition が空なら（未定義）と書く（負債を出力にも残す）', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'actor', definition: '' })]))
    expect(md).toContain('| 用語 | アクター | （未定義） |  |  |')
  })

  it('undecided は「未分類」グループとして出す', () => {
    const md = glossaryToMarkdown(glossary([term({ kind: 'undecided' })]))
    expect(md).toContain('### 未分類')
  })

  it('別名は読点で連結する', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', aliases: ['候補者', 'candidate'] })]),
    )
    expect(md).toContain('| 候補者、candidate |')
  })

  it('セル内の | はエスケープし、改行は <br> にする（表を壊さない）', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', definition: 'a|b', notes: '1行目\n2行目' })]),
    )
    expect(md).toContain('a\\|b')
    expect(md).toContain('1行目<br>2行目')
    // 行数が用語数どおりであること（改行が表を割っていない）
    expect(md.split('\n').filter((l) => l.startsWith('| 用語 ')).length).toBe(1)
  })

  it('enum に無い kind の用語も落とさず末尾のグループに出す', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'unknownKind' as Term['kind'], name: '未知種別の用語' })]),
    )
    expect(md).toContain('### unknownKind')
    expect(md).toContain('| 未知種別の用語 |')
  })

  it('title に改行が入っていても h1 が混入しない（title はスキーマ上ただの string）', () => {
    const md = glossaryToMarkdown(glossary([], '用語集\n# 見出しのつもり'))
    expect(md.split('\n').some((line) => /^# /.test(line))).toBe(false)
    expect(md).toBe('## 用語集 # 見出しのつもり\n')
  })

  it('用語0件なら見出しだけ。末尾は改行1つ', () => {
    const md = glossaryToMarkdown(glossary([]))
    expect(md).toBe('## テスト用語集\n')
  })

  it('バックスラッシュ単体がセルを壊さない（Windows パス等）', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', definition: 'C:\\Users\\bin' })]),
    )
    // 出力に正しくエスケープされたバックスラッシュが含まれることを確認
    expect(md).toContain('C:\\\\Users\\\\bin')
    // 定義部分を含む行を抽出
    const rows = md.split('\n').filter((l) => l.includes('C:\\\\Users\\\\bin'))
    expect(rows.length).toBe(1)
    // 行が5つのセルを持つことを確認（名称、種別、定義、別名、備考）
    // セルは `|` で区切られているが、バックスラッシュの前の `|` はエスケープされているはず
    const row = rows[0]
    expect(row).toMatch(/^\| 用語 \| アクター \| C:\\\\Users\\\\bin \| {1,2}\| {1,2}\|$/)
  })

  it('バックスラッシュとパイプが隣接する場合、両方正しくエスケープされ表が壊れない', () => {
    const md = glossaryToMarkdown(
      glossary([term({ kind: 'actor', definition: 'a\\|b' })]),
    )
    // 生の定義 `a\|b` は出力で `a\\\|b` になるはず（リテラル `\` ＋ エスケープされた `|`）
    expect(md).toContain('a\\\\\\|b')
    // 定義部分を含む行を抽出
    const rows = md.split('\n').filter((l) => l.includes('a\\\\\\|b'))
    expect(rows.length).toBe(1)
    // 行が5つのセルを持つことを確認（`\|` はセル内容なので、列区切りは非エスケープ `|` のみ）
    const row = rows[0]
    expect(row).toMatch(/^\| 用語 \| アクター \| a\\\\\\\|b \| {1,2}\| {1,2}\|$/)
  })

  it('未知の種別に改行が入っていても見出しを割らない', () => {
    // enum 外の kind はスキーマ検証で弾かれるので通常は到達しない。
    // glossaryToMarkdown を直接呼ぶことで、enum 拡張時の経路だけを再現する
    const data = {
      schemaVersion: 1,
      type: 'glossary',
      title: 'T',
      terms: [
        { id: 'term_xxxxxxxxxx', name: 'N', kind: '未知\n# 見出し', definition: '', aliases: [], notes: '' },
      ],
    } as unknown as GlossarySchemaVersion1
    const md = glossaryToMarkdown(data)
    expect(md).toContain('### 未知 # 見出し')
    // 改行が残ると `# 見出し` が h1 として混入する
    expect(md).not.toMatch(/^# /m)
  })
})

describe('glossaryToMarkdown: 絞り込み（M29）', () => {
  it('visible を渡すと、その ID の用語だけを出す', () => {
    // 既存のテストが使っているデータの形に合わせて2件用意すること
    const data: GlossarySchemaVersion1 = {
      schemaVersion: 1 as const,
      type: 'glossary' as const,
      title: 'T',
      terms: [
        { id: 'term_aaaaaaaaaa', name: '受注', kind: 'event', definition: 'd', aliases: [], notes: '' },
        { id: 'term_bbbbbbbbbb', name: '与信', kind: 'event', definition: 'd', aliases: [], notes: '' },
      ],
    }
    const md = glossaryToMarkdown(data, new Set(['term_bbbbbbbbbb']))
    expect(md).toContain('与信')
    expect(md).not.toContain('受注')
  })

  it('絞り込みで空になった種別グループは見出しごと消える', () => {
    const data: GlossarySchemaVersion1 = {
      schemaVersion: 1 as const,
      type: 'glossary' as const,
      title: 'T',
      terms: [
        { id: 'term_aaaaaaaaaa', name: '受注', kind: 'event', definition: 'd', aliases: [], notes: '' },
        { id: 'term_bbbbbbbbbb', name: '画面A', kind: 'screen', definition: 'd', aliases: [], notes: '' },
      ],
    }
    const md = glossaryToMarkdown(data, new Set(['term_bbbbbbbbbb']))
    expect(md).not.toContain('### イベント')
    expect(md).toContain('### 画面')
  })

  it('visible を渡さなければ従来どおり全件（既存の呼び出しが1文字も変わらない）', () => {
    const data: GlossarySchemaVersion1 = {
      schemaVersion: 1 as const,
      type: 'glossary' as const,
      title: 'T',
      terms: [
        { id: 'term_aaaaaaaaaa', name: '受注', kind: 'event', definition: 'd', aliases: [], notes: '' },
      ],
    }
    expect(glossaryToMarkdown(data)).toBe(glossaryToMarkdown(data, null))
  })
})
