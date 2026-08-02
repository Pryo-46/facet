/**
 * デバウンス付き自動保存（コア・純ロジック。React 非依存）。
 * - baseline（読み込み時点の正規形）と同じ内容は書かない
 *   （「読み込み・閲覧では書き戻さない」原則。rev 5章）
 * - 書き込みは直列化する（前の write の完了を待ってから次を書く）
 * - write の失敗は console に出すにとどめる（UI への通知は M5 の外部変更検知と併せて設計する）
 */
export interface AutoSaver {
  update(text: string): void
  /** 保留中の書き込みを即時実行して完了を待つ（ファイル切替・終了時用） */
  flush(): Promise<void>
  dispose(): void
}

export function createAutoSaver(opts: {
  delayMs: number
  baseline: string
  write: (text: string) => Promise<void>
}): AutoSaver {
  let lastSaved = opts.baseline
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()

  const clearTimer = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }

  const commit = (): Promise<void> => {
    const text = pending
    pending = null
    clearTimer()
    if (text === null || text === lastSaved) return chain
    chain = chain
      .then(() => opts.write(text))
      .then(() => {
        lastSaved = text
      })
      .catch((err: unknown) => {
        console.error('自動保存に失敗しました', err)
      })
    return chain
  }

  return {
    update(text) {
      if (text === lastSaved) {
        pending = null
        clearTimer()
        return
      }
      pending = text
      clearTimer()
      timer = setTimeout(() => {
        void commit()
      }, opts.delayMs)
    },
    flush() {
      return commit()
    },
    dispose() {
      clearTimer()
      pending = null
    },
  }
}
