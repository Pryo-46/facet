import type { AutoSaver } from './autosave'
import { serialize } from './canonical'
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
  /** アンマウント時。**flush しない**（失敗で復元された pending を捨てないため） */
  dispose(): void
}

function describeError(err: unknown): string {
  return err instanceof Error ? err.message : String(err)
}

export function createAppController(
  io: AppIo,
  host: AppHost,
  registry: ModuleRegistry,
): AppController {
  // ---- 状態（すべてクロージャ変数。共有マップは計画書の「状態変数の共有マップ」） ----
  // projectDir / selectedPath のローカルミラーは Task 5〜7（createNewFile が projectDir を、
  // requestDelete / externalChange が selectedPath を読む）で要る。この段階のメソッド
  // （openFolder/selectFile/applyEdit/dispose）はどちらも読まないので、いま置くと
  // noUnusedLocals に落ちる。host への通知（setProjectDir/setSelectedPath）はそのまま
  // 行い、ローカル変数は必要になる Task 5 で足す
  let files: ProjectFile[] = []
  let saver: AutoSaver | null = null
  /** ディスクの既知内容の台帳。自己書き込み除外の要（rev 3章） */
  const knownDisk = createKnownDisk()
  /** selectFile / openFolder の直列化トークン。後続が始まったら先行の結果を捨てる */
  let selectSeq = 0
  /**
   * フォルダ切替中の再走査を止める。**カウンタであること**——boolean だと
   * openFolder が2重に走ったとき、先の finally が後の切替中にフラグを消す。
   * 読むのは Task 5 の externalChange（`_switchingFolder > 0` なら再走査を捨てる）で、
   * この段階では増減だけなので `_` を付ける（oxlint の no-unused-vars 対策。
   * Task 5 で読み出しが増えたら外す）
   */
  let _switchingFolder = 0

  const applyFiles = (next: ProjectFile[]): void => {
    files = computeIssues(next, registry)
    host.setFiles(files)
  }

  const setSelected = (path: string | null): void => {
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
    _switchingFolder++
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
      _switchingFolder--
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

  return {
    openFolder,
    selectFile,
    applyEdit,
    dispose() {
      // **flush しない**——失敗で復元された pending を捨てる経路になる。
      // 実際のウィンドウ close は requestClose を通る
      saver?.dispose()
      saver = null
    },
  }
}
