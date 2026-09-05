/**
 * 自動アップデートの状態（コア・純ロジック。React も Tauri も知らない）。
 *
 * **持たせる判断は3つだけ**:
 * - checking / installing の間は新しいチェックを受け付けない
 *   （手動ボタンの連打と起動時チェックが重なりうる）
 * - installing からは error にしか抜けない——成功するとアプリが終了するので、
 *   成功の状態を持つ意味が無い
 * - ボタンの見え方を状態から導く（App.tsx に kind の分岐を散らさない）
 *
 * 遷移関数は**受け付けない要求に対して同じ参照を返す。** 新しいオブジェクトを
 * 作って返すと、React が「変わった」と見て再描画する
 */
export type UpdateState =
  | { kind: 'idle' }
  /** 確認中 */
  | { kind: 'checking' }
  /** 確認したが最新だった */
  | { kind: 'none' }
  | { kind: 'available'; version: string }
  /** `total` は Started イベントが総量を知らせるまで null */
  | { kind: 'installing'; version: string; downloaded: number; total: number | null }
  | { kind: 'error'; message: string }

export const initialUpdateState: UpdateState = { kind: 'idle' }

export function startCheck(state: UpdateState): UpdateState {
  if (state.kind === 'checking' || state.kind === 'installing') return state
  return { kind: 'checking' }
}

export function foundUpdate(state: UpdateState, version: string): UpdateState {
  // 遅れて届いた結果が installing を巻き戻さないようにする
  if (state.kind !== 'checking') return state
  return { kind: 'available', version }
}

export function foundNone(state: UpdateState): UpdateState {
  if (state.kind !== 'checking') return state
  return { kind: 'none' }
}

export function startInstall(state: UpdateState): UpdateState {
  if (state.kind !== 'available') return state
  return { kind: 'installing', version: state.version, downloaded: 0, total: null }
}

/**
 * ダウンロードの進捗。`chunk` は今回届いたバイト数（累計ではない）。
 * **一度分かった総量を null で上書きしない**——Started は1回しか来ず、
 * その後の Progress は総量を運ばない
 */
export function progress(state: UpdateState, chunk: number, total: number | null): UpdateState {
  if (state.kind !== 'installing') return state
  return { ...state, downloaded: state.downloaded + chunk, total: total ?? state.total }
}

export function failed(state: UpdateState, message: string): UpdateState {
  if (state.kind !== 'checking' && state.kind !== 'installing') return state
  return { kind: 'error', message }
}

export function canCheck(state: UpdateState): boolean {
  return state.kind !== 'checking' && state.kind !== 'installing'
}

/**
 * ボタンの名前。**「今どちらか」でなく「押すとどうなるか」**を名乗る
 * （額縁の他のアイコンボタンと同じ規則。App.tsx のテーマトグルのコメント）
 */
export function buttonLabel(state: UpdateState): string {
  if (state.kind === 'available') return `v${state.version} に更新`
  if (state.kind === 'installing') return '更新中'
  return '更新を確認'
}

export function isEmphasized(state: UpdateState): boolean {
  return state.kind === 'available'
}
