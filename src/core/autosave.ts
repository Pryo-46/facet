/**
 * デバウンス付き自動保存（コア・純ロジック。React 非依存）。
 * - baseline（読み込み時点の正規形）と同じ内容は書かない
 *   （「読み込み・閲覧では書き戻さない」原則。rev 5章）
 * - 書き込みは直列化する（前の write の完了を待ってから次を書く）
 * - write の失敗は console に出しつつ、onError/onSuccess で UI に通知する
 */
export interface AutoSaver {
  update(text: string): void
  /**
   * 保留中の書き込みを即時実行し、**chain が静止するまで**繰り返し待つ。
   * 単に「その時点の chain」を await するだけでは足りない——await 中に
   * デバウンスタイマーが発火すると commit() が chain を再代入し、古いリンクで
   * 解決してしまう（進行中の write を残したまま close のゲートを通る。申し送り10節）。
   * 戻り値は静止した時点の書き残しの有無（true＝成功または書くものが無い）。
   * write が失敗していれば false になるが、失敗した内容の再試行はこの呼び出しの
   * 中では行わない——次の flush() またはタイマーに任せる（M4 の意味論のまま）
   */
  flush(): Promise<boolean>
  /**
   * 進行中の書き込みの完了だけを待つ。**保留中の内容は書かない。**
   * 削除経路（file-ops の trashFile）が「消すファイルへ書かせずに、
   * 既に飛んだ write の着地を待つ」ために使う
   */
  settle(): Promise<void>
  /** ディスクに書けていない編集があるか（デバウンス中・in-flight・失敗して再試行待ち） */
  hasUnsaved(): boolean
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
  // 直近に要求された内容（復元の適否判定に使う。lastSaved はディスク確定値、latest は要求値）
  let latest = opts.baseline
  let inFlight = false
  let pending: string | null = null
  let timer: ReturnType<typeof setTimeout> | null = null
  let chain: Promise<void> = Promise.resolve()

  /**
   * flush / settle の打ち切り回数。await 中に新しい write が積まれ続けると
   * （タイマー発火のたびに chain が再代入され）静止判定がいつまでも終わらない
   * ため、回数で打ち切る。commit() はタイマーを待たず即時に書くので、
   * 人間の打鍵速度で5回を使い切ることは実質ない
   */
  const FLUSH_MAX_ROUNDS = 5

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
        // 失敗した内容を pending に戻し、後続の flush()/タイマーで再試行可能にする。
        // ただし失敗した内容が最新の要求（latest）でないなら復元しない——
        // 後続の write が最新を書いた後に古い内容で上書きする巻き戻りを防ぐ
        if (pending === null && text === latest) pending = text
      })
    return chain
  }

  return {
    update(text) {
      latest = text
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
      for (let round = 0; round < FLUSH_MAX_ROUNDS; round++) {
        const target = commit()
        await target
        // await 中にタイマーが発火していれば chain は別物に差し替わっている——
        // その write も待つ（ここが「静止」の判定）。静止していれば、
        // 書き残しの有無は pending がそのまま答える（write 失敗時は
        // catch が pending へ復元しており、再試行は次の flush が行う）
        if (chain === target) return pending === null
      }
      // 打ち切り。静止を確認できていないので false を返す——close のゲートは
      // 閉じない側に倒すのが安全（脱出口は App 側の「破棄して閉じる」）
      return false
    },
    async settle() {
      for (let round = 0; round < FLUSH_MAX_ROUNDS; round++) {
        const target = chain
        await target
        if (chain === target) return
      }
    },
    hasUnsaved() {
      // lastSaved はディスク確定値、latest は直近に要求された内容
      return latest !== lastSaved
    },
    dispose() {
      clearTimer()
      pending = null
    },
  }
}
