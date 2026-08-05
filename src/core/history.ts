/**
 * Undo/Redo の履歴（コア・純関数。React 非依存）。
 * 開いているファイル単位・メモリ内のみ。それ以前への復帰は Git の担当
 *（rev 5章の二層構造 / rev 10章のグローバル層）。
 */
export interface HistoryState<T> {
  past: T[]
  present: T
  future: T[]
  /** 直近 record のまとめキー。null＝まとめない（構造操作） */
  lastKey: string | null
  /** 直近 record の時刻（ミリ秒） */
  lastAt: number
}

/** 保持する履歴の上限。会議1回分の編集には十分で、メモリは有界にする */
export const HISTORY_LIMIT = 100
/** 同一セルへの連続入力を1履歴にまとめる時間窓（ミリ秒） */
export const COALESCE_MS = 500

export function createHistory<T>(present: T): HistoryState<T> {
  return { past: [], present, future: [], lastKey: null, lastAt: Number.NEGATIVE_INFINITY }
}

/**
 * 新しい状態を積む。mergeKey が直前と同じで時間窓の内なら、履歴を増やさず
 * present だけ差し替える（1打鍵＝1履歴だと会議中に使い物にならないため）
 */
export function record<T>(
  h: HistoryState<T>,
  next: T,
  mergeKey: string | null,
  now: number,
): HistoryState<T> {
  const mergeable = mergeKey !== null && mergeKey === h.lastKey && now - h.lastAt <= COALESCE_MS
  if (mergeable) {
    return { ...h, present: next, future: [], lastAt: now }
  }
  const past = [...h.past, h.present]
  return {
    past: past.length > HISTORY_LIMIT ? past.slice(past.length - HISTORY_LIMIT) : past,
    present: next,
    future: [],
    lastKey: mergeKey,
    lastAt: now,
  }
}

export function canUndo(h: HistoryState<unknown>): boolean {
  return h.past.length > 0
}

export function canRedo(h: HistoryState<unknown>): boolean {
  return h.future.length > 0
}

/** 戻れないときは同一参照を返す（呼び出し側が「変化なし」を参照比較で判定できる） */
export function undo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.past.length === 0) return h
  return {
    past: h.past.slice(0, -1),
    present: h.past[h.past.length - 1],
    future: [h.present, ...h.future],
    // 戻った直後の入力を、戻る前の履歴にまとめない
    lastKey: null,
    lastAt: Number.NEGATIVE_INFINITY,
  }
}

export function redo<T>(h: HistoryState<T>): HistoryState<T> {
  if (h.future.length === 0) return h
  return {
    past: [...h.past, h.present],
    present: h.future[0],
    future: h.future.slice(1),
    lastKey: null,
    lastAt: Number.NEGATIVE_INFINITY,
  }
}
