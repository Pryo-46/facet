// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ProjectFile } from '@/core/project-file'
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
      files={files}
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
    fireEvent.click(screen.getByRole('button', { name: /用語集\.json を開く/ }))
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
})

describe('削除', () => {
  it('行ごとの削除ボタンで onDelete を呼ぶ', () => {
    const { onDelete } = setup([file('用語集.json')])
    fireEvent.click(screen.getByRole('button', { name: '用語集.json を削除' }))
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
