import { describe, expect, it } from 'vitest'
import { appRegistry } from '@/modules'
import { planExternalChange } from './external-change'
import { classifyFile } from './load'
import type { ProjectFile } from './project-file'
import type { ScanEntry, ScanResult } from './scan'

function glossaryText(title: string): string {
  return `{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "${title}",\n  "terms": []\n}\n`
}

function entry(name: string, text: string): ScanEntry {
  return {
    path: `C:\\proj\\${name}`,
    name,
    text,
    result: classifyFile(text, appRegistry),
  }
}

function listed(e: ScanEntry): ProjectFile {
  return { path: e.path, name: e.name, result: e.result, issues: [] }
}

function scan(entries: ScanEntry[], unreadable: string[] = []): ScanResult {
  return { entries, unreadable }
}

/** 台帳の引き当て（記録された内容 = アプリが最後に読み書きした内容） */
function ledger(pairs: Record<string, string>) {
  return (path: string) => pairs[path]
}

const A = entry('用語集.json', glossaryText('用語集'))
const A2 = entry('用語集.json', glossaryText('用語集（外部で変更）'))
const B = entry('メモ.json', glossaryText('メモ'))

describe('planExternalChange', () => {
  it('台帳と同じ内容なら変更なし（自己書き込みの構造的除外）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(false)
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.notices).toEqual([])
  })

  it('選択中ファイルが変わり未保存編集が無ければ再読込（退避テキスト付き）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A2]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(true)
    expect(plan.selected).toEqual({
      kind: 'reload',
      path: A.path,
      name: '用語集.json',
      // 退避は「取り込み前にディスクにあったバイト列」。再シリアライズではない
      stashText: A.text,
    })
    // 選択中ファイルの通知は呼び出し側が操作付きトーストとして出すので、ここには出さない
    expect(plan.notices).toEqual([])
    expect(plan.next[0].result).toEqual(A2.result)
  })

  it('選択中ファイルが変わり未保存編集があれば二択（ディスクの内容を渡す）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A2]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: true,
    })
    expect(plan.selected).toEqual({
      kind: 'ask',
      path: A.path,
      name: '用語集.json',
      // 上書き側が新しい baseline に使う（古い baseline のままだと
      // 「同じ内容だから書かない」に落ちて外部変更が残る）
      diskText: A2.text,
    })
  })

  it('選択中以外の変更は通知だけ（一覧の result は差し替える）', () => {
    const B2 = entry('メモ.json', glossaryText('メモ（外部で変更）'))
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A, B2]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.notices).toEqual(['外部の変更を読み込みました: メモ.json'])
    expect(plan.next[1].result).toEqual(B2.result)
  })

  it('増えたファイルは末尾に足して通知する（既存の並びを崩さない）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([B, A]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json', 'メモ.json'])
    expect(plan.notices).toEqual(['ファイルが増えました: メモ.json'])
  })

  it('選択中ファイルが消えたら gone', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([B]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'gone', path: A.path, name: '用語集.json' })
    expect(plan.next.map((f) => f.name)).toEqual(['メモ.json'])
    expect(plan.notices).toEqual([])
  })

  it('選択中以外が消えたら一覧から落として通知する', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json'])
    expect(plan.notices).toEqual(['ファイルが外部で削除されました: メモ.json'])
  })

  it('読めなかったファイルは消えた扱いにしない（一時的なロックで閉じない）', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A], [B.path]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: B.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(false)
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json', 'メモ.json'])
    expect(plan.notices).toEqual([])
  })

  it('台帳に記録の無い既知ファイルは変更として扱う（不変を証明できないものは拾う）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A]),
      knownText: ledger({}),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(true)
    expect(plan.notices).toEqual(['外部の変更を読み込みました: 用語集.json'])
  })
})
