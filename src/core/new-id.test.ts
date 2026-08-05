import { describe, expect, it } from 'vitest'
import glossarySchema from '../../schemas/glossary.schema.json'
import { newId, type RandomBytes } from './new-id'

/** 決められたバイト列を順に返す乱数源（呼び出しごとに次の配列） */
function bytesFrom(...queue: number[][]): RandomBytes {
  let i = 0
  return () => new Uint8Array(queue[Math.min(i++, queue.length - 1)])
}

describe('newId', () => {
  it('prefix ＋ 62文字アルファベットの10文字を返す', () => {
    expect(newId('term', bytesFrom([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]))).toBe('term_ABCDEFGHIJ')
  })

  it('剰余の偏りを作らないため 248 以上のバイトは捨てる', () => {
    const id = newId(
      'term',
      bytesFrom([248, 249, 250, 251, 252, 253, 254, 255, 0, 1], [2, 3, 4, 5, 6, 7, 8, 9, 10, 11]),
    )
    expect(id).toBe('term_ABCDEFGHIJ')
  })

  it('スキーマの ID パターンに一致する（実際の乱数源で）', () => {
    const pattern = new RegExp(glossarySchema.$defs.term.properties.id.pattern)
    for (let i = 0; i < 50; i++) expect(newId('term')).toMatch(pattern)
  })

  it('連番ではない（同じ値を続けて返さない）', () => {
    const ids = new Set(Array.from({ length: 100 }, () => newId('term')))
    expect(ids.size).toBe(100)
  })
})
