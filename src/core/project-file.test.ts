import { describe, expect, it } from 'vitest'
import { computeIssues, fileName, type ProjectFile } from './project-file'
import { appRegistry } from '@/modules'

function editable(path: string): ProjectFile {
  return {
    path,
    name: fileName(path),
    result: {
      status: 'editable',
      type: 'glossary',
      title: '用語集',
      data: { schemaVersion: 1, type: 'glossary', title: '用語集', terms: [] },
    },
    issues: [],
  }
}

describe('fileName', () => {
  it('Windows の区切りでも POSIX の区切りでも末尾を返す', () => {
    expect(fileName('C:\\proj\\用語集.json')).toBe('用語集.json')
    expect(fileName('/home/p/用語集.json')).toBe('用語集.json')
  })
})

describe('computeIssues', () => {
  it('問題が無ければ issues は空', () => {
    const out = computeIssues([editable('C:\\proj\\用語集.json')], appRegistry)
    expect(out[0].issues).toEqual([])
  })

  it('用語集が2つあるとコア横断検証の単一性違反が両方に付く', () => {
    const out = computeIssues(
      [editable('C:\\proj\\a.json'), editable('C:\\proj\\b.json')],
      appRegistry,
    )
    expect(out.map((f) => f.issues.map((i) => i.rule))).toEqual([
      ['singleton-violation'],
      ['singleton-violation'],
    ])
  })

  it('モジュール内検証とコア横断検証の両方を連結する', () => {
    const dup: ProjectFile = {
      path: 'C:\\proj\\a.json',
      name: 'a.json',
      result: {
        status: 'editable',
        type: 'glossary',
        title: '用語集',
        data: {
          schemaVersion: 1,
          type: 'glossary',
          title: '用語集',
          terms: [
            { id: 'term_AAAAAAAAAA', name: '受注', kind: 'other', definition: 'x', aliases: [], notes: '' },
            { id: 'term_AAAAAAAAAA', name: '出荷', kind: 'other', definition: 'y', aliases: [], notes: '' },
          ],
        },
      },
      issues: [],
    }
    const out = computeIssues([dup, editable('C:\\proj\\b.json')], appRegistry)
    const rules = out[0].issues.map((i) => i.rule)
    // ID 重複（モジュール内検証）と単一性違反（コア横断検証）が両方載る
    expect(rules).toContain('singleton-violation')
    expect(rules.length).toBeGreaterThan(1)
  })
})
