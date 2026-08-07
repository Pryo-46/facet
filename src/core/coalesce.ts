/**
 * 立て続けに来る通知を1回の実行に束ねる（末尾で1回だけ走らせる。コア・純ロジック）。
 *
 * fs プラグインの watch は既にデバウンスしているが、**1回のファイル保存でも
 * 複数のイベント（作成・内容変更・メタデータ変更）を個別に送ってくる**ため、
 * 再走査を1回にまとめる層がもう1枚要る。
 * 自動保存のデバウンス（autosave.ts）とは別物——あちらは「書く内容」を
 * まとめるもので、こちらは「読み直す回数」をまとめるもの
 */
export interface Coalescer {
  notify(): void
  dispose(): void
}

export function createCoalescer(delayMs: number, run: () => void): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    notify() {
      clear()
      timer = setTimeout(() => {
        timer = null
        run()
      }, delayMs)
    },
    dispose() {
      clear()
    },
  }
}
