import { describe, expect, it } from 'vitest'
import type { Condition, Row } from '@/types/decision-table'
import {
  axesById,
  identityAxes,
  outcomeFromById,
  productSize,
  rebuildRows,
  valueIndicesAt,
  type Axis,
} from './rows'

const cond = (id: string, name: string, values: string[]): Condition => ({ id, name, values })
const row = (values: string[], results: string[], impossible = false): Row => ({
  values,
  impossible,
  results,
})

/** 会員か × 5000円以上か の2条件・結果1本 */
const TWO: Condition[] = [
  cond('cond_Aaaaaaaaa1', '会員か', ['はい', 'いいえ']),
  cond('cond_Aaaaaaaaa2', '5000円以上か', ['はい', 'いいえ']),
]
const TWO_ROWS: Row[] = [
  row(['はい', 'はい'], ['無料']),
  row(['はい', 'いいえ'], ['無料']),
  row(['いいえ', 'はい'], ['無料']),
  row(['いいえ', 'いいえ'], ['500円']),
]

describe('直積の大きさ', () => {
  it('条件が0本なら行も0本', () => {
    expect(productSize([])).toBe(0)
  })

  it('値の本数の積になる', () => {
    expect(productSize(TWO)).toBe(4)
    expect(productSize([...TWO, cond('cond_Aaaaaaaaa3', '会員種別', ['金', '銀', '銅'])])).toBe(12)
  })

  it('値を持たない条件があると0本', () => {
    expect(productSize([cond('cond_Aaaaaaaaa1', '空', [])])).toBe(0)
  })
})

describe('直積の位置と値の添字', () => {
  it('左端の条件が最もゆっくり回る', () => {
    expect(valueIndicesAt(TWO, 0)).toEqual([0, 0])
    expect(valueIndicesAt(TWO, 1)).toEqual([0, 1])
    expect(valueIndicesAt(TWO, 2)).toEqual([1, 0])
    expect(valueIndicesAt(TWO, 3)).toEqual([1, 1])
  })
})

describe('行の再構築', () => {
  it('条件を触らなければ行も結果も変わらない', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [0])
    expect(built.rows).toEqual(TWO_ROWS)
    expect(built.clearedCells).toBe(0)
    expect(built.lostCells).toBe(0)
  })

  it('条件を足すと行が増え、既存の結果が複製される', () => {
    const next = [...TWO, cond('cond_Aaaaaaaaa3', 'キャンペーン中か', ['はい', 'いいえ'])]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toHaveLength(8)
    expect(built.rows[0]).toEqual(row(['はい', 'はい', 'はい'], ['無料']))
    expect(built.rows[1]).toEqual(row(['はい', 'はい', 'いいえ'], ['無料']))
    expect(built.rows[6]).toEqual(row(['いいえ', 'いいえ', 'はい'], ['500円']))
    expect(built.lostCells).toBe(0)
  })

  it('値を足すとその値の行だけ空から始まる', () => {
    const next: Condition[] = [
      cond('cond_Aaaaaaaaa1', '会員か', ['はい', 'いいえ', '退会済み']),
      TWO[1],
    ]
    const axes: Axis[] = [{ from: 0, valueFrom: [0, 1, null] }, { from: 1, valueFrom: [0, 1] }]
    const built = rebuildRows(TWO, TWO_ROWS, next, axes, [0])
    expect(built.rows).toHaveLength(6)
    expect(built.rows[0].results).toEqual(['無料'])
    expect(built.rows[4]).toEqual(row(['退会済み', 'はい'], ['']))
    expect(built.rows[5]).toEqual(row(['退会済み', 'いいえ'], ['']))
    expect(built.lostCells).toBe(0)
  })

  it('値を消すとその値の行が消え、記入済みだった結果が失われる', () => {
    const next: Condition[] = [cond('cond_Aaaaaaaaa1', '会員か', ['はい']), TWO[1]]
    const axes: Axis[] = [{ from: 0, valueFrom: [0] }, { from: 1, valueFrom: [0, 1] }]
    const built = rebuildRows(TWO, TWO_ROWS, next, axes, [0])
    expect(built.rows).toEqual([row(['はい', 'はい'], ['無料']), row(['はい', 'いいえ'], ['無料'])])
    expect(built.clearedCells).toBe(0)
    expect(built.lostCells).toBe(2)
  })

  it('条件を消して結果が一致するなら、そのまま残る', () => {
    // 「5000円以上か」を消す。会員＝はい の2行はどちらも無料なので食い違わない
    const next = [TWO[0]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows[0]).toEqual(row(['はい'], ['無料']))
    expect(built.rows[1]).toEqual(row(['いいえ'], ['']))
    expect(built.clearedCells).toBe(1)
    // 4件のうち、会員＝はい の2件が「無料」として1つの行へ残る
    expect(built.lostCells).toBe(2)
  })

  it('条件を消して結果が食い違うと空欄に落ちる', () => {
    // 「会員か」を消す。5000円以上＝いいえ の2行は 無料 と 500円 で食い違う
    const next = [TWO[1]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toEqual([row(['はい'], ['無料']), row(['いいえ'], [''])])
    expect(built.clearedCells).toBe(1)
    expect(built.lostCells).toBe(2)
  })

  it('起こりえない旗も食い違えば偽に落ちる', () => {
    const prevRows: Row[] = [
      row(['はい', 'はい'], ['無料'], true),
      row(['はい', 'いいえ'], ['無料'], false),
      row(['いいえ', 'はい'], ['無料'], true),
      row(['いいえ', 'いいえ'], ['無料'], true),
    ]
    const next = [TWO[1]]
    const built = rebuildRows(TWO, prevRows, next, axesById(TWO, next), [0])
    expect(built.rows[0].impossible).toBe(true)
    expect(built.rows[1].impossible).toBe(false)
  })

  it('条件を並び替えても結果は座標で追いつく', () => {
    const next = [TWO[1], TWO[0]]
    const built = rebuildRows(TWO, TWO_ROWS, next, axesById(TWO, next), [0])
    expect(built.rows).toEqual([
      row(['はい', 'はい'], ['無料']),
      row(['はい', 'いいえ'], ['無料']),
      row(['いいえ', 'はい'], ['無料']),
      row(['いいえ', 'いいえ'], ['500円']),
    ])
    expect(built.lostCells).toBe(0)
  })

  it('結果を足すと列が空で増える', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [0, null])
    expect(built.rows[0].results).toEqual(['無料', ''])
    expect(built.lostCells).toBe(0)
  })

  it('結果を消すとその列の記入済みが失われる', () => {
    const built = rebuildRows(TWO, TWO_ROWS, TWO, identityAxes(TWO), [])
    expect(built.rows[0].results).toEqual([])
    expect(built.lostCells).toBe(4)
  })

  it('直積より行が少ないファイルでも、位置で引けた行の結果だけが残る', () => {
    const broken: Row[] = [row(['はい', 'はい'], ['無料'])]
    const built = rebuildRows(TWO, broken, TWO, identityAxes(TWO), [0])
    expect(built.rows).toHaveLength(4)
    expect(built.rows[0].results).toEqual(['無料'])
    expect(built.rows[3].results).toEqual([''])
    expect(built.lostCells).toBe(0)
  })

  it('条件を全部消すと行も消える', () => {
    const built = rebuildRows(TWO, TWO_ROWS, [], [], [0])
    expect(built.rows).toEqual([])
    expect(built.lostCells).toBe(4)
  })
})

describe('対応づけ', () => {
  it('id が一致する条件を引き当て、無い条件は新設として null を返す', () => {
    const next = [TWO[1], cond('cond_Aaaaaaaaa9', '新しい条件', ['はい', 'いいえ'])]
    expect(axesById(TWO, next)).toEqual([
      { from: 1, valueFrom: [0, 1] },
      { from: null, valueFrom: [] },
    ])
  })

  it('結果も id で引き当てる', () => {
    const prev = [{ id: 'out_Aaaaaaaaa1' }, { id: 'out_Aaaaaaaaa2' }]
    expect(outcomeFromById(prev, [{ id: 'out_Aaaaaaaaa2' }, { id: 'out_Aaaaaaaaa9' }])).toEqual([
      1,
      null,
    ])
  })
})
