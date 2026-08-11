// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 額縁レベルの DOM テスト。**このファイルが守っているのは1点だけ**——
 * 端末にフォーカスがある間、グローバル層（rev 10章）が Ctrl+Z を横取りしないこと。
 *
 * open-issues が「全ツールの Undo が同時に静かに壊れうる唯一の穴」と
 * 記録していた層で、ここに初めてテストが入る（M11）
 */

vi.mock('@/fs/project-fs', () => ({
  pickProjectFolder: async () => '/proj',
  listJsonFiles: async () => [],
  readProjectFile: async () => '',
  writeProjectFile: async () => undefined,
  fileExists: async () => false,
  moveFileToTrash: async () => undefined,
  joinPath: async (dir: string, name: string) => `${dir}/${name}`,
  watchFolder: async () => () => undefined,
  askSaveMarkdownPath: async () => null,
}))
vi.mock('@/fs/app-window', () => ({
  interceptClose: async () => () => undefined,
  forceClose: async () => undefined,
}))
vi.mock('@/fs/clipboard', () => ({ copyToClipboard: async () => undefined }))
vi.mock('@/fs/pty', () => ({
  tauriPtyIo: {
    spawn: async () => 1,
    write: async () => undefined,
    resize: async () => undefined,
    kill: async () => undefined,
  },
  killAllPtys: async () => undefined,
}))
vi.mock('@/fs/skill-resources', () => ({ tauriSkillSyncIo: {} }))
vi.mock('@/core/skill-sync', async (orig) => ({
  ...(await orig<typeof import('@/core/skill-sync')>()),
  syncBundledSkills: async () => undefined,
}))
// xterm は canvas を使うので jsdom では動かない。
// **アロー関数ではなく function式にすること**——TerminalTab は `new Terminal(...)`
// と `new FitAddon()` の形で呼ぶ。アロー関数は construct できないため、
// `vi.fn(() => ({...}))` のまま `new` すると「is not a constructor」で落ちる
vi.mock('@xterm/xterm', () => ({
  Terminal: vi.fn(function Terminal() {
    return {
      open: vi.fn(),
      write: vi.fn(),
      onData: vi.fn(),
      loadAddon: vi.fn(),
      dispose: vi.fn(),
      cols: 80,
      rows: 24,
    }
  }),
}))
vi.mock('@xterm/addon-fit', () => ({
  FitAddon: vi.fn(function FitAddon() {
    return { fit: vi.fn() }
  }),
}))

const App = (await import('./App')).default

afterEach(cleanup)

/**
 * 端末ペインの中の要素を返す。**`role="tablist"` は名乗っていない**
 *（TerminalPane.tsx のコメント参照。素の button + aria-pressed）ので、
 * セッションのタブボタン（ラベルは `Claude <連番>`。sessions.ts）で代用する
 */
async function openPane() {
  render(<App />)
  fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
  const toggle = await screen.findByRole('button', { name: 'Claude Code ペインを開く' })
  await waitFor(() => expect(toggle.hasAttribute('disabled')).toBe(false))
  fireEvent.click(toggle)
  return await screen.findByRole('button', { name: 'Claude 1' })
}

describe('グローバル層と端末ペインの境界', () => {
  it('**端末の中の Ctrl+Z は横取りしない**', async () => {
    const tab = await openPane()
    // fireEvent は preventDefault されていなければ true を返す
    const notPrevented = fireEvent.keyDown(tab, { key: 'z', ctrlKey: true })
    expect(notPrevented).toBe(true)
  })

  it('端末の外の Ctrl+Z は従来どおり横取りする', async () => {
    await openPane()
    const notPrevented = fireEvent.keyDown(document.body, { key: 'z', ctrlKey: true })
    expect(notPrevented).toBe(false)
  })

  it('端末の中の Ctrl+Shift+Z も横取りしない', async () => {
    const tab = await openPane()
    const notPrevented = fireEvent.keyDown(tab, { key: 'Z', ctrlKey: true, shiftKey: true })
    expect(notPrevented).toBe(true)
  })
})
