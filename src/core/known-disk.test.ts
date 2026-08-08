import { describe, expect, it } from 'vitest'
import { createKnownDisk } from './known-disk'

describe('createKnownDisk', () => {
  it('記録した内容を引ける', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', '{}\n')
    expect(known.get('C:\\proj\\a.json')).toBe('{}\n')
    expect(known.get('C:\\proj\\b.json')).toBeUndefined()
  })

  it('delete で1件落とせる', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', '{}\n')
    known.delete('C:\\proj\\a.json')
    expect(known.get('C:\\proj\\a.json')).toBeUndefined()
  })

  it('retain は渡されたパス以外を落とす（走査結果に合わせる）', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', 'A')
    known.set('C:\\proj\\b.json', 'B')
    known.retain(['C:\\proj\\a.json'])
    expect(known.get('C:\\proj\\a.json')).toBe('A')
    expect(known.get('C:\\proj\\b.json')).toBeUndefined()
  })

  it('clear は全部落とす（フォルダを切り替えたとき）', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', 'A')
    known.clear()
    expect(known.get('C:\\proj\\a.json')).toBeUndefined()
  })
})
