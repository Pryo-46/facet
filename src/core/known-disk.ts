/**
 * 「アプリが最後に読み書きしたディスクの内容」の台帳（コア・純ロジック）。
 *
 * 外部変更の判定は、走査で読んだ生テキストとこの台帳の突き合わせで行う。
 * 1バイトも違わなければそれは**自分の書き込み**である——これが
 * 自己書き込みの構造的除外（rev 3章）で、時間窓もフラグも使わないので
 * 遅れて届くイベントでも取りこぼしも誤検知もしない。
 *
 * **React の state に置かないこと。** 書き込み成功の記録が再レンダリングを
 * 待つと、その隙に走った再走査が自分の書き込みを外部変更と誤検知する。
 * App では `useRef(createKnownDisk())` で持ち、書き込みと同じタイミングで
 * 同期的に更新する
 */
export interface KnownDisk {
  get(path: string): string | undefined
  set(path: string, text: string): void
  delete(path: string): void
  /** 渡したパス以外を落とす（走査結果へ合わせる。外部削除の後始末を兼ねる） */
  retain(paths: Iterable<string>): void
  /** 全部落とす（フォルダを切り替えたとき。別フォルダの内容を持ち越さない） */
  clear(): void
}

export function createKnownDisk(): KnownDisk {
  const byPath = new Map<string, string>()
  return {
    get(path) {
      return byPath.get(path)
    },
    set(path, text) {
      byPath.set(path, text)
    },
    delete(path) {
      byPath.delete(path)
    },
    retain(paths) {
      const keep = new Set(paths)
      for (const path of [...byPath.keys()]) {
        if (!keep.has(path)) byPath.delete(path)
      }
    },
    clear() {
      byPath.clear()
    },
  }
}
