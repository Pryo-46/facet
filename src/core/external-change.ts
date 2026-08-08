import type { ProjectFile } from './project-file'
import { toProjectFile, type ScanEntry, type ScanResult } from './scan'

/**
 * 選択中ファイルに対して額縁が取る行動。
 * 「マージ UI は作らない」（rev 3章）ので、選択肢はこの4つに閉じる
 */
export type SelectedAction =
  | { kind: 'none' }
  /** 未保存編集なし → 再読込。stashText は取り込み前のバイト列（退避用） */
  | { kind: 'reload'; path: string; name: string; stashText: string | undefined }
  /** 未保存編集あり → 二択ダイアログ。diskText は上書き時の新しい baseline */
  | { kind: 'ask'; path: string; name: string; diskText: string }
  /** 外部で消えた → 選択を落として後始末（**書き戻さない**） */
  | { kind: 'gone'; path: string; name: string }

export interface ExternalChangePlan {
  /** 何も変わっていない（＝自己書き込みだけだった）なら false。適用を丸ごと省ける */
  hasChanges: boolean
  /** 適用後の一覧。既存の並びを保ち、増えた分を末尾に足す */
  next: ProjectFile[]
  selected: SelectedAction
  /** 非モーダル通知に流す内容（選択中ファイル以外の増減・変更）。
   *  key を持つのは、同じファイルの古い通知——特に「取り込み前に戻す」を
   *  載せた操作付きトースト——を新しい検知で必ず置き換えるため。
   *  残っていると、古い退避テキストで新しい外部変更を無言で潰せてしまう */
  notices: { key: string; message: string }[]
}

/**
 * 走査結果と台帳を突き合わせて、外部変更への行動を決める（コア・純関数）。
 *
 * **自己書き込みの除外はここ1箇所で成立する**——`knownText(path)` が返すのは
 * 「アプリが最後に読み書きした内容」なので、走査で読んだ生テキストと
 * 1バイトも違わなければ自分の書き込みである。時間窓もフラグも使わないので、
 * イベントが遅れて届いても取りこぼさず、誤検知もしない（rev 3章）。
 *
 * 削除・新規作成も同じ仕組みで外れる——アプリが作ったファイルは作成時に
 * 台帳へ記録され、消したファイルは一覧と台帳の両方から落ちるので、
 * 跳ね返ってきたイベントは差分ゼロになる
 */
export function planExternalChange(args: {
  prev: readonly ProjectFile[]
  scan: ScanResult
  knownText: (path: string) => string | undefined
  selectedPath: string | null
  hasUnsavedEdits: boolean
}): ExternalChangePlan {
  const prevPaths = new Set(args.prev.map((f) => f.path))
  const scannedPaths = new Set(args.scan.entries.map((e) => e.path))
  const unreadable = new Set(args.scan.unreadable)
  const byPath = new Map(args.scan.entries.map((e) => [e.path, e]))

  const changed: ScanEntry[] = []
  const added: ScanEntry[] = []
  for (const e of args.scan.entries) {
    if (!prevPaths.has(e.path)) {
      added.push(e)
    } else if (args.knownText(e.path) !== e.text) {
      // 台帳に記録が無い（undefined）場合も変更として扱う——不変を証明できない
      changed.push(e)
    }
  }
  // 読めなかったパスは「消えた」と区別できないので消えた扱いにしない
  const removed = args.prev.filter((f) => !scannedPaths.has(f.path) && !unreadable.has(f.path))

  const kept = args.prev
    .filter((f) => scannedPaths.has(f.path) || unreadable.has(f.path))
    .map((f) => {
      const e = byPath.get(f.path)
      // 読めなかったファイルは前回の内容をそのまま残す
      return e === undefined ? f : { ...f, name: e.name, result: e.result }
    })
  const next = [...kept, ...added.map(toProjectFile)]

  const selected = ((): SelectedAction => {
    const path = args.selectedPath
    if (path === null) return { kind: 'none' }
    const gone = removed.find((f) => f.path === path)
    if (gone !== undefined) return { kind: 'gone', path, name: gone.name }
    const hit = changed.find((e) => e.path === path)
    if (hit === undefined) return { kind: 'none' }
    return args.hasUnsavedEdits
      ? { kind: 'ask', path, name: hit.name, diskText: hit.text }
      : { kind: 'reload', path, name: hit.name, stashText: args.knownText(path) }
  })()

  // 選択中ファイルの通知は呼び出し側が出す（退避の操作ボタンを載せるため）
  const notices = [
    ...changed
      .filter((e) => e.path !== args.selectedPath)
      .map((e) => ({ key: `external:${e.path}`, message: `外部の変更を読み込みました: ${e.name}` })),
    ...added.map((e) => ({ key: `external:${e.path}`, message: `ファイルが増えました: ${e.name}` })),
    ...removed
      .filter((f) => f.path !== args.selectedPath)
      .map((f) => ({
        key: `external:${f.path}`,
        message: `ファイルが外部で削除されました: ${f.name}`,
      })),
  ]

  return {
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
    next,
    selected,
    notices,
  }
}
