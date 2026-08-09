import { describe, expect, it, vi } from 'vitest'
import { fileNameCandidate, MAX_NAME_CANDIDATES, resolveAvailableFileName } from './file-naming'

describe('fileNameCandidate', () => {
  it('1件目は連番を付けない', () => {
    expect(fileNameCandidate('用語集', 1)).toBe('用語集.json')
  })

  it('2件目以降は連番を足す', () => {
    expect(fileNameCandidate('用語集', 2)).toBe('用語集-2.json')
    expect(fileNameCandidate('用語集', 10)).toBe('用語集-10.json')
  })

  it('ファイル名に使えない文字を落とす', () => {
    expect(fileNameCandidate('用語:集/一覧', 1)).toBe('用語_集_一覧.json')
  })
})

describe('resolveAvailableFileName', () => {
  it('空いていれば連番なしの名前を返す', async () => {
    await expect(resolveAvailableFileName('用語集', () => false)).resolves.toBe('用語集.json')
  })

  it('使われている名前を飛ばして連番を進める', async () => {
    const taken = new Set(['用語集.json', '用語集-2.json'])
    await expect(resolveAvailableFileName('用語集', (n) => taken.has(n))).resolves.toBe(
      '用語集-3.json',
    )
  })

  it('isTaken が Promise を返してもよい（ディスクへの問い合わせを渡すため）', async () => {
    const isTaken = vi.fn(async (name: string) => name === '用語集.json')
    await expect(resolveAvailableFileName('用語集', isTaken)).resolves.toBe('用語集-2.json')
    expect(isTaken).toHaveBeenCalledTimes(2)
  })

  it('候補を使い切ったら投げる（無限ループにしない）', async () => {
    const isTaken = vi.fn(() => true)
    await expect(resolveAvailableFileName('用語集', isTaken)).rejects.toThrow(
      /ファイル名の候補が尽きました/,
    )
    expect(isTaken).toHaveBeenCalledTimes(MAX_NAME_CANDIDATES)
  })
})

describe('Windows で作れない名前', () => {
  it('予約デバイス名は先頭に _ を足して避ける', () => {
    // CON.json / NUL.json は拡張子を付けても予約のまま。作成に失敗する
    for (const name of ['CON', 'con', 'PRN', 'AUX', 'NUL', 'COM1', 'LPT9']) {
      expect(fileNameCandidate(name, 1)).toBe(`_${name}.json`)
    }
  })

  it('予約語を含むだけの名前は避けない', () => {
    expect(fileNameCandidate('CONTENT', 1)).toBe('CONTENT.json')
    expect(fileNameCandidate('用語集CON', 1)).toBe('用語集CON.json')
  })

  it('末尾のドットと空白を落とす（Windows が黙って落とすため）', () => {
    expect(fileNameCandidate('用語集...', 1)).toBe('用語集.json')
    expect(fileNameCandidate('用語集 ', 1)).toBe('用語集.json')
    expect(fileNameCandidate('用語集. .', 1)).toBe('用語集.json')
  })

  it('落とした結果が空になったら _ にする', () => {
    expect(fileNameCandidate('...', 1)).toBe('_.json')
  })

  it('連番は避けた後の名前に付く', () => {
    expect(fileNameCandidate('CON', 2)).toBe('_CON-2.json')
  })
})
