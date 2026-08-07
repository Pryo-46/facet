import { describe, expect, it, vi } from 'vitest'
import { appRegistry } from '@/modules'
import { scanFolder, toProjectFile } from './scan'

const glossaryText = `{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "用語集",\n  "terms": []\n}\n`

describe('scanFolder', () => {
  it('直下の JSON を読んで分類し、生テキストを持ち帰る', async () => {
    const io = {
      list: vi.fn(async () => ['C:\\proj\\用語集.json']),
      read: vi.fn(async () => glossaryText),
    }
    const scan = await scanFolder('C:\\proj', io, appRegistry)
    expect(scan.unreadable).toEqual([])
    expect(scan.entries).toHaveLength(1)
    expect(scan.entries[0].name).toBe('用語集.json')
    // 外部変更の判定はこの生テキストの一致で行うので、正規化してはいけない
    expect(scan.entries[0].text).toBe(glossaryText)
    expect(scan.entries[0].result.status).toBe('editable')
  })

  it('読めなかったファイルは unreadable に入り、entries には入らない', async () => {
    const io = {
      list: vi.fn(async () => ['C:\\proj\\a.json', 'C:\\proj\\b.json']),
      read: vi.fn(async (path: string) => {
        if (path.endsWith('b.json')) throw new Error('ロックされています')
        return glossaryText
      }),
    }
    const scan = await scanFolder('C:\\proj', io, appRegistry)
    expect(scan.entries.map((e) => e.path)).toEqual(['C:\\proj\\a.json'])
    expect(scan.unreadable).toEqual(['C:\\proj\\b.json'])
  })

  it('一覧の取得に失敗したら投げる（フォルダごと読めない状態は呼び出し側が扱う）', async () => {
    const io = {
      list: vi.fn(async () => {
        throw new Error('フォルダがありません')
      }),
      read: vi.fn(async () => glossaryText),
    }
    await expect(scanFolder('C:\\proj', io, appRegistry)).rejects.toThrow('フォルダがありません')
  })
})

describe('toProjectFile', () => {
  it('一覧の1件へ変換する（issues は computeIssues が埋める）', () => {
    const entry = {
      path: 'C:\\proj\\用語集.json',
      name: '用語集.json',
      text: glossaryText,
      result: { status: 'editable' as const, type: 'glossary', title: '用語集', data: {} },
    }
    expect(toProjectFile(entry)).toEqual({
      path: 'C:\\proj\\用語集.json',
      name: '用語集.json',
      result: entry.result,
      issues: [],
    })
  })
})
