// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectFile } from '@/core/project-file'
import { groupFiles } from '@/core/file-grouping'
import { appRegistry } from '@/modules'
import { FileList } from './FileList'

afterEach(cleanup)

function file(name: string, over: Partial<ProjectFile> = {}): ProjectFile {
  return {
    path: `C:\\proj\\${name}`,
    name,
    result: { status: 'editable', type: 'glossary', title: '用語集', data: {} },
    issues: [],
    ...over,
  }
}

function setup(
  files: ProjectFile[],
  projectOpen = true,
  existingTypes: readonly (string | null)[] = files.map((f) => f.result.type),
) {
  const handlers = { onSelect: vi.fn(), onCreate: vi.fn(), onDelete: vi.fn() }
  render(
    <FileList
      groups={groupFiles(files, appRegistry.list())}
      selectedPath={null}
      modules={appRegistry.list()}
      existingTypes={existingTypes}
      projectOpen={projectOpen}
      {...handlers}
    />,
  )
  return handlers
}

describe('FileList', () => {
  it('フォルダ未選択なら案内文だけを出す', () => {
    setup([], false)
    expect(screen.getByText(/プロジェクトフォルダを開くと/)).not.toBeNull()
    // ボタンのラベルは「＋ 用語集を新規作成」なので部分一致で引く
    expect(screen.queryByRole('button', { name: /用語集を新規作成/ })).toBeNull()
  })

  it('登録モジュールごとに新規作成ボタンを出す（type 選択。rev 6章）', () => {
    const { onCreate } = setup([])
    fireEvent.click(screen.getByRole('button', { name: /用語集を新規作成/ }))
    expect(onCreate).toHaveBeenCalledWith(appRegistry.get('glossary'))
  })

  it('ファイルが0件なら空状態を出す（ボタンは出したまま）', () => {
    setup([])
    expect(screen.getByText(/JSON ファイルがありません/)).not.toBeNull()
    expect(screen.getByRole('button', { name: /用語集を新規作成/ })).not.toBeNull()
  })

  it('行のクリックで onSelect を呼ぶ', () => {
    const { onSelect } = setup([file('用語集.json')])
    fireEvent.click(screen.getByRole('button', { name: '用語集（用語集.json） を開く' }))
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ name: '用語集.json' }))
  })

  it('開けないファイル・編集不可のファイルも一覧に出す', () => {
    setup([
      file('壊れた.json', {
        result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
      }),
      file('新版.json', {
        result: { status: 'listOnly', type: 'glossary', title: null, reason: '編集できない schemaVersion' },
      }),
    ])
    expect(screen.getByText('開けない')).not.toBeNull()
    expect(screen.getByText('編集不可')).not.toBeNull()
  })

  it('issues があれば件数バッジを出す', () => {
    setup([
      file('用語集.json', {
        issues: [{ rule: 'singleton-violation', message: '用語集が2件あります', locations: [] }],
      }),
    ])
    expect(screen.getByText('1')).not.toBeNull()
  })
})

describe('新規作成ボタンの単一性ゲート', () => {
  it('用語集が無ければ新規作成ボタンは押せる', () => {
    setup([], true, [])
    const button = screen.getByRole('button', { name: /用語集を新規作成/ })
    expect(button.hasAttribute('disabled')).toBe(false)
  })

  it('用語集が既にあれば新規作成ボタンは disabled になる', () => {
    setup([file('用語集.json')], true, ['glossary'])
    const button = screen.getByRole('button', { name: /用語集を新規作成/ })
    expect(button.hasAttribute('disabled')).toBe(true)
  })

  it('disabled のボタンをクリックしても onCreate は呼ばれない', () => {
    const { onCreate } = setup([file('用語集.json')], true, ['glossary'])
    fireEvent.click(screen.getByRole('button', { name: /用語集を新規作成/ }))
    expect(onCreate).not.toHaveBeenCalled()
  })

  it('開けない（rejected）用語集だけがあっても disabled になる（existingTypes は App.tsx と同じく status を問わず file.result.type から作る）', () => {
    // 第3引数を渡さず setup() の既定値（files.map(f => f.result.type)）に derivation させる。
    // App.tsx の existingTypes 算出（files.map(f => f.result.type)、status で絞らない）と
    // 同じ経路を通すことで、将来誰かが「rejected は type が定まらない開けないファイル
    // だから除外してよいはず」と考えて App.tsx 側を editable だけに絞った場合、
    // このテストが落ちる（ここでは第3引数で ['glossary'] を手渡ししていないので、
    // 絞り込みの影響がそのまま反映される）
    setup([
      file('壊れた.json', {
        result: {
          status: 'rejected',
          type: 'glossary',
          title: null,
          reason: 'スキーマ検証に失敗しました',
          errors: [],
        },
      }),
    ])
    const button = screen.getByRole('button', { name: /用語集を新規作成/ })
    expect(button.hasAttribute('disabled')).toBe(true)
  })
})

describe('削除', () => {
  it('行ごとの削除ボタンで onDelete を呼ぶ', () => {
    const { onDelete } = setup([file('用語集.json')])
    fireEvent.click(screen.getByRole('button', { name: '用語集（用語集.json） を削除' }))
    expect(onDelete).toHaveBeenCalledWith(expect.objectContaining({ name: '用語集.json' }))
  })

  it('開けないファイルにも削除ボタンを出す', () => {
    setup([
      file('壊れた.json', {
        result: { status: 'rejected', type: null, title: null, reason: 'JSON として解釈できません', errors: [] },
      }),
    ])
    expect(screen.getByRole('button', { name: '壊れた.json を削除' })).not.toBeNull()
  })
})

describe('行の説明（aria-describedby）', () => {
  // アクセシブル名は「<title>（<ファイル名>）を開く」。title は読まれるが、
  //「開けない」「編集不可」・issue 件数バッジは aria-describedby 側なので
  // 読まれない（M8 残件4 のうち title の部分だけが解消した）。
  const description = (name: string): string => {
    const button = screen.getByRole('button', { name: `${name} を開く` })
    const id = button.getAttribute('aria-describedby')
    expect(id).not.toBeNull()
    return document.getElementById(id as string)?.textContent ?? ''
  }

  it('タイトルが読まれる', () => {
    setup([file('用語集.json')])
    expect(description('用語集（用語集.json）')).toContain('用語集')
  })

  it('issue の件数が読まれる', () => {
    setup([
      file('用語集.json', {
        issues: [{ rule: 'singleton-violation', message: '用語集が2件あります', locations: [] }],
      }),
    ])
    expect(description('用語集（用語集.json）')).toContain('1')
  })

  it('開けないファイルは「開けない」が読まれる', () => {
    setup([
      file('壊れた.json', {
        result: {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        },
      }),
    ])
    expect(description('壊れた.json')).toContain('開けない')
  })
})

describe('種類の見出しとソート（M13）', () => {
  it('種類ごとに見出しを出す', () => {
    setup([
      file('シーケンス.json', {
        result: { status: 'editable', type: 'sequence', title: '受注フロー', data: {} },
      }),
      file('用語集.json'),
    ])
    expect(screen.getByRole('heading', { name: '用語集' })).not.toBeNull()
    expect(screen.getByRole('heading', { name: 'シーケンス' })).not.toBeNull()
  })

  it('行の主表示は title、副表示はファイル名', () => {
    setup([
      file('シーケンス-2.json', {
        result: { status: 'editable', type: 'sequence', title: '受注フロー', data: {} },
      }),
    ])
    expect(screen.getByText('受注フロー')).not.toBeNull()
    expect(screen.getByText('シーケンス-2.json')).not.toBeNull()
  })

  it('アクセシブル名に title とファイル名の両方が入る（同名の title があっても引ける）', () => {
    setup([
      file('a.json', { result: { status: 'editable', type: 'sequence', title: '同じ', data: {} } }),
      file('b.json', { result: { status: 'editable', type: 'sequence', title: '同じ', data: {} } }),
    ])
    expect(screen.getByRole('button', { name: '同じ（a.json） を開く' })).not.toBeNull()
    expect(screen.getByRole('button', { name: '同じ（b.json） を削除' })).not.toBeNull()
  })

  it('title が読めずファイル名に落ちたときは同じ文字列を2度言わない', () => {
    setup([
      file('メモ.json', {
        result: {
          status: 'rejected',
          type: null,
          title: null,
          reason: 'JSON として解釈できません',
          errors: [],
        },
      }),
    ])
    expect(screen.getByRole('button', { name: 'メモ.json を開く' })).not.toBeNull()
  })
})
