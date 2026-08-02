/**
 * デバウンス付き自動保存（コア・純ロジック。React 非依存）。
 * - baseline（読み込み時点の正規形）と同じ内容は書かない
 *   （「読み込み・閲覧では書き戻さない」原則。rev 5章）
 * - 書き込みは直列化する（前の write の完了を待ってから次を書く）
 * - write の失敗は console に出しつつ、onError/onSuccess で UI に通知する
 */
export interface AutoSaver {
  update(text: string): void
  /** 保留中の書き込みを即時実行して完了を待つ。true＝書き残しなし（成功または書くものが無い） */
  flush(): Promise<boolean>
  dispose(): void
}

export function createAutoSaver(opts: {
  delayMs: number
  baseline: string
  write: (text: string) => Promise<void>
  /** write 失敗時（UI 通知用。再試行は saver 自身が pending 復元で行う） */
  onError?: (err: unknown) => void
  /** write 成功時（エラー表示の解除用） */
  onSuccess?: () => void
}): AutoSaver {
  let lastSaved = opts.baseline
  let inFlight = false
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
    if (text === null) return chain
    chain = chain
      .then(async () => {
        // 実行時点で直前の書き込み結果（lastSaved）と比較する。
        // 成功していれば重複を弾き、失敗していれば書き直しになる。
        if (text === lastSaved) return
        inFlight = true
        try {
          await opts.write(text)
          lastSaved = text
          opts.onSuccess?.()
        } finally {
          inFlight = false
        }
      })
      .catch((err: unknown) => {
        console.error('自動保存に失敗しました', err)
        opts.onError?.(err)
        // 失敗した内容を pending に戻し、後続の flush()/タイマーで再試行可能にする
        // （すでに新しい編集が pending にあるならそちらが優先）
        if (pending === null) pending = text
      })
    return chain
  }

  return {
    update(text) {
      // 早期 no-op は write が飛んでいない時だけ安全
      if (text === lastSaved && !inFlight) {
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
    async flush() {
      await commit()
      // 失敗時は catch が pending に復元しているので、ここで書き残しの有無が分かる
      return pending === null
    },
    dispose() {
      clearTimer()
      pending = null
    },
  }
}
