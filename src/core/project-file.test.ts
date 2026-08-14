import { describe, expect, it } from 'vitest'
import { computeIssues, displayTitle, fileName, type ProjectFile } from './project-file'
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

describe('displayTitle', () => {
  function f(name: string, result: ProjectFile['result']): ProjectFile {
    return { path: `C:\\proj\\${name}`, name, result, issues: [] }
  }

  it('editable なら title を返す', () => {
    expect(
      displayTitle(f('シーケンス-2.json', { status: 'editable', type: 'sequence', title: '受注フロー', data: {} })),
    ).toBe('受注フロー')
  })

  it('editable で title が空文字なら (無題)', () => {
    expect(
      displayTitle(f('シーケンス-2.json', { status: 'editable', type: 'sequence', title: '', data: {} })),
    ).toBe('(無題)')
  })

  it('rejected でも title が読めていればそれを返す（スキーマ検証より前に読まれるため）', () => {
    expect(
      displayTitle(
        f('シーケンス-2.json', {
          status: 'rejected',
          type: 'sequence',
          title: '受注フロー',
          reason: 'スキーマ検証に失敗しました（このファイルは開けません）',
          errors: [],
        }),
      ),
    ).toBe('受注フロー')
  })

  it('title が null（パースすらできない）ならファイル名に落ちる', () => {
    expect(
      displayTitle(
        f('メモ.json', {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        }),
      ),
    ).toBe('メモ.json')
  })

  it('listOnly で title が空文字ならファイル名に落ちる', () => {
    expect(
      displayTitle(
        f('注文の状態遷移.json', {
          status: 'listOnly',
          type: 'stateMachine',
          title: '',
          reason: '編集できない schemaVersion',
        }),
      ),
    ).toBe('注文の状態遷移.json')
  })
})
