import { describe, expect, it } from 'vitest'
import {
  canonicalPath,
  duplicatedNames,
  folderName,
  normalizeProjects,
  sortProjects,
  touchProject,
  type RegisteredProject,
} from './projects'

const EPOCH = '1970-01-01T00:00:00.000Z'

const project = (over: Partial<RegisteredProject> = {}): RegisteredProject => ({
  path: 'C:\\work\\a',
  name: 'a',
  favorite: false,
  lastOpenedAt: EPOCH,
  ...over,
})

describe('canonicalPath', () => {
  it('ルート単体は潰さずそのまま返す', () => {
    expect(canonicalPath('/')).toBe('/')
    expect(canonicalPath('C:\\')).toBe('C:\\')
  })

  it('多階層のパスは末尾の区切りだけを落とす', () => {
    expect(canonicalPath('/home/me/juchu/')).toBe('/home/me/juchu')
    expect(canonicalPath('C:\\work\\juchu\\')).toBe('C:\\work\\juchu')
  })
})

describe('folderName', () => {
  it('Windows の区切りで末尾を取る', () => {
    expect(folderName('C:\\work\\juchu')).toBe('juchu')
  })

  it('POSIX の区切りで末尾を取る', () => {
    expect(folderName('/home/me/juchu')).toBe('juchu')
  })

  it('末尾に区切りが付いていても末尾の名前を取る', () => {
    expect(folderName('/home/me/juchu/')).toBe('juchu')
    expect(folderName('C:\\work\\juchu\\')).toBe('juchu')
  })

  it('区切りを含まない入力はそのまま返す', () => {
    expect(folderName('juchu')).toBe('juchu')
  })
})

describe('normalizeProjects', () => {
  it('配列でない入力は空配列', () => {
    expect(normalizeProjects(null)).toEqual([])
    expect(normalizeProjects({ path: 'C:\\work\\a' })).toEqual([])
    expect(normalizeProjects('C:\\work\\a')).toEqual([])
  })

  it('path が空文字列の要素を落とす', () => {
    // 空パスは allow_project_dir で fs の実行時 scope をルート全体へ広げる
    expect(normalizeProjects([{ path: '', name: 'a' }])).toEqual([])
  })

  it('path が文字列でない要素を落とす', () => {
    expect(normalizeProjects([{ path: 3 }, { name: 'a' }, null, 'x'])).toEqual([])
  })

  it('name が無ければフォルダ名で埋める', () => {
    expect(normalizeProjects([{ path: 'C:\\work\\juchu' }])).toEqual([
      { path: 'C:\\work\\juchu', name: 'juchu', favorite: false, lastOpenedAt: EPOCH },
    ])
  })

  it('name が空文字列でもフォルダ名で埋める', () => {
    expect(normalizeProjects([{ path: '/home/me/zaiko', name: '' }])[0].name).toBe('zaiko')
  })

  it('favorite と lastOpenedAt の型違いを既定で埋める', () => {
    const [only] = normalizeProjects([
      { path: 'C:\\work\\a', name: 'a', favorite: 'yes', lastOpenedAt: 5 },
    ])
    expect(only.favorite).toBe(false)
    expect(only.lastOpenedAt).toBe(EPOCH)
  })

  it('path が重なる要素は先に現れた方を残す', () => {
    const got = normalizeProjects([
      { path: 'C:\\work\\a', name: '先' },
      { path: 'C:\\work\\a', name: '後' },
    ])
    expect(got.map((p) => p.name)).toEqual(['先'])
  })

  it('末尾の区切りを落として同一性を揃える', () => {
    const got = normalizeProjects([
      { path: 'C:\\work\\a\\', name: '先' },
      { path: 'C:\\work\\a', name: '後' },
    ])
    expect(got).toEqual([
      { path: 'C:\\work\\a', name: '先', favorite: false, lastOpenedAt: EPOCH },
    ])
  })
})

describe('sortProjects', () => {
  it('お気に入りを先に置き、どちらの群も最終オープンの降順にする', () => {
    const got = sortProjects([
      project({ path: 'p1', name: '普通の古い', lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
      project({ path: 'p2', name: 'お気に入りの古い', favorite: true, lastOpenedAt: '2026-01-02T00:00:00.000Z' }),
      project({ path: 'p3', name: '普通の新しい', lastOpenedAt: '2026-03-01T00:00:00.000Z' }),
      project({ path: 'p4', name: 'お気に入りの新しい', favorite: true, lastOpenedAt: '2026-03-02T00:00:00.000Z' }),
    ])
    expect(got.map((p) => p.name)).toEqual([
      'お気に入りの新しい',
      'お気に入りの古い',
      '普通の新しい',
      '普通の古い',
    ])
  })

  it('入力の配列を書き換えない', () => {
    const input = [
      project({ path: 'p1', lastOpenedAt: '2026-01-01T00:00:00.000Z' }),
      project({ path: 'p2', lastOpenedAt: '2026-03-01T00:00:00.000Z' }),
    ]
    sortProjects(input)
    expect(input.map((p) => p.path)).toEqual(['p1', 'p2'])
  })
})

describe('touchProject', () => {
  const NOW = '2026-05-05T00:00:00.000Z'

  it('登録済みのパスは最終オープンだけを更新する', () => {
    const got = touchProject(
      [project({ path: 'C:\\work\\a', name: '手で付けた名前', favorite: true })],
      'C:\\work\\a',
      NOW,
    )
    expect(got).toEqual([
      { path: 'C:\\work\\a', name: '手で付けた名前', favorite: true, lastOpenedAt: NOW },
    ])
  })

  it('未登録のパスはフォルダ名を表示名として足す', () => {
    const got = touchProject([], 'C:\\work\\juchu', NOW)
    expect(got).toEqual([
      { path: 'C:\\work\\juchu', name: 'juchu', favorite: false, lastOpenedAt: NOW },
    ])
  })

  it('末尾に区切りが付いたパスを別の登録として足さない', () => {
    const got = touchProject([project({ path: 'C:\\work\\a' })], 'C:\\work\\a\\', NOW)
    expect(got).toHaveLength(1)
    expect(got[0].lastOpenedAt).toBe(NOW)
  })
})

describe('duplicatedNames', () => {
  it('2件以上が同じ表示名を持つときだけその名前を返す', () => {
    const got = duplicatedNames([
      project({ path: 'p1', name: '検証用' }),
      project({ path: 'p2', name: '検証用' }),
      project({ path: 'p3', name: '受注' }),
    ])
    expect([...got]).toEqual(['検証用'])
  })

  it('重なりが無ければ空', () => {
    expect(duplicatedNames([project({ path: 'p1', name: 'a' })]).size).toBe(0)
  })
})
