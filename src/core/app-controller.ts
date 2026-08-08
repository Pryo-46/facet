import type { AutoSaver } from './autosave'
import { serialize } from './canonical'
import { planExternalChange } from './external-change'
import { createFile, ensureFileOfType as ensureFileOnDisk, trashFile, type CreatedFile } from './file-ops'
import { createKnownDisk } from './known-disk'
import { classifyFile } from './load'
import type { ModalRequest } from './modal-queue'
import { computeIssues, type ProjectFile } from './project-file'
import type { AnyToolModule, ModuleRegistry } from './registry'
import { toProjectFile, type ScanResult } from './scan'
import type { ToastItem } from './toasts'

/**
 * 額縁の副作用の**順序**を持つコントローラ（コア。React も Tauri も知らない）。
 *
 * **なぜ切り出したか**: M4・M5 の最終レビューが見つけた配線バグはほぼすべて
 * `App.tsx`——リポジトリで唯一自動テストが無いファイル——にあった。M5 では
 * 判断（`planExternalChange`）をコアへ出したが、残っていたのは**順序**
 *（dispose → 一覧差し替え → 通知/ダイアログ → saver 張り直し）であり、
 * それは純関数では表現できない。ここが「順序をテストで固定する」場所である。
 *
 * **なぜ React の state / ref を使わないか**: M5 の Critical のうち2件は
 *「レンダごとに代入する ref では過去の値を凍結できない」「1つの状態を2つの
 * 機構が共有していた」だった。クロージャ変数なら代入は同期で確定し、
 * 「変更前の一覧」も「確定時点の選択」もそのまま読める。ホストへの通知
 *（`host.setFiles` 等）は表示の複製にすぎず、判断には使わない
 */

/**
 * バナー（**いま続いている状態**を出す場所。起きた出来事はトースト）の種別。
 * 単一スロットだと「監視を開始できません」（継続する状態）が次の操作の
 * 成功で消え、逆に再走査の失敗は成功しても残った（申し送り11節）
 */
export type BannerKind =
  /** 直近の操作（読み込み・作成・削除・書き出し）の失敗。次の成功で消える */
  | 'io'
  /** 自動保存の失敗。write 成功かファイルを離れたら消える */
  | 'save'
  /** 再走査の失敗。次の再走査が成功したら消える */
  | 'scan'
  /** 監視を開始できない。**継続する状態**なので他の操作では消さない */
  | 'watch'

/** 自動保存の生成仕様（遅延は額縁が決めるのでここには無い） */
export interface SaverSpec {
  baseline: string
  write: (text: string) => Promise<void>
  onError: (err: unknown) => void
  onSuccess: () => void
}

/** I/O の注入口。実体は src/fs/*（コアは Tauri を知らない） */
export interface AppIo {
  scan: (dir: string) => Promise<ScanResult>
  read: (path: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  exists: (path: string) => Promise<boolean>
  trash: (path: string) => Promise<void>
  join: (dir: string, name: string) => Promise<string>
  copyText: (text: string) => Promise<void>
  /** 保存先を尋ねる。null＝キャンセル */
  askSavePath: (defaultPath: string) => Promise<string | null>
  /** 保留編集を書き切らずにウィンドウを閉じる（脱出口） */
  forceClose: () => Promise<void>
  createSaver: (spec: SaverSpec) => AutoSaver
}

/** UI への反映口。すべて「表示の複製」であり、コントローラの判断材料にはしない */
export interface AppHost {
  setFiles: (files: ProjectFile[]) => void
  setProjectDir: (dir: string | null) => void
  setSelectedPath: (path: string | null) => void
  /**
   * 編集対象データの差し替え（null＝閉じる）。額縁はこれを履歴の作り直しに写す。
   * **これが Undo 履歴の破棄そのもの**である——履歴の中身は取り込み前のファイルを
   * 指しており、残すと Ctrl+Z がディスクの内容を無言で巻き戻す（rev 3章）
   */
  setDocument: (data: unknown | null) => void
  setBanner: (kind: BannerKind, message: string | null) => void
  showToast: (toast: Omit<ToastItem, 'id'>) => void
  dismissToast: (key: string) => void
  showModal: (request: ModalRequest) => void
  dropModal: (key: string) => void
  clearModals: () => void
  /** いま編集中のデータ（額縁の履歴の present）。無ければ null */
  getEditingData: () => unknown | null
}

export interface AppController {
  openFolder(dir: string): Promise<void>
  selectFile(path: string): Promise<void>
  /** 編集・Undo・Redo の共通後処理（自動保存へ渡し、整合性検証をやり直す） */
  applyEdit(path: string, module: AnyToolModule, next: unknown): void
  /** 新規作成（額縁のファイル操作。rev 6章）。作ったファイルはそのまま開く */
  createNewFile(module: AnyToolModule): Promise<void>
  /** 削除の確認ダイアログを出す（確定時の処理はコントローラが持つ） */
  requestDelete(file: ProjectFile): void
  /** 監視イベントを契機に再走査し、外部変更を取り込む（rev 3章） */
  externalChange(): Promise<void>
  /** singleton モジュールのファイルを1つ確保して開く（用語集0個からの自動生成） */
  ensureFileOfType(module: AnyToolModule): Promise<void>
  /** ウィンドウ close のゲート。true＝閉じてよい */
  requestClose(): Promise<boolean>
  /** 選択中ファイルの Markdown をクリップボードへ（rev 8章） */
  copyMarkdown(): Promise<void>
  /** 選択中ファイルの Markdown を .md として書き出す（rev 8章） */
  exportMarkdown(): Promise<void>
  /** アンマウント時。**flush しない**（失敗で復元された pending を捨てないため） */
  dispose(): void
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

/** 再走査の結果。呼び出し側が「作ってよいか」を判断するために3値を返す */
type RescanOutcome =
  | { kind: 'applied'; files: ProjectFile[] }
  /** フォルダ切替中・フォルダ未選択・後続の走査が始まった（バナーは出さない） */
  | { kind: 'skipped' }
  /** 走査に失敗（バナーは出済み） */
  | { kind: 'failed' }

export function createAppController(
  io: AppIo,
  host: AppHost,
  registry: ModuleRegistry,
): AppController {
  // ---- 状態（すべてクロージャ変数。共有マップは計画書の「状態変数の共有マップ」） ----
  // projectDir / selectedPath はここが所有する状態そのもの。host への通知
  //（setProjectDir/setSelectedPath）は表示の複製にすぎず、判断には使わない——
  // AppHost に getter を足して host 側の値を読み返す形にはしない。それは M5 で
  // 実際に障害を起こした構造（表示用の値を判断材料にすると、React の反映を待つ
  // 隙に判断が狂う）への逆戻りである。createNewFile が projectDir を、
  // requestDelete が selectedPath を読む（rescan/externalChange も同様に読む）
  let files: ProjectFile[] = []
  let saver: AutoSaver | null = null
  let projectDir: string | null = null
  let selectedPath: string | null = null
  /** ディスクの既知内容の台帳。自己書き込み除外の要（rev 3章） */
  const knownDisk = createKnownDisk()
  /** selectFile / openFolder の直列化トークン。後続が始まったら先行の結果を捨てる */
  let selectSeq = 0
  /**
   * フォルダ切替中の再走査を止める。**カウンタであること**——boolean だと
   * openFolder が2重に走ったとき、先の finally が後の切替中にフラグを消す。
   * 読むのは rescan（`switchingFolder > 0` なら再走査を捨てる。古いフォルダの
   * 監視イベントが、切替後の一覧を古いフォルダの内容で上書きしうるため）
   */
  let switchingFolder = 0
  /** 再走査の直列化トークン（後続の再走査・フォルダ切替が始まったら先行の結果は捨てる） */
  let scanSeq = 0
  /**
   * 回答待ちの二択。**`ask` の分岐で saver を dispose するので、
   * `hasUnsaved()` だけでは「未保存編集あり」の信号が消える**——これが無いと
   * 回答前の2度目の外部変更が reload に落ち、ユーザーの編集を持つ履歴を置き換える。
   * モジュールを一緒に持つのは、2度目の検知では一覧が既に1度目の適用後
   *（rejected になっているかもしれない）を指すため——再導出すると `undefined` になり、
   *「自分の編集で上書き」が何も書けなくなる
   */
  let pendingAsk: { path: string; module: AnyToolModule | undefined } | null = null

  const applyFiles = (next: ProjectFile[]): void => {
    files = computeIssues(next, registry)
    host.setFiles(files)
  }

  const setSelected = (path: string | null): void => {
    selectedPath = path
    host.setSelectedPath(path)
  }

  /**
   * アプリからの書き込みは必ずここを通す。**書けた内容を即座に台帳へ記録する**ことが
   * 自己書き込み除外の唯一の前提条件で、記録が遅れると自分の書き込みを
   * 外部変更として検知してしまう。失敗時は記録しない（ディスクは変わっていない）
   */
  const writeAndRecord = async (path: string, text: string): Promise<void> => {
    await io.write(path, text)
    knownDisk.set(path, text)
  }

  /**
   * 自動保存を張る。baseline は「そのファイルをアプリが正とみなす内容の正規形」で、
   * 無編集ならバイト一致で書き込みが起きない（非正規ファイルを開いただけでは
   * 書き戻さない。rev 5章）
   */
  const attachSaver = (path: string, baseline: string): void => {
    saver = io.createSaver({
      baseline,
      write: (text) => writeAndRecord(path, text),
      onError: (err) =>
        host.setBanner(
          'save',
          `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${describeError(err)}`,
        ),
      onSuccess: () => host.setBanner('save', null),
    })
  }

  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    if (saver !== null) {
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!(await saver.flush())) return false
      saver.dispose()
      saver = null
    }
    setSelected(null)
    host.setDocument(null)
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    host.setBanner('save', null)
    return true
  }

  const openFolder = async (dir: string): Promise<void> => {
    const token = ++selectSeq
    // 進行中の再走査の結果を捨てさせる（別フォルダの走査結果を新しい一覧へ混ぜない）
    scanSeq++
    switchingFolder++
    try {
      // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
      // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
      if (!(await closeCurrentFile())) return
      const scan = await io.scan(dir)
      if (token !== selectSeq) return
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない。M1 で確定）
      if (scan.unreadable.length > 0) {
        host.setBanner('io', `読み込めないファイルがあるため開けませんでした: ${scan.unreadable.join(' / ')}`)
        return
      }
      // 前のフォルダへのモーダル要求（二択・削除確認）は新しい一覧に対して意味を失う
      host.clearModals()
      // 前のフォルダで回答待ちだった二択も同じ理由で意味を失う
      pendingAsk = null
      projectDir = dir
      host.setProjectDir(dir)
      applyFiles(scan.entries.map(toProjectFile))
      // 台帳は別フォルダの分を持ち越さない
      knownDisk.clear()
      for (const entry of scan.entries) knownDisk.set(entry.path, entry.text)
      host.setBanner('io', null)
      host.setBanner('scan', null)
    } catch (err) {
      if (token !== selectSeq) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      host.setBanner('io', `フォルダの読み込みに失敗しました: ${describeError(err)}`)
    } finally {
      switchingFolder--
    }
  }

  const selectFile = async (path: string): Promise<void> => {
    const token = ++selectSeq
    if (!(await closeCurrentFile())) return
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる。M1 で確定）
      const text = await io.read(path)
      if (token !== selectSeq) return
      // 読んだ内容は「アプリが知っているディスクの内容」
      knownDisk.set(path, text)
      const result = classifyFile(text, registry)
      applyFiles(files.map((f) => (f.path === path ? { ...f, result } : f)))
      setSelected(path)
      host.setBanner('io', null)
      if (result.status !== 'editable') return
      const module = registry.get(result.type)
      if (module === undefined) return
      attachSaver(path, serialize(result.data, module.schema))
      host.setDocument(result.data)
    } catch (err) {
      if (token !== selectSeq) return
      host.setBanner('io', `ファイルの読み込みに失敗しました: ${describeError(err)}`)
    }
  }

  const applyEdit = (path: string, module: AnyToolModule, next: unknown): void => {
    saver?.update(serialize(next, module.schema))
    applyFiles(
      files.map((f) =>
        f.path === path && f.result.status === 'editable'
          ? { ...f, result: { ...f.result, data: next } }
          : f,
      ),
    )
  }

  /**
   * 作成したファイルを一覧へ登録して開く。新規作成と自動生成が同じ後処理を通る
   * ための単一経路。書いたテキストをそのまま分類し直すのは、editable にならないなら
   * 雛形かシリアライザが壊れている証拠だから——一覧に出す前に気付ける
   */
  const addCreatedFile = async (created: CreatedFile): Promise<void> => {
    const entry: ProjectFile = {
      path: created.path,
      name: created.name,
      result: classifyFile(created.text, registry),
      issues: [],
    }
    // ダブルクリックや遅い IPC で同じパスが2回来ても1件に保つ
    if (!files.some((f) => f.path === created.path)) applyFiles([...files, entry])
    host.setBanner('io', null)
    await selectFile(created.path)
  }

  const createNewFile = async (module: AnyToolModule): Promise<void> => {
    const dir = projectDir
    if (dir === null) {
      host.setBanner('io', 'プロジェクトフォルダを開いてから作成してください。')
      return
    }
    try {
      const created = await createFile({
        dir,
        module,
        existingNames: files.map((f) => f.name),
        join: io.join,
        write: writeAndRecord,
        exists: io.exists,
      })
      await addCreatedFile(created)
    } catch (err) {
      host.setBanner('io', `ファイルを作成できませんでした: ${describeError(err)}`)
    }
  }

  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   *
   * **切り離しは trash の前に行う。** `trashFile` が write の着地を待つ間、
   * エディタが同じ saver を掴んだままだと、その間の打鍵で再武装したタイマーが
   * 生きた write を残せる（申し送り10節の残余の窓）。選択と saver を先に落として
   * エディタを畳めば、この窓は構造的に消える。
   * `closeCurrentFile` を通さないのも要点——あれは保留編集を書き切る経路で、
   * 消したファイルを書き戻して復活させる
   */
  const deleteFile = async (file: ProjectFile): Promise<void> => {
    // 確認ダイアログを挟むので、選択状態は「押された時点」を読む
    //（クロージャ変数なので自動的に確定時点の値になる）
    const wasSelected = file.path === selectedPath
    const target = wasSelected ? saver : null
    if (wasSelected) {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      selectSeq++
      saver = null
      setSelected(null)
      host.setDocument(null)
      host.setBanner('save', null)
    }
    try {
      await trashFile({ path: file.path, saver: target, trash: io.trash })
      knownDisk.delete(file.path)
      // 二択ダイアログごと取り下げるので、回答待ちの信号も落とす
      //（残すと requestClose が「もう存在しないダイアログ」を待って永久に閉じられなくなる）
      if (pendingAsk !== null && pendingAsk.path === file.path) pendingAsk = null
      // このファイル宛ての二択要求が残っていても、押せば no-op か読み込みエラーになる
      host.dropModal(`external:${file.path}`)
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      applyFiles(files.filter((f) => f.path !== file.path))
      host.setBanner('io', null)
    } catch (err) {
      // ゴミ箱への移動が失敗した場合、ファイルは残るが選択は外れている
      //（保留編集は trashFile が捨てている。「消す」と決めた操作の副作用として許容）
      host.setBanner('io', `ファイルを削除できませんでした: ${describeError(err)}`)
    }
  }

  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile): void => {
    host.showModal({
      kind: 'confirm',
      key: `delete:${file.path}`,
      title: 'ファイルを削除しますか？',
      description: `${file.name} を OS のゴミ箱へ移動します。完全には削除しないので、ゴミ箱から戻せます。`,
      confirmLabel: 'ゴミ箱へ移動',
      onConfirm: () => deleteFile(file),
    })
  }

  /**
   * 取り込み前の内容へ戻す（rev 3章。Undo 履歴を破棄した後に残す唯一の復元手段）。
   * **退避しておいた生バイトをそのまま書く**——編集データを再シリアライズすると、
   * 非正規形のまま開いていたファイルで全行 diff が出て、「変更履歴を仕様の
   * 変更履歴として読める」（rev 5章）が壊れる。生バイトなら git diff が空に戻る。
   * 取り込みでファイルが開けなくなった（rejected）場合もこの経路で戻せる
   */
  const revertImport = async (path: string, stashText: string): Promise<void> => {
    // このトーストは action 付きなので自動では消えない（rev 3章。退避の復元手段を
    // 時間切れで失わないため）。つまり別のファイルを開いて編集した後や、
    // フォルダを切り替えた後に押されうる
    if (!files.some((f) => f.path === path)) {
      // 別フォルダのファイルへ書き戻して選択を移すと、一覧に無いファイルを
      // 選択した行き止まり（エディタが描画されないまま saver が張られる）になる
      host.showToast({
        message: '取り込み前の内容に戻せませんでした（このファイルは今のプロジェクトにありません）',
      })
      return
    }
    if (selectedPath === path) {
      // 取り込み後の内容を書きに行かせない（この経路の本来の意図）
      saver?.dispose()
      saver = null
    } else if (!(await closeCurrentFile())) {
      // 別のファイルを開いていて、その編集を書き切れないなら中断する——
      // 無条件に dispose すると、そのファイルの未保存編集を黙って捨てる
      return
    }
    try {
      await writeAndRecord(path, stashText)
      await selectFile(path)
      host.showToast({ key: `external:${path}`, message: '取り込み前の内容に戻しました' })
    } catch (err) {
      host.setBanner('io', `取り込み前の内容に戻せませんでした: ${describeError(err)}`)
    }
  }

  /**
   * 外部変更を取り込む。**ディスクを正として `selectFile` で張り直す**——
   * 「必ずディスクから読み直す」「検証をやり直す」「saver を張り直す」
   * 「履歴を作り直す」が既存の1本道で揃う（M1 で確定した原則）。
   * **履歴の作り直しが Undo 履歴の破棄そのもの**である——履歴の中身は
   * 取り込み前のファイルを指しており、残すと Ctrl+Z がディスクの内容を
   * 無言で巻き戻す（rev 3章）。
   *
   * 申し送り9節は「取り込みは applyEdit の4本目の経路になる」と予告していたが、
   * applyEdit は「自動保存へ渡す」＋「履歴に record」なので取り込みには合わない
   *（ディスクから読んだ内容を書き戻すことになり、履歴も破棄でなく追加になる）。
   * **applyEdit を通るのは下の overwriteWithMine（上書き）側**
   */
  const importExternalChange = async (path: string, stashText: string | undefined): Promise<void> => {
    // reload 経由でも呼ばれるが、その場合は既に null なので無害
    pendingAsk = null
    await selectFile(path)
    host.showToast({
      key: `external:${path}`,
      message: '外部の変更を読み込みました（元に戻す操作の履歴は破棄しました）',
      action:
        stashText === undefined
          ? undefined
          : { label: '取り込み前に戻す', run: () => revertImport(path, stashText) },
    })
  }

  /**
   * 自分の編集でディスクを上書きする（二択ダイアログの片側。ここが applyEdit の4本目の経路）。
   * **baseline は検知したディスクの内容にする**——古い baseline のままだと
   * 「同じ内容だから書かない」に落ちて、外部の内容が残ったまま画面と食い違う。
   * **module は呼び出し側（rescan）が「変更前の」一覧から引いて渡す**——クロージャ変数に
   * 写す方式でも、ダイアログが見える前に `applyFiles` が反映されて「変更後」を
   * 指してしまう場合があるため、取得済みの値をそのまま使い続ける（レビューで発覚）
   */
  const overwriteWithMine = (
    path: string,
    diskText: string,
    module: AnyToolModule | undefined,
  ): void => {
    pendingAsk = null
    // 待っている間に選択が変わっていたら書かない。**無音にしない**——
    //「上書きを押したのに何も起きず、外部の内容が残っている」に見える
    if (selectedPath !== path) {
      host.setBanner(
        'io',
        '選択が変わったため、編集内容を書き戻しませんでした（ディスクには外部の変更が残っています）。',
      )
      return
    }
    const data = host.getEditingData()
    if (data === null || module === undefined) {
      // 無言で終わると「上書きを押したのに何も起きず、編集も失われた」に見える
      host.setBanner(
        'io',
        '編集内容を書き戻せませんでした（このファイルを扱うモジュールが見つかりません）。外部エディタで内容を確認してください。',
      )
      return
    }
    attachSaver(path, diskText)
    // 書く内容が同一だと write が起きず onSuccess も走らないので、ここで消す
    host.setBanner('save', null)
    applyEdit(path, module, data)
    // 外部変更で rejected / listOnly に落ちたエントリは applyEdit では戻らない
    //（あれは editable のエントリだけを差し替える）。書き込む内容をそのまま
    // 分類し直して一覧へ戻す——さもないと、ディスクは自分の内容に直っているのに
    //「このファイルは開けません」の表示が残り、しかも台帳が一致するので
    // 再走査でも直らない（次にそのファイルを選び直すまで行き止まりになる）。
    // 書いたテキストを分類し直すのは addCreatedFile と同じ考え方
    const repaired = classifyFile(serialize(data, module.schema), registry)
    applyFiles(
      files.map((f) => (f.path === path && f.result.status !== 'editable' ? { ...f, result: repaired } : f)),
    )
  }

  /** 未保存編集がある状態の外部変更（rev 3章。マージ UI は作らない） */
  const askExternalChange = (
    selected: { path: string; name: string; diskText: string },
    moduleBeforeChange: AnyToolModule | undefined,
  ): void => {
    // 同じファイルの古い通知——特に前回の取り込みで出した「取り込み前に戻す」——を消す。
    // トーストは時間で消えないので、残すと二択に答えた後に押せてしまい、
    // 二択の前提（ディスクは検知した内容のまま）が崩れる
    host.dismissToast(`external:${selected.path}`)
    host.showModal({
      kind: 'choice',
      // 同じファイルの二択が積み上がらないよう、新しい要求で置き換える
      key: `external:${selected.path}`,
      title: '外部でファイルが変更されました',
      description: `${selected.name} が別のプログラム（AI・エディタ・Git など）によって変更されました。保存していない編集があるため、どちらを残すか選んでください。両方を混ぜることはできません。`,
      primaryLabel: '自分の編集で上書き',
      secondaryLabel: '外部変更を取り込む（自分の編集は破棄）',
      onPrimary: () => overwriteWithMine(selected.path, selected.diskText, moduleBeforeChange),
      // 取り込み側に「取り込み前に戻す」は出さない——退避できるのは取り込み前に
      // **ディスクにあった**内容で、破棄される未保存編集ではないため
      onSecondary: () => importExternalChange(selected.path, undefined),
    })
  }

  /**
   * 開いていたファイルが外部で消えたときの後始末（M4 の deleteFile と同じ形）。
   * **flush しない**——消えたファイルへ書き戻すと、削除されたはずのファイルが
   * 復活する（M4 の削除で踏んだ事故と同じ。申し送り10節）
   */
  const handleSelectedGone = (path: string, name: string): void => {
    // 進行中の selectFile / openFolder の結果を捨てさせる
    selectSeq++
    // 回答待ちのファイルが外部で消えた場合、二択ダイアログの回答待ち信号も落とす
    pendingAsk = null
    saver?.dispose()
    saver = null
    setSelected(null)
    host.setDocument(null)
    host.setBanner('save', null)
    knownDisk.delete(path)
    // 消えたファイルの二択要求は、どちらを押しても no-op か読み込みエラーに退化する
    host.dropModal(`external:${path}`)
    host.showToast({ key: `external:${path}`, message: `開いていたファイルが外部で削除されました: ${name}` })
  }

  /**
   * 外部変更の取り込み口（rev 3章）。監視イベントを契機にフォルダを再走査し、
   * 「ディスクの生テキスト ≠ 台帳」だけを外部変更として扱う。
   * **自己書き込みの除外はこの突き合わせで構造的に成立する**——アプリの
   * 自動保存・新規作成は書いた内容を台帳へ同時記録し（writeAndRecord）、
   * 削除は一覧と台帳の両方から落とすので、跳ね返ってきたイベントは差分ゼロになる。
   * 戻り値は呼び出し側が「作ってよいか」を判断するための3値（ensureFileOfType が使う）
   */
  const rescan = async (): Promise<RescanOutcome> => {
    // フォルダ切替中の再走査は捨てる（古いフォルダの内容で新しい一覧を上書きしない）
    if (switchingFolder > 0) return { kind: 'skipped' }
    const dir = projectDir
    if (dir === null) return { kind: 'skipped' }
    const token = ++scanSeq
    let scan: ScanResult
    try {
      scan = await io.scan(dir)
    } catch (err) {
      host.setBanner('scan', `フォルダの再走査に失敗しました: ${describeError(err)}`)
      return { kind: 'failed' }
    }
    // 後続の再走査・フォルダ切替が始まっていたら、この結果は捨てる
    if (token !== scanSeq || projectDir !== dir) return { kind: 'skipped' }
    host.setBanner('scan', null)

    const plan = planExternalChange({
      prev: files,
      scan,
      knownText: (path) => knownDisk.get(path),
      selectedPath,
      // **ここが reload と ask の分岐を決める載荷点**。in-flight write と
      // 失敗して再試行待ちも true に含む（hasUnsaved の定義）。加えて、
      // ask で saver を dispose した後は pendingAsk が信号を代行する
      hasUnsavedEdits:
        (saver?.hasUnsaved() ?? false) || (pendingAsk !== null && pendingAsk.path === selectedPath),
    })

    // 上書きに使うモジュールは「変更前の」一覧から引く——外部変更でスキーマ違反に
    // なったファイルは result が rejected になって type からモジュールを引けず、
    // type が別のツールに書き換えられた場合は別のモジュールを引いてしまう
    //（古いデータを新しいスキーマでシリアライズすると壊れたファイルを書く）。
    // 回答待ちの二択があるなら、そのとき捕まえたモジュールを使い続ける——
    // 2度目の検知では一覧が既に1度目の適用後（rejected になっているかもしれない）を
    // 指すので、ここで再導出すると undefined になってしまう
    const before = files.find((f) => f.path === selectedPath)
    const moduleBeforeChange =
      pendingAsk !== null && pendingAsk.path === selectedPath
        ? pendingAsk.module
        : before !== undefined && before.result.status === 'editable'
          ? registry.get(before.result.type)
          : undefined

    // 台帳をディスクの現状へ合わせる。**plan を作った後**でなければ差分が消える。
    // 読めなかったパスは台帳に残す（消えた扱いにしないため）
    for (const entry of scan.entries) knownDisk.set(entry.path, entry.text)
    knownDisk.retain([...scan.entries.map((e) => e.path), ...scan.unreadable])
    if (!plan.hasChanges) return { kind: 'applied', files }

    const selected = plan.selected
    // **一覧を差し替える前に自動保存を止める。** 取り込むか上書きするかを決める前に
    // ディスクが動くと判断の前提が壊れる（申し送り11節。App では setFiles → dispose の
    // 順だったが、React の再レンダ待ちにより実質「dispose が先」だった。同期の
    // コントローラでは順序が可視になるので、意図どおり dispose を先に置く）。
    // 再開は確定時（取り込み＝selectFile が張り直す／上書き＝新しい baseline で張り直す）
    if (selected.kind === 'reload' || selected.kind === 'ask') {
      saver?.dispose()
      saver = null
    }
    // 検証は「フォルダ走査時」「選択時」「編集時」「作成時」「削除時」に続く6本目の経路
    applyFiles(plan.next)
    for (const notice of plan.notices) host.showToast(notice)

    switch (selected.kind) {
      case 'none':
        break
      case 'reload':
        await importExternalChange(selected.path, selected.stashText)
        break
      case 'ask':
        pendingAsk = { path: selected.path, module: moduleBeforeChange }
        askExternalChange(selected, moduleBeforeChange)
        break
      case 'gone':
        handleSelectedGone(selected.path, selected.name)
        break
    }
    return { kind: 'applied', files }
  }

  /**
   * singleton モジュールのファイルを1つ確保して開く（rev 5章。用語集0個は
   * 新規プロジェクトの正常な状態で、初めて用語登録が発生した時点で自動生成する。
   * 将来のインライン登録コンポーネントもこの関数を呼ぶ——生成の条件と正規形を
   * そちらで書き直さないため）。
   * **押下時に再走査する**——空フォルダを開いた後に外部（Skill 等）が用語集を
   * 書いた状態で押されうるボタンなので、走査時のスナップショットで判断すると
   * 見落として2つ目を作る（申し送り10節）
   */
  const ensureFileOfType = async (module: AnyToolModule): Promise<void> => {
    if (projectDir === null) {
      host.setBanner('io', `プロジェクトフォルダを開いてから${module.displayName}を作成してください。`)
      return
    }
    // 走査時のスナップショットで判断すると、走査後に外部で増えたファイル
    //（Skill が書いたもの）を見落として2つ目を作る。まず再走査する
    const outcome = await rescan()
    // 再走査できなかったときは作らない——古いスナップショットで判断すると、
    // 外部で増えたファイルを見落として単一性違反を自分で作る
    if (outcome.kind === 'failed') return // バナーは rescan が出している
    if (outcome.kind === 'skipped') {
      // **無音にしない**（申し送り11節）——従来バナーが出るのは走査の失敗だけだったが、
      // フォルダ切替中・未選択・後続走査の割り込みも「作らなかった」という結果は同じ
      host.setBanner(
        'io',
        `フォルダの状態を確認できなかったため、${module.displayName}を作成しませんでした（フォルダの切り替え中です。もう一度お試しください）。`,
      )
      return
    }
    const dir = projectDir
    if (dir === null) return
    try {
      const { path, created } = await ensureFileOnDisk({
        dir,
        module,
        files: outcome.files.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: io.join,
        write: writeAndRecord,
        exists: io.exists,
      })
      if (created === null) {
        // 既にあった。開くだけ（ディスクから読み直す）
        await selectFile(path)
        return
      }
      await addCreatedFile(created)
    } catch (err) {
      host.setBanner('io', `${module.displayName}を作成できませんでした: ${describeError(err)}`)
    }
  }

  /**
   * ウィンドウ close のゲート（App.tsx の `interceptClose` からの移動）。
   * flush が失敗したら閉じず、代わりに脱出口を出す——書けていない編集を
   * 黙って捨てないが、閉じられなくなる状態も作らない
   */
  const requestClose = async (): Promise<boolean> => {
    // 回答待ちの間は未保存編集が額縁の履歴にしか無い（検知時点で saver を
    // dispose している）。saver が null だからと通すと、二択で守るはずの
    // 編集を黙って捨てて閉じることになる
    if (pendingAsk !== null) {
      host.showToast({
        key: 'close-blocked',
        message: '外部変更の扱いを選ぶまで閉じられません（ダイアログで選んでください）',
      })
      return false
    }
    if (saver === null) return true
    if (await saver.flush()) return true
    host.showModal({
      kind: 'confirm',
      // 閉じる操作を繰り返しても要求が積み上がらないように置き換える
      key: 'close',
      title: '保存できないため閉じられません',
      description:
        '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
      confirmLabel: '破棄して閉じる',
      onConfirm: async () => {
        saver?.dispose()
        // 破棄済みの saver を掴んだままにしない（forceClose が失敗した場合に
        // アプリが開き続ける。申し送り11節の残件）
        saver = null
        try {
          await io.forceClose()
        } catch (err) {
          // ここが無音だと「押したのに何も起きない（編集は失われている）」に見える
          host.setBanner('io', `ウィンドウを閉じられませんでした: ${describeError(err)}`)
        }
      },
    })
    return false
  }

  /** 出力の対象。editable な選択中ファイルと、額縁が持つ編集中データが揃ったときだけ */
  const currentDocument = (): { path: string; module: AnyToolModule; data: unknown } | null => {
    if (selectedPath === null) return null
    const entry = files.find((f) => f.path === selectedPath)
    if (entry === undefined || entry.result.status !== 'editable') return null
    const module = registry.get(entry.result.type)
    if (module === undefined) return null
    const data = host.getEditingData()
    if (data === null) return null
    return { path: selectedPath, module, data }
  }

  const copyMarkdown = async (): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      await io.copyText(doc.module.toMarkdown(doc.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: 'Markdown をクリップボードにコピーしました' })
    } catch (err) {
      host.setBanner('io', `クリップボードにコピーできませんでした: ${describeError(err)}`)
    }
  }

  const exportMarkdown = async (): Promise<void> => {
    const doc = currentDocument()
    if (doc === null) return
    try {
      const target = await io.askSavePath(doc.path.replace(/\.json$/i, '.md'))
      // キャンセルは失敗ではない。バナーを出さず黙って戻る
      if (target === null) return
      // **台帳へ記録しない**（writeAndRecord を通さない）——走査対象は .json だけなので、
      // 通常は記録しても次の再走査の retain で落ちる死に記録になる。ただし
      // 保存ダイアログはユーザーが拡張子を書き換えられる（ここで .json 強制はしない）
      // ので、「.md 書き出しは走査対象外」は実装が保証する前提ではなく、多くの場合に
      // 成り立つ想定にすぎない。仮に .json のまま書かれても、台帳に無い記録は
      // 次の外部変更として検知されるだけで、自己書き込み除外を誤って発動させる
      // 側の事故（本来検知すべき変更を見逃す）にはならない
      await io.write(target, doc.module.toMarkdown(doc.data))
      host.setBanner('io', null)
      host.showToast({ key: 'export', message: `Markdown を書き出しました: ${target}` })
    } catch (err) {
      host.setBanner('io', `Markdown を書き出せませんでした: ${describeError(err)}`)
    }
  }

  return {
    openFolder,
    selectFile,
    applyEdit,
    createNewFile,
    requestDelete,
    async externalChange() {
      await rescan()
    },
    ensureFileOfType,
    requestClose,
    copyMarkdown,
    exportMarkdown,
    dispose() {
      // **flush しない**——失敗で復元された pending を捨てる経路になる。
      // 実際のウィンドウ close は requestClose を通る
      saver?.dispose()
      saver = null
    },
  }
}
