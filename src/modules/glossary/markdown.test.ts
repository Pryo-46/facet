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

  it('用語0件なら見出しだけ。末尾は改行1つ', () => {
    const md = glossaryToMarkdown(glossary([]))
    expect(md).toBe('## テスト用語集\n')
  })
})
