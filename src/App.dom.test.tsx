// @vitest-environment jsdom
import { StrictMode } from 'react'
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
/**
 * `skillCalls` は「Skill の同期がいつ走ったか」を順番ごと記録する口。
 * 呼ばれた回数だけでなく `allowSkillDir` → `syncBundledSkills` の順序も
 * 見たいので、2つのモックが同じ配列へ積む。
 *
 * `pickedFolder` は「フォルダを開く」で選ばれるフォルダ。既定は `/proj` で、
 * **A→B→A を組みたいテストだけ**が書き換える（`afterEach` で戻す）。
 * `syncGate` は同期を途中で止めておく口——「まだ終わっていない同期」が
 * 無いと重複排除は観測できない。
 *
 * `disk` は「/proj の中身」をテストから差し替えるための可変状態（M13）。
 * 既定は空なので、**このファイルの既存テストが前提にしている「listJsonFiles は
 * 常に []」はそのまま保たれる**——中身を置くテストだけが自分で足し、
 * afterEach で片付ける
 */
const {
  closeState,
  killAllPtysMock,
  requestCloseOverride,
  ptyKillMock,
  ptyExitHandlers,
  skillCalls,
  pickedFolder,
  syncGate,
  syncReadingGuideMock,
  disk,
  writeProjectFileMock,
  saveLastProjectDirMock,
  restoreConfig,
  allowProjectDirCalls,
} = vi.hoisted(() => ({
  closeState: { callback: null as (() => Promise<boolean>) | null },
  killAllPtysMock: vi.fn(async () => undefined),
  requestCloseOverride: { value: null as boolean | null },
  ptyKillMock: vi.fn(async () => undefined),
  ptyExitHandlers: new Map<number, (code: number | null) => void>(),
  skillCalls: [] as string[],
  pickedFolder: { value: '/proj' },
  syncGate: { promise: null as Promise<void> | null, release: null as (() => void) | null },
  syncReadingGuideMock: vi.fn(async () => undefined),
  disk: new Map<string, string>(),
  writeProjectFileMock: vi.fn(async (_path: string, _text: string) => undefined),
  saveLastProjectDirMock: vi.fn(async (_dir: string) => undefined),
  // 起動時復元専用の可変状態。既定は「復元対象パス無し」——このファイルの
  // 既存テストはどれも起動時復元を前提にしていないので、既定を変えない
  restoreConfig: { lastDir: null as string | null, exists: false, allowError: null as Error | null },
  allowProjectDirCalls: [] as string[],
}))

vi.mock('@/fs/project-fs', () => ({
  // **`pickedFolder.value` を `'/proj'` に固定し直さないこと**——フォルダ切替
  // （A→B→A）のテストがこれを書き換えて成立している
  pickProjectFolder: async () => pickedFolder.value,
  // `disk` 経由に変えたが、既定は空なので「listJsonFiles は常に []」という
  // 既存テストの前提はそのまま（M13）
  listJsonFiles: async () => [...disk.keys()],
  readProjectFile: async (path: string) => disk.get(path) ?? '',
  writeProjectFile: writeProjectFileMock,
  fileExists: async () => restoreConfig.exists,
  allowProjectDir: async (dir: string) => {
    allowProjectDirCalls.push(dir)
    if (restoreConfig.allowError !== null) throw restoreConfig.allowError
  },
  moveFileToTrash: async () => undefined,
  joinPath: async (dir: string, name: string) => `${dir}/${name}`,
  watchFolder: async () => () => undefined,
  askSaveMarkdownPath: async () => null,
}))
vi.mock('@/fs/settings-fs', () => ({
  readLastProjectDir: async () => restoreConfig.lastDir,
  saveLastProjectDir: saveLastProjectDirMock,
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
vi.mock('@/fs/skill-resources', () => ({
  tauriSkillSyncIo: {},
  allowSkillDir: async (dir: string) => {
    skillCalls.push(`allow:${dir}`)
  },
}))
vi.mock('@/core/skill-sync', async (orig) => ({
  ...(await orig<typeof import('@/core/skill-sync')>()),
  syncBundledSkills: async (dir: string) => {
    skillCalls.push(`sync:${dir}`)
    // 既定（`promise` が null）では素通り。gate が張られている間だけ止まる
    await syncGate.promise
  },
}))
vi.mock('@/fs/reading-guide-io', () => ({ tauriReadingGuideIo: {} }))
// READING_GUIDE_FILENAME 等は実物のまま、同期関数だけ差し替える（skill-sync の mock と同じ形）
vi.mock('@/core/reading-guide', async (orig) => ({
  ...(await orig<typeof import('@/core/reading-guide')>()),
  syncReadingGuide: syncReadingGuideMock,
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
  skillCalls.length = 0
  disk.clear()
  writeProjectFileMock.mockClear()
  saveLastProjectDirMock.mockClear()
  restoreConfig.lastDir = null
  restoreConfig.exists = false
  restoreConfig.allowError = null
  allowProjectDirCalls.length = 0
})
/**
 * **止めたままの同期を次のテストへ持ち越さない（レビュー指摘）。**
 * 重複排除の台帳（`App.tsx` の `skillSyncInFlight`）はモジュール変数なので
 * テスト間で共有される。gate で止めた同期を残すと、そのフォルダは次のテストで
 * 「まだ走っている」扱いになり、**同期が黙って走らなくなる**。
 * テスト本体ではなくここで開けるのは、assertion で落ちた場合も必ず通すため
 */
afterEach(async () => {
  syncGate.release?.()
  syncGate.promise = null
  syncGate.release = null
  pickedFolder.value = '/proj'
  // 台帳から消えるのは同期が解決したあとの `.finally`。マクロタスクを1回
  // 挟んで、溜まっているマイクロタスクを全部流してから次のテストへ渡す
  await new Promise((resolve) => setTimeout(resolve, 0))
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

describe('Skill の同期のタイミング', () => {
  /**
   * Skill はプロジェクトに属するものであって端末セッションに属さない。
   * 以前は `openTerminal` が同期していたため、「＋ タブを追加」を押した
   * 回数だけ「消して置き直す」が走っていた（sequence M4 の実機確認）
   */
  it('フォルダを開いたときに走る（scope の付与が先）', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    // mac では `.claude/` がダイアログ由来の scope に入らないので、
    // allowSkillDir が先でないと同期の最初の exists で落ちる
    await waitFor(() => expect(skillCalls).toEqual(['allow:/proj', 'sync:/proj']))
  })

  /**
   * 重複排除（`App.tsx` の `skillSyncInFlight`）。**同期が終わる前に別の
   * フォルダへ切り替えて戻る**と、同じフォルダの同期が2本並走しうる。
   * 置き直しは冪等ではないので、並走すると片方の削除ループが相手の書き込みを
   * 追い越し、置いたばかりの `scripts/` を消してしまう。
   *
   * **この経路を塞いでいるのは重複排除だけ**——1件ごとの削除失敗を握りつぶす
   * ようにした（＝もう中断しない）ぶん、並走時に相手を壊す窓はむしろ開いた
   */
  it('**同期の途中で戻ってきても、同じフォルダを二重に同期しない**', async () => {
    syncGate.promise = new Promise<void>((resolve) => {
      syncGate.release = resolve
    })
    pickedFolder.value = '/a'
    render(<App />)
    const open = screen.getByRole('button', { name: 'フォルダを開く' })
    fireEvent.click(open)
    // /a の同期が始まり、gate で止まったまま先へ進まない
    await waitFor(() => expect(skillCalls).toContain('sync:/a'))
    pickedFolder.value = '/b'
    fireEvent.click(open)
    await waitFor(() => expect(skillCalls).toContain('sync:/b'))
    // まだ終わっていない /a へ戻る
    pickedFolder.value = '/a'
    fireEvent.click(open)
    // パスはサイドメニュー（FileList）が出す。**getByText で引かないこと**——
    // 頭を省く `dir="rtl"` の副作用を打ち消すため中身の先頭に不可視の
    // LTR_MARK が入っており、テキスト一致では拾えない。title は生のパス
    await waitFor(() => expect(screen.getByTitle('/a')).toBeTruthy())
    // 走っている同期に合流するだけで、2本目は始まらない
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(skillCalls).toEqual(['allow:/a', 'sync:/a', 'allow:/b', 'sync:/b'])
  })

  it('**タブを追加しても走らない**', async () => {
    await openPane()
    await waitFor(() => expect(skillCalls).toEqual(['allow:/proj', 'sync:/proj']))
    fireEvent.click(screen.getByRole('button', { name: 'タブを追加' }))
    await screen.findByRole('button', { name: 'Claude 2' })
    expect(skillCalls).toEqual(['allow:/proj', 'sync:/proj'])
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

  it('**終了済みのタブしか無くてもフォルダ切替で消える**（確認は出ない）', async () => {
    // `hasRunning` は starting / running しか見ないので、exited のタブだけが
    // 残っていると openFolder が確認も後始末もせず素通りしていた——旧フォルダ
    // の残骸がタブバーに残る（M11 の残件）
    await openPane()
    await screen.findByRole('button', { name: 'Claude 1' })

    // 子が自然終了した状態にする（starting / running ではなくなる）
    act(() => {
      ptyExitHandlers.get(1)?.(0)
    })
    await screen.findByText('終了しました（コード 0）')

    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))

    // 旧フォルダの残骸が消える
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Claude 1' })).toBeNull())
    // 実行中のタブが無いので、確認ダイアログは出ていない
    expect(screen.queryByRole('button', { name: '終了して切り替える' })).toBeNull()
  })
})

describe('最後に開いたフォルダの保存', () => {
  it('フォルダを開くと保存する', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    await waitFor(() => expect(saveLastProjectDirMock).toHaveBeenCalledWith('/proj'))
  })
})

describe('読み方ガイド', () => {
  it('フォルダを開くと読み方ガイドを配る', async () => {
    syncReadingGuideMock.mockClear()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    await waitFor(() => {
      expect(syncReadingGuideMock).toHaveBeenCalledWith('/proj', expect.anything())
    })
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
    ptyKillMock.mockClear()
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
    // **kill はちょうど1回。** 承認された時点で台帳の ptyId は既に null
    // なので、`closeTerminalNow` は kill を呼ばない。**1回だけ飛ぶのは
    // TerminalTab の cleanup**（M17。タブが消えてアンマウントされる）で、
    // 自分が知っている ptyId を無条件に殺す——既に死んだ id への
    // pty_kill は Rust 側で何も起きず、ID は単調増加なので他人を殺すこともない。
    // **2回になったら M11 の退行**（controller が古い＝自然終了前の
    // ptyId で kill を呼んでいる）である
    expect(ptyKillMock.mock.calls).toEqual([[1]])
  })
})

/**
 * 名前の帯（M13）。**ここが守っているのは配線の2本立て**——帯の
 * `onTitleChange` は `record`（履歴）と `applyEdit`（自動保存＋一覧）の
 * 両方を呼ぶ必要があり、片方を落としても TypeScript もユニットテストも
 * 何も言わない。`record` だけなら名前が保存されず、`applyEdit` だけなら
 * Undo が静かに効かなくなる。どちらも「動いているように見える」壊れ方をする
 */
describe('名前の帯（M13）', () => {
  const GLOSSARY_PATH = '/proj/用語集.json'

  const putGlossary = (title: string, over: Record<string, unknown> = {}) => {
    disk.set(
      GLOSSARY_PATH,
      JSON.stringify({ schemaVersion: 1, type: 'glossary', title, terms: [], ...over }),
    )
  }

  /** フォルダを開いて用語集を選び、帯の入力欄を返す */
  async function openBand(rowName: string) {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: `${rowName} を開く` }))
    return await screen.findByRole('textbox', { name: 'ファイルの名前' })
  }

  it('帯で名前を変えると、保存もされ Undo も効く（record と applyEdit の両方）', async () => {
    putGlossary('古い名前')
    const input = await openBand('古い名前（用語集.json）')
    fireEvent.change(input, { target: { value: '新しい名前' } })

    // **applyEdit 側**: 自動保存（デバウンス 500ms）へ新しい title が渡る。
    // ここは実タイマーで待つ——このファイルは偽タイマーを使っておらず、
    // 導入すると xterm/ResizeObserver 側の非同期まで巻き込む
    await waitFor(
      () => {
        expect(writeProjectFileMock).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )
    const lastCall = writeProjectFileMock.mock.calls.at(-1)
    if (lastCall === undefined) throw new Error('unreachable: write が呼ばれていない')
    expect(lastCall[0]).toBe(GLOSSARY_PATH)
    expect((JSON.parse(lastCall[1]) as { title: string }).title).toBe('新しい名前')

    // **record 側**: 履歴に積まれたので「元に戻す」が押せるようになる
    expect(screen.getByRole('button', { name: '元に戻す' }).hasAttribute('disabled')).toBe(false)

    // 一覧の行も追随する（applyEdit の result.title 引き直し。ここが無いと
    // 帯で名前を変えても一覧が古いまま残る）
    expect(screen.getByRole('button', { name: '新しい名前（用語集.json） を開く' })).not.toBeNull()
  })

  it('名前を空にしても保存される（空欄は「まだ決めていない」の意思表示。拒否しない）', async () => {
    putGlossary('消す名前')
    const input = await openBand('消す名前（用語集.json）')
    fireEvent.change(input, { target: { value: '' } })
    await waitFor(
      () => {
        expect(writeProjectFileMock).toHaveBeenCalled()
      },
      { timeout: 3000 },
    )
    const lastCall = writeProjectFileMock.mock.calls.at(-1)!
    expect((JSON.parse(lastCall[1]) as { title: string }).title).toBe('')
    // 一覧の主表示だけが (無題) に落ちる（データは空のまま）
    expect(screen.getByRole('button', { name: '(無題)（用語集.json） を開く' })).not.toBeNull()
  })

  it('スキーマ検証に落ちたファイルの帯は読み取り専用で、種類名も出さない', async () => {
    // terms が配列でないのでスキーマ検証に落ちる（＝ rejected）。それでも
    // type は読めているので、一覧は「用語集」の見出しの下に置く。
    // **ファイル名にも title にも「用語集」を含めないこと**——帯に「用語集」が
    // 出ていないことを確かめたいので、種類名としてしか現れない状況を作る
    disk.set(
      '/proj/broken.json',
      JSON.stringify({ schemaVersion: 1, type: 'glossary', title: 'こわれた', terms: 'x' }),
    )
    const input = await openBand('こわれた（broken.json）')
    const band = input.parentElement
    if (band === null) throw new Error('unreachable: 帯が無い')
    // 種類は一覧の見出しが示すので、帯では言わない（M13 実機確認の裁定）
    expect(band.textContent).not.toContain('用語集')
    // 書けないファイルなので入力欄は読み取り専用のまま
    expect(input.hasAttribute('readonly')).toBe(true)
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

describe('額縁の帯', () => {
  it('ヘッダーはフォルダのパスを出さない（ファイル一覧の直上へ移した）', async () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Claude Code ペインを開く' }).hasAttribute('disabled')).toBe(false)
    })
    expect(document.querySelector('header')?.textContent).not.toContain('/proj')
  })

  it('テーマ切替はアイコンボタンで、押すと何が起きるかを名前が言う', () => {
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'ダークにする' }))
    expect(screen.getByRole('button', { name: 'ライトにする' })).toBeTruthy()
  })
})

/**
 * 指摘バナーと額縁の配線（M14 で各エディタから額縁へ寄せた分。M16）。
 * IssueBanner 単体・「各エディタが一覧を出さない」は別ファイルが押さえて
 * いるので、ここで固定するのは**両者を繋ぐ配線**だけ——App が selected.issues を
 * IssueBanner へ渡し、エディタの上（縦フレックスの前の兄弟）に置いていること
 */
describe('指摘バナーと額縁の配線（M14）', () => {
  const GLOSSARY_PATH = '/proj/用語集.json'
  const DUP_MESSAGE = '名称が重複しています: 「受注」 と 「受注」'
  const term = (id: string, name: string) => ({
    id,
    name,
    kind: 'undecided',
    definition: '',
    aliases: [],
    notes: '',
  })
  const putDuplicated = () => {
    disk.set(
      GLOSSARY_PATH,
      JSON.stringify({
        schemaVersion: 1,
        type: 'glossary',
        title: '重複あり',
        terms: [term('term_Aaaaaaaaa1', '受注'), term('term_Aaaaaaaaa2', '受注')],
      }),
    )
  }
  async function openDuplicated() {
    putDuplicated()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '重複あり（用語集.json） を開く' }))
    // エディタ（用語テーブル）の描画まで待つ
    return await screen.findByRole('table')
  }

  it('編集可能なファイルの指摘が額縁のバナーに1回だけ出る', async () => {
    await openDuplicated()
    // 編集可能なファイルであること（rejected の別パネルが出しているのではない）
    const band = screen.getByRole('textbox', { name: 'ファイルの名前' })
    expect(band.hasAttribute('readonly')).toBe(false)
    // 1回だけ＝エディタ側が同じ一覧を二重に出していない
    expect(screen.getAllByText(DUP_MESSAGE)).toHaveLength(1)
  })

  it('バナーはエディタより上にある', async () => {
    const table = await openDuplicated()
    const item = screen.getByText(DUP_MESSAGE)
    // 「縦フレックスの兄弟として上に出る」は jsdom ではレイアウトとして観測
    // できないので、その投影である DOM 順（バナー → エディタ）を固定する。
    // これが崩れる壊れ方＝バナーをエディタ内・エディタ下へ移す配線ミス
    expect(item.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})

describe('起動時のフォルダ復元', () => {
  it('保存済みパスがあり実在すれば自動で開く', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    render(<App />)
    await waitFor(() => expect(screen.getByTitle('/restored')).toBeTruthy())
    expect(allowProjectDirCalls).toEqual(['/restored'])
    // 復元が `openProject` の全パイプライン（Skill 同期・読み方ガイド配置を
    // 含む）に正しく乗っていることを直接検証する（最終レビュー指摘）
    await waitFor(() => {
      expect(syncReadingGuideMock).toHaveBeenCalledWith('/restored', expect.anything())
    })
  })

  it('保存済みパスが無ければ何も開かず通常起動する', async () => {
    render(<App />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(allowProjectDirCalls).toEqual([])
    // `disabled={projectDir === null}`（`App.tsx`）。フォルダが開いていなければ
    // 無効のまま——`openPane()` ヘルパーが「開けたか」を見るのと同じ指標
    expect(screen.getByRole('button', { name: 'Claude Code ペインを開く' }).hasAttribute('disabled')).toBe(true)
  })

  it('保存済みパスが実在しなければ何も開かず通常起動する', async () => {
    restoreConfig.lastDir = '/gone'
    restoreConfig.exists = false
    render(<App />)
    await waitFor(() => expect(allowProjectDirCalls).toEqual(['/gone']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTitle('/gone')).toBeNull()
  })

  it('scope の再付与が失敗しても通常起動にフォールバックする', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    restoreConfig.allowError = new Error('forbidden path')
    render(<App />)
    await waitFor(() => expect(allowProjectDirCalls).toEqual(['/restored']))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(screen.queryByTitle('/restored')).toBeNull()
  })

  it('StrictMode の二重マウントでも復元は1回しか走らない', async () => {
    restoreConfig.lastDir = '/restored'
    restoreConfig.exists = true
    render(
      <StrictMode>
        <App />
      </StrictMode>,
    )
    await waitFor(() => expect(screen.getByTitle('/restored')).toBeTruthy())
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(allowProjectDirCalls).toEqual(['/restored'])
  })
})
