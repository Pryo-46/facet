import { expect, it } from 'vitest'
import { rowRef } from './row-ref'

it('配列位置を 1 始まりの #N にする（No 列の値と一致）', () => {
  expect(rowRef(0)).toBe('#1')
  expect(rowRef(9)).toBe('#10')
})
