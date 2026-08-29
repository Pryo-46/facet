import { describe, expect, it } from 'vitest'
import { fileReference, fileReferences } from './file-reference'

const DIR = 'C:\\Dev\\Projects\\facet'

describe('fileReference', () => {
  it('プロジェクト配下は @相対パス（区切りは / ・末尾にスペース）', () => {
    // 末尾のスペースは「続けて文が打てる」ため。claude の cwd は projectDir
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\docs\\用語集.json')).toBe(
      '@docs/用語集.json ',
    )
  })

  it('直下のファイルも @ が付く', () => {
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\README.md')).toBe('@README.md ')
  })

  it('大文字小文字が違っても配下と判定する（Windows のパスは区別しない）', () => {
    expect(fileReference(DIR, 'c:\\dev\\projects\\FACET\\docs\\a.json')).toBe('@docs/a.json ')
  })

  it('返す相対パスは元の綴りのまま（判定のための正規化を出力へ持ち込まない）', () => {
    expect(fileReference(DIR, 'C:\\Dev\\Projects\\facet\\Docs\\Aa.json')).toBe('@Docs/Aa.json ')
  })

  it('projectDir の末尾に区切りがあっても同じ', () => {
    expect(fileReference('C:\\Dev\\Projects\\facet\\', 'C:\\Dev\\Projects\\facet\\a.json')).toBe(
      '@a.json ',
    )
  })

  it('プロジェクトの外は @ を付けず素の絶対パスを返す', () => {
    // @ は cwd 相対のファイル参照。Windows の絶対パス（コロンとバックスラッシュを
    // 含む）が @ の後ろで解決する保証がないので、素の絶対パスを本文へ置く
    expect(fileReference(DIR, 'D:\\会議資料\\議事録.md')).toBe('D:\\会議資料\\議事録.md ')
  })

  it('前方一致だけで判定しない（似た名前の隣のフォルダは外）', () => {
    expect(fileReference('C:\\proj', 'C:\\project\\a.json')).toBe('C:\\project\\a.json ')
  })

  it('projectDir そのものは配下ではない', () => {
    expect(fileReference(DIR, DIR)).toBe(`${DIR} `)
  })

  it('POSIX の区切りでも動く（テストは node で走るので mac も通る）', () => {
    expect(fileReference('/home/me/proj', '/home/me/proj/docs/a.json')).toBe('@docs/a.json ')
  })
})

describe('fileReferences', () => {
  it('複数ファイルを連結する（各要素が末尾スペースを持つので区切りは入れない）', () => {
    expect(
      fileReferences(DIR, [
        'C:\\Dev\\Projects\\facet\\a.json',
        'C:\\Dev\\Projects\\facet\\docs\\b.json',
      ]),
    ).toBe('@a.json @docs/b.json ')
  })

  it('空の配列は空文字', () => {
    expect(fileReferences(DIR, [])).toBe('')
  })
})
