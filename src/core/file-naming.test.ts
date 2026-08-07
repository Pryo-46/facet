import { describe, expect, it } from 'vitest'
import { resolveNewFileName } from './file-naming'

describe('resolveNewFileName', () => {
  it('衝突が無ければ連番を付けない', () => {
    expect(resolveNewFileName('用語集', [])).toBe('用語集.json')
  })

  it('衝突したら 2 から連番を足す', () => {
    expect(resolveNewFileName('用語集', ['用語集.json'])).toBe('用語集-2.json')
    expect(resolveNewFileName('用語集', ['用語集.json', '用語集-2.json'])).toBe('用語集-3.json')
  })

  it('連番に穴があいていれば小さい方から埋める', () => {
    expect(resolveNewFileName('用語集', ['用語集-2.json'])).toBe('用語集.json')
  })

  it('大文字小文字違いも衝突として扱う（Windows のファイル名は大文字小文字を区別しない）', () => {
    expect(resolveNewFileName('glossary', ['GLOSSARY.JSON'])).toBe('glossary-2.json')
  })

  it('ファイル名に使えない文字を落とす', () => {
    expect(resolveNewFileName('用語:集/一覧', [])).toBe('用語_集_一覧.json')
  })

  it('関係ないファイル名は衝突とみなさない', () => {
    expect(resolveNewFileName('用語集', ['メモ.json', '用語集の下書き.json'])).toBe('用語集.json')
  })
})
