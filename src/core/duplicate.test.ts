import { describe, expect, it } from 'vitest'
import { findDuplicates, groupByKey } from './duplicate'

describe('groupByKey', () => {
  it('全グループを返す（要素1個のものも含む）', () => {
    const got = groupByKey(['a', 'b', 'a'], (s) => s)
    expect([...got]).toEqual([
      ['a', [0, 2]],
      ['b', [1]],
    ])
  })

  it('キーの順は初出順、値は配列位置の昇順', () => {
    const got = groupByKey(['z', 'a', 'z', 'a'], (s) => s)
    expect([...got.keys()]).toEqual(['z', 'a'])
    expect(got.get('z')).toEqual([0, 2])
  })

  it('空配列は空の Map', () => {
    expect(groupByKey([], (s: string) => s).size).toBe(0)
  })
})

describe('findDuplicates', () => {
  it('2個以上のグループだけを返す', () => {
    const got = findDuplicates(['a', 'b', 'a'], (s) => s)
    expect([...got]).toEqual([['a', [0, 2]]])
  })

  it('重複が無ければ空の Map', () => {
    expect(findDuplicates(['a', 'b'], (s) => s).size).toBe(0)
  })

  it('正規化はコアが決めず keyOf に委ねる（同じ配列を別の規則で引ける）', () => {
    const items = [{ v: 'API' }, { v: 'ａｐｉ' }]
    // 完全一致では重複しない
    expect(findDuplicates(items, (i) => i.v).size).toBe(0)
    // 呼び出し側が正規化を入れれば重複する
    const fold = (s: string) => s.normalize('NFKC').toLowerCase()
    expect([...findDuplicates(items, (i) => fold(i.v))]).toEqual([['api', [0, 1]]])
  })

  it('3個以上の重複も1グループにまとまる', () => {
    expect(findDuplicates(['x', 'x', 'x'], (s) => s).get('x')).toEqual([0, 1, 2])
  })
})
