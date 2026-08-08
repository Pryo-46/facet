/**
 * モーダルの要求キュー（コア・純ロジック）。
 *
 * スロットが1つだと、生産者が増えた時点で要求が無言で落ちる——削除確認を
 * 出したまま OS の × を押すと「破棄して閉じる」の要求に上書きされる、など。
 * M5 で外部変更の二択が3人目の生産者になるのでキューにした（申し送り10節）
 */
export type ModalRequest =
  | {
      kind: 'confirm'
      /** 同じ key の要求は置き換える（同じ操作の再試行を積み上げない） */
      key?: string
      title: string
      description: string
      confirmLabel: string
      onConfirm: () => void | Promise<void>
    }
  | {
      kind: 'choice'
      key?: string
      title: string
      description: string
      primaryLabel: string
      secondaryLabel: string
      onPrimary: () => void | Promise<void>
      onSecondary: () => void | Promise<void>
    }

export function pushModal(
  queue: readonly ModalRequest[],
  request: ModalRequest,
): ModalRequest[] {
  const at = request.key === undefined ? -1 : queue.findIndex((r) => r.key === request.key)
  return at >= 0 ? queue.map((r, i) => (i === at ? request : r)) : [...queue, request]
}

/** 表示中（先頭）の要求を片付ける */
export function shiftModal(queue: readonly ModalRequest[]): ModalRequest[] {
  return queue.slice(1)
}

/**
 * 同じ key の要求を取り下げる。前提が消えた要求——外部で消えたファイルの二択、
 * 削除済みファイルの削除確認——を残すと、押しても no-op か読み込みエラーに退化する
 */
export function dropModal(queue: readonly ModalRequest[], key: string): ModalRequest[] {
  return queue.filter((r) => r.key !== key)
}

/** 全部取り下げる（フォルダを切り替えたとき。前のフォルダへの要求は意味を失う） */
export function clearModals(): ModalRequest[] {
  return []
}
