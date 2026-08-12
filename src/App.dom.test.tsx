// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

/**
 * 額縁レベルの DOM テスト。**このファイルが守っているのは1点だけ**——
 * 端末にフォーカスがある間、グローバル層（rev 10章）が Ctrl+Z を横取りしないこと。
 *
 * open-issues が「全ツールの Undo が同時に静かに壊れうる唯一の穴」と
 * 記録していた層で、ここに初めてテストが入る（M11）
 */

/**
 * `interceptClose` に渡された beforeClose コールバックを掴んでおくための共有状態。
 * `killAllPtysMock` は同じ理由でスパイ化する。`requestCloseOverride` は
 * 「閉じる／閉じない」を直接テストから制御するための差し込み口——
 * 実際に flush 失敗や回答待ちの二択を仕込んで false を再現すると、この
 * ファイルが読み込みを一切モックしていない（`listJsonFiles` が常に `[]`）
 * 前提と噛み合わず遠回りになる。`vi.mock` はホイストされるので、
 * ファクトリから参照する可変状態は `vi.hoisted` で作る
 */
/**
 * `ptyExitHandlers` は spawn ごとに `onExit` を捕まえておく口。「確認待ちの
 * 間にタブが自然終了した」状況をテストから直接作るために使う——タブを閉じる
 * 確認ダイアログの `onConfirm` が古い state を掴まないことを検証するテスト
 * （レビュー指摘2）専用で、それ以外のテストは呼ばない
 */
const { closeState, killAllPtysMock, requestCloseOverride, ptyKillMock, ptyExitHandlers } =
  vi.hoisted(() => ({
    closeState: { callback: null as (() => Promise<boolean>) | null },
    killAllPtysMock: vi.fn(async () => undefined),
    requestCloseOverride: { value: null as boolean | null },
    ptyKillMock: vi.fn(async () => undefined),
    ptyExitHandlers: new Map<number, (code: number | null) => void>(),
  }))

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
  interceptClose: async (beforeClose: () => Promise<boolean>) => {
    closeState.callback = beforeClose
    return () => undefined
  },
  forceClose: async () => undefined,
}))
vi.mock('@/fs/clipboard', () => ({ copyToClipboard: async () => undefined }))
vi.mock('@/fs/pty', () => ({
  tauriPtyIo: {
    // spec 全体（program/args/cwd/cols/rows/onData/onExit）のうち、ここでは
    // `onExit` だけ捕まえる。連番の ptyId を振るのは既存テストの前提
    //（呼び出し引数の中身は見ない）を崩さないため
    spawn: async (spec: { onExit: (code: number | null) => void }) => {
      const id = ptyExitHandlers.size + 1
      ptyExitHandlers.set(id, spec.onExit)
      return id
    },
    write: async () => undefined,
    resize: async () => undefined,
    kill: ptyKillMock,
  },
  killAllPtys: killAllPtysMock,
}))
vi.mock('@/fs/skill-resources', () => ({ tauriSkillSyncIo: {} }))
vi.mock('@/core/skill-sync', async (orig) => ({
  ...(await orig<typeof import('@/core/skill-sync')>()),
  syncBundledSkills: async () => undefined,
}))
// `requestClose` の結果をテストから直接差し込むための薄いラッパー。
// **他のメソッドは実物のまま**——フォルダ切替テストが依存する openFolder の
// 挙動まで差し替えると、この1点のためにそちら側のテストが壊れる
vi.mock('@/core/app-controller', async (orig) => {
  const mod = await orig<typeof import('@/core/app-controller')>()
  return {
    ...mod,
    createAppController: (...args: Parameters<typeof mod.createAppController>) => {
      const controller = mod.createAppController(...args)
      return {
        ...controller,
        requestClose: async (): Promise<boolean> => {
          if (requestCloseOverride.value !== null) return requestCloseOverride.value
          return controller.requestClose()
        },
      }
    },
  }
})
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
      attachCustomKeyEventHandler: vi.fn(),
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
// jsdom には ResizeObserver が無い。TerminalTab がペイン幅の追従に使うので
// ここでは「何もしないフェイク」に差し替えて落ちないようにするだけでよい
vi.stubGlobal(
  'ResizeObserver',
  class {
    observe(): void {}
    disconnect(): void {}
    unobserve(): void {}
  },
)

const App = (await import('./App')).default

afterEach(cleanup)
afterEach(() => {
  ptyExitHandlers.clear()
  ptyKillMock.mockClear()
})

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

describe('フォルダ切替', () => {
  it('実行中のタブがあれば確認してから切り替える', async () => {
    await openPane()
    await screen.findByRole('button', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    expect(
      await screen.findByText('Claude Code のタブを終了してフォルダを切り替えますか？'),
    ).toBeTruthy()
  })

  it('承認するとタブが消える', async () => {
    await openPane()
    await screen.findByRole('button', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '終了して切り替える' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claude 1' })).toBeNull())
    // 指摘2: 「タブを閉じても Claude が残る」症状の肯定側——フォルダ切替の
    // 確認を承認したら killAllPtys が実際に呼ばれること
    expect(killAllPtysMock).toHaveBeenCalled()
  })

  it('取り消すとタブが残る', async () => {
    await openPane()
    await screen.findByRole('button', { name: 'Claude 1' })
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(screen.getByRole('button', { name: 'Claude 1' })).toBeTruthy()
  })
})

describe('タブを閉じる確認', () => {
  // 実機確認の指摘Bで計画の決定12（確認なしで即座に殺す）が覆り、
  // 実行中のタブは確認ダイアログを経由するようになった（M11 Task 11）
  it('実行中のタブの × を押すと確認ダイアログが出て、その時点ではまだ閉じない', async () => {
    await openPane()
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    expect(await screen.findByText('Claude 1 を終了しますか？')).toBeTruthy()
    // ダイアログが開いている間、背後は Radix が aria-hidden にする
    // （フォーカストラップ）。存在の確認なので hidden: true で見る
    expect(screen.getByRole('button', { name: 'Claude 1', hidden: true })).toBeTruthy()
  })

  it('承認するとタブが消える', async () => {
    await openPane()
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    fireEvent.click(await screen.findByRole('button', { name: '終了する' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claude 1' })).toBeNull())
    // 指摘2: 「タブを閉じても Claude が残る」症状の肯定側——閉じる確認を
    // 承認したら、そのタブの ptyId で実際に kill が呼ばれること
    expect(ptyKillMock).toHaveBeenCalledWith(1)
  })

  it('取り消すとタブが残る', async () => {
    await openPane()
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    fireEvent.click(await screen.findByRole('button', { name: 'キャンセル' }))
    expect(screen.getByRole('button', { name: 'Claude 1' })).toBeTruthy()
  })

  // レビュー指摘2: onConfirm は承認まで遅延実行されるので、× を押した瞬間の
  // クロージャではなく、承認された時点の最新の台帳から ptyId を引き直す必要がある
  it('確認待ちの間にタブが自然終了しても壊れない（古い ptyId で kill を呼ばない）', async () => {
    await openPane()
    // spawn の解決（onRunning。ptyId が入る）をここで確実に反映させてから
    // 閉じる操作に進む。反映前に閉じると target.ptyId が最初から null になり、
    // このテストが検証したい「非 null だった ptyId が古いまま使われる」状況を
    // 再現できない
    await act(async () => {
      await Promise.resolve()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Claude 1 を閉じる' }))
    await screen.findByText('Claude 1 を終了しますか？')
    // 確認待ちの間に PTY が自然終了する。台帳の ptyId はここで null に落ちる
    const onExit = ptyExitHandlers.get(1)
    if (onExit === undefined) throw new Error('unreachable: spawn が呼ばれていない')
    act(() => onExit(0))
    fireEvent.click(await screen.findByRole('button', { name: '終了する' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claude 1' })).toBeNull())
    // 承認された時点で ptyId は既に null。古い（自然終了前の）ptyId で
    // kill を呼んでいたら、この期待は壊れる
    expect(ptyKillMock).not.toHaveBeenCalled()
  })
})

describe('アプリ終了', () => {
  // **beforeEach で消すこと。** 「フォルダ切替」側のテストも実フォルダ切替を
  // 経由して killAllPtys（このファイル共通のモック）を呼ぶので、afterEach
  // だけだと他 describe から漏れてきた呼び出し回数が最初のテストに残る
  beforeEach(() => {
    killAllPtysMock.mockClear()
  })
  afterEach(() => {
    requestCloseOverride.value = null
  })

  it('閉じると決まったら端末も全部殺す（通常の終了経路。ウィンドウの × を含む）', async () => {
    render(<App />)
    await waitFor(() => expect(closeState.callback).not.toBeNull())
    requestCloseOverride.value = true
    const ok = await closeState.callback!()
    expect(ok).toBe(true)
    expect(killAllPtysMock).toHaveBeenCalledTimes(1)
  })

  it('閉じないと決まったら端末を殺さない（未保存編集がある等で閉じられない経路）', async () => {
    render(<App />)
    await waitFor(() => expect(closeState.callback).not.toBeNull())
    requestCloseOverride.value = false
    const ok = await closeState.callback!()
    expect(ok).toBe(false)
    expect(killAllPtysMock).not.toHaveBeenCalled()
  })
})
