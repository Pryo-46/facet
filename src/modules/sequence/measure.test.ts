import { describe, expect, it } from 'vitest'
import { gutterLabelText } from './measure'

/**
 * ラベル列の文字列を組み立てる唯一の口。**描画（GutterSlot）と行高の測定
 * （SequenceEditor の questionHeight）が同じ戻り値を見る**ための関数なので、
 * ここが1文字ずれると折り返し回数を見誤り、長い問いが下の行へ食い込む
 */
describe('gutterLabelText', () => {
  it('インデントする問い（ifExecuted）は「└ 」を前置する', () => {
    expect(gutterLabelText('実行済みだったら？', true)).toBe('└ 実行済みだったら？')
  })

  it('インデントしない問いは素の文言をそのまま返す', () => {
    expect(gutterLabelText('処理失敗したら？', false)).toBe('処理失敗したら？')
  })

  it('接頭辞は2文字ぶんだけ伸びる（測定側が見込む余裕の根拠）', () => {
    const bare = '結果不明だったら？'
    expect(gutterLabelText(bare, true).length).toBe(bare.length + 2)
  })

  it('空文言でも接頭の有無だけで決まる（呼び出し側の空弾きに依存しない）', () => {
    expect(gutterLabelText('', true)).toBe('└ ')
    expect(gutterLabelText('', false)).toBe('')
  })
})
