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
