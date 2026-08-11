import { describe, expect, it } from 'vitest'
import type { ConsistencyIssue } from '@/core/consistency'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { describeSequenceIssueEffect, sequenceToMarkdown } from './markdown'

/**
 * 退化ケースを避けたフィクスチャ（lessons-for-planning）。
 * 参加者3人・4種類のステップ・4つの答えの状態（handled / notApplicable（理由あり）/
 * notApplicable（理由なし）/ 未回答）を混ぜる——1種類だと「立っていない＝空」と
 * 「未回答＝（未定義）」を取り違えた実装でも同じ表になる
 */
function doc(over: Partial<SequenceSchemaVersion1> = {}): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定（在庫あり）',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面', domain: '自社' },
      { id: 'actor_Aaaaaaaaa2', name: 'API', domain: '自社' },
      { id: 'actor_Aaaaaaaaa3', name: '決済', domain: '決済会社' },
    ],
    steps: [
      {
        id: 'step_Aaaaaaaaa1',
        kind: 'call',
        from: 'actor_Aaaaaaaaa1',
        to: 'actor_Aaaaaaaaa2',
        label: '注文確定',
        awaitsReply: true,
        failures: {
          failed: { decision: 'handled', text: '画面にエラー表示して中断' },
          // unknown / ifExecuted は未回答（キー欠落）
        },
      },
      {
        id: 'step_Aaaaaaaaa2',
        kind: 'call',
        from: 'actor_Aaaaaaaaa2',
        to: 'actor_Aaaaaaaaa3',
        label: '出荷指示',
        awaitsReply: false,
        failures: { unknown: { decision: 'handled', text: '再送する' } },
      },
      { id: 'step_Aaaaaaaaa3', kind: 'reply', from: 'actor_Aaaaaaaaa3', to: 'actor_Aaaaaaaaa2', label: '与信OK' },
      {
        id: 'step_Aaaaaaaaa4',
        kind: 'self',
        from: 'actor_Aaaaaaaaa2',
        label: '在庫引当',
        failures: { failed: { decision: 'notApplicable', text: '在庫は事前確保済み' } },
      },
    ],
    ...over,
  }
}

/** 表の本文行だけを取り出す（見出し行と区切り行を除く） */
function bodyRows(markdown: string): string[] {
  return markdown.split('\n').filter((line) => /^\| \d+ \|/.test(line))
}

describe('sequenceToMarkdown: 全体の形', () => {
  it('h2 の見出し → Mermaid ブロック → 表、の順で1本にまとめる', () => {
    const out = sequenceToMarkdown(doc())
    const h2 = out.indexOf('## 注文確定（在庫あり）')
    const fence = out.indexOf('```mermaid')
    const header = out.indexOf('| No | from → to |')
    expect(h2).toBe(0)
    expect(fence).toBeGreaterThan(h2)
    expect(header).toBeGreaterThan(fence)
  })

  it('h1 は使わない（NotePM のページタイトルと階層が衝突する）', () => {
    expect(sequenceToMarkdown(doc())).not.toMatch(/^# /m)
  })

  it('Mermaid ブロックは閉じる', () => {
    expect(sequenceToMarkdown(doc()).match(/```/g)).toHaveLength(2)
  })

  it('末尾は改行1つで終わる（既存2ツールの出力と揃える）', () => {
    const out = sequenceToMarkdown(doc())
    expect(out.endsWith('\n')).toBe(true)
    expect(out.endsWith('\n\n')).toBe(false)
  })

  it('見出しの改行は潰す（外部が書いた title で h1 が混入しない）', () => {
    expect(sequenceToMarkdown(doc({ title: 'a\n# b' }))).toContain('## a # b')
  })
})

describe('sequenceToMarkdown: 表のセル', () => {
  it('No はデータ配列の位置（画面のガター行見出し #N と一致する）', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows.map((r) => r.split(' | ')[0])).toEqual(['| 1', '| 2', '| 3', '| 4'])
  })

  it('handled は本文、notApplicable（理由あり）は ─ 考慮不要（理由）', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[0]).toContain('画面にエラー表示して中断')
    expect(rows[3]).toContain('─ 考慮不要（在庫は事前確保済み）')
  })

  it('notApplicable（理由なし）は ─ 考慮不要 だけ', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫引当', failures: { failed: { decision: 'notApplicable' } } },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('─ 考慮不要 |')
    expect(bodyRows(out)[0]).not.toContain('考慮不要（')
  })

  it('立っているのに未回答は（未定義）', () => {
    // ステップ1（応答待ちの呼出）は3問立ち、failed だけ答えている
    expect(bodyRows(sequenceToMarkdown(doc()))[0]).toContain('（未定義）')
  })

  it('立っていない問いは空セル（reply の3列すべて）', () => {
    // **ここが（未定義）と取り違えられやすい。** reply には問いが立たないので、
    // 「まだ決めていない」ではなく「問われていない」
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[2]).toBe('| 3 | 決済 → API | 与信OK |  |  |  |')
  })

  it('投げっぱなしは 結果不明 だけが埋まり、失敗確定と実行済みならは空', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[1]).toBe('| 2 | API → 決済 | 出荷指示 |  | 再送する |  |')
  })

  it('self は from → to 列を「名前（内部処理）」にし、結果不明と実行済みならは空', () => {
    const rows = bodyRows(sequenceToMarkdown(doc()))
    expect(rows[3]).toBe('| 4 | API（内部処理） | 在庫引当 | ─ 考慮不要（在庫は事前確保済み） |  |  |')
  })

  it('文言が空のステップは（未定義）', () => {
    const out = sequenceToMarkdown(
      doc({ steps: [{ id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '' }] }),
    )
    expect(bodyRows(out)[0]).toContain('| （未定義） |')
  })

  it('セルの | と改行はエスケープする（表が割れない）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa2', label: 'a|b', failures: { failed: { decision: 'handled', text: '1行目\n2行目' } } },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('a\\|b')
    expect(bodyRows(out)[0]).toContain('1行目<br>2行目')
  })
})

describe('sequenceToMarkdown: 壊れたデータ', () => {
  it('参照切れは表でも（未解決）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Zzzzzzzzz9', label: '与信依頼', awaitsReply: true },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('画面 → （未解決）')
  })

  it('to が無い call も表で（未解決）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', label: '宛先未定', awaitsReply: true },
        ],
      }),
    )
    expect(bodyRows(out)[0]).toContain('画面 → （未解決）')
  })

  it('行は1本も落とさない（4本のステップなら本文4行）', () => {
    const out = sequenceToMarkdown(
      doc({
        steps: doc().steps.map((s) => ({ ...s, from: 'actor_Zzzzzzzzz9' })),
      }),
    )
    expect(bodyRows(out)).toHaveLength(4)
  })

  it('ステップが0本でも見出し・図・表の見出し行は出る', () => {
    const out = sequenceToMarkdown(doc({ steps: [] }))
    expect(out).toContain('## 注文確定（在庫あり）')
    expect(out).toContain('```mermaid')
    expect(out).toContain('| No | from → to |')
    expect(bodyRows(out)).toHaveLength(0)
  })
})

describe('describeSequenceIssueEffect', () => {
  const issue = (rule: string): ConsistencyIssue => ({ rule, message: 'm', locations: [] })

  it('参照切れがあるときは（未解決）が図に立つことを言う', () => {
    const text = describeSequenceIssueEffect([issue('missing-actor')])
    expect(text).toContain('（未解決）')
    expect(text).toContain('表には全行がそのまま出ます')
  })

  it('to-mismatch でも同じ説明になる（どちらも（未解決）へ寄る）', () => {
    expect(describeSequenceIssueEffect([issue('to-mismatch')])).toContain('（未解決）')
  })

  it('参照に関わらない指摘だけのときは（未解決）に触れない', () => {
    // ID 重複や unposed-answer は図の宛先を壊さない。無関係な説明を出すと
    // 「（未解決）を探したのに無い」という空振りを読み手にさせる
    const text = describeSequenceIssueEffect([issue('duplicate-id'), issue('unposed-answer')])
    expect(text).not.toContain('（未解決）')
    expect(text).toContain('そのまま')
  })
})
