import { describe, expect, it } from 'vitest'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { escapeMermaidLabel, sequenceToMermaid } from './mermaid'

describe('escapeMermaidLabel', () => {
  it('明示改行は <br> にする（Mermaid のラベルは改行を含められない）', () => {
    expect(escapeMermaidLabel('与信を\n依頼する')).toBe('与信を<br>依頼する')
    expect(escapeMermaidLabel('a\r\nb\rc')).toBe('a<br>b<br>c')
  })

  it('# はエンティティ記法の開始文字なので #35; にする', () => {
    expect(escapeMermaidLabel('#1 の与信')).toBe('#35;1 の与信')
  })

  it('; は文の区切りに読まれうるので #59; にする', () => {
    expect(escapeMermaidLabel('確定;送信')).toBe('確定#59;送信')
  })

  it('# と ; が混ざっても二重エスケープしない（1パスで置換する）', () => {
    // **順に replace すると壊れる**: # → #35; の後に ; → #59; を掛けると
    // #35; が #35#59; になる。逆順でも #59; が #3559; になる。
    // 1回の走査で1文字ずつ置き換えることでのみ正しくなる
    expect(escapeMermaidLabel('#;')).toBe('#35;#59;')
    expect(escapeMermaidLabel('a#b;c')).toBe('a#35;b#59;c')
  })

  it('普通の日本語・英数字・コロンはそのまま（コロンは本文として通る）', () => {
    expect(escapeMermaidLabel('与信依頼: OK')).toBe('与信依頼: OK')
  })

  it('空文字は空文字のまま返す（置き換えは呼び出し側の仕事）', () => {
    expect(escapeMermaidLabel('')).toBe('')
  })
})

/**
 * 退化ケースを避けたフィクスチャ（lessons-for-planning）。
 * アクター3人・4種類のステップ（呼出／投げっぱなし／応答／内部処理）を混ぜる——
 * アクター2人や1種類だと「配列順で採番」と「出現順で採番」が同じ値になり、
 * 矢印の対応表も1本しか検査できない
 */
function doc(over: Partial<SequenceSchemaVersion1> = {}): SequenceSchemaVersion1 {
  return {
    schemaVersion: 1,
    type: 'sequence',
    title: '注文確定（在庫あり）',
    actors: [
      { id: 'actor_Aaaaaaaaa1', name: '画面' },
      { id: 'actor_Aaaaaaaaa2', name: 'API' },
      { id: 'actor_Aaaaaaaaa3', name: '決済' },
    ],
    steps: [
      { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '注文確定', awaitsReply: true },
      { id: 'step_Aaaaaaaaa2', kind: 'call', from: 'actor_Aaaaaaaaa2', to: 'actor_Aaaaaaaaa3', label: '出荷指示', awaitsReply: false },
      { id: 'step_Aaaaaaaaa3', kind: 'reply', from: 'actor_Aaaaaaaaa3', to: 'actor_Aaaaaaaaa2', label: '与信OK' },
      { id: 'step_Aaaaaaaaa4', kind: 'self', from: 'actor_Aaaaaaaaa2', label: '在庫引当' },
    ],
    ...over,
  }
}

describe('sequenceToMermaid', () => {
  it('participant を配列順に宣言し、4種類の矢印を導出する', () => {
    expect(sequenceToMermaid(doc())).toBe(
      [
        'sequenceDiagram',
        '    participant a1 as 画面',
        '    participant a2 as API',
        '    participant a3 as 決済',
        '    a1->>a2: 注文確定',
        '    a2-)a3: 出荷指示',
        '    a3-->>a2: 与信OK',
        '    a2->>a2: 在庫引当',
      ].join('\n'),
    )
  })

  it('参照切れの to は（未解決）アクターへ向け、行は落とさない', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Zzzzzzzzz9', label: '与信依頼', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('participant unresolved as （未解決）')
    expect(out).toContain('a1->>unresolved: 与信依頼')
  })

  it('call なのに to が無い行も（未解決）へ向ける（a1->>: は構文エラーになる）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', label: '宛先未定', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>unresolved: 宛先未定')
  })

  it('（未解決）の participant は、使われたときだけ宣言する', () => {
    expect(sequenceToMermaid(doc())).not.toContain('unresolved')
  })

  it('（未解決）の participant は最後に宣言する（既存の列順を動かさない）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Zzzzzzzzz9', to: 'actor_Aaaaaaaaa3', label: '謎', awaitsReply: true },
        ],
      }),
    )
    const lines = out.split('\n')
    expect(lines.indexOf('    participant unresolved as （未解決）')).toBeGreaterThan(
      lines.indexOf('    participant a3 as 決済'),
    )
  })

  it('文言が空のステップは（未定義）と書く（空の本文は Mermaid で壊れうる）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>a2: （未定義）')
  })

  it('名前が空のアクターも（未定義）と書く（participant a1 as  は壊れる）', () => {
    const out = sequenceToMermaid(
      doc({ actors: [{ id: 'actor_Aaaaaaaaa1', name: '' }], steps: [] }),
    )
    expect(out).toContain('participant a1 as （未定義）')
  })

  it('ラベルはエスケープを通す', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'call', from: 'actor_Aaaaaaaaa1', to: 'actor_Aaaaaaaaa2', label: '#1 を\n送る', awaitsReply: true },
        ],
      }),
    )
    expect(out).toContain('a1->>a2: #35;1 を<br>送る')
  })

  it('ID が重複しているアクターは先頭の1つだけが採番を持つ（logic-tree の ID 重複と同じ扱い）', () => {
    const out = sequenceToMermaid(
      doc({
        actors: [
          { id: 'actor_Aaaaaaaaa1', name: '画面' },
          { id: 'actor_Aaaaaaaaa1', name: '画面（重複）' },
        ],
        steps: [
          { id: 'step_Aaaaaaaaa1', kind: 'self', from: 'actor_Aaaaaaaaa1', label: '処理' },
        ],
      }),
    )
    expect(out).toContain('a1->>a1: 処理')
  })

  it('self は to を持っていても無視して from へ向ける（外部ファイル等が持ちうる部分状態）', () => {
    const out = sequenceToMermaid(
      doc({
        steps: [
          {
            id: 'step_Aaaaaaaaa1',
            kind: 'self',
            from: 'actor_Aaaaaaaaa2',
            to: 'actor_Aaaaaaaaa3',
            label: '在庫引当',
          },
        ],
      }),
    )
    expect(out).toContain('a2->>a2: 在庫引当')
  })

  it('アクターもステップも無いときは sequenceDiagram の1行だけ', () => {
    expect(sequenceToMermaid(doc({ actors: [], steps: [] }))).toBe('sequenceDiagram')
  })
})
