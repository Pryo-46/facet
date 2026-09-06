/**
 * アプリの設定の値・既定・正規化。
 *
 * **ファイルもストアも知らない。** 往復は `src/fs/settings-fs.ts`、実行時の値は
 * `src/core/settings-store.ts` が持つ（コアは Tauri を知らないという分担）。
 *
 * **`lastProjectDir` はここに入れない。** 同じ `settings.json` に載るが、
 * 利用者が選ぶ値ではなく前回の状態の記録で、設定画面にも出ない
 */

export type Theme = 'light' | 'dark' | 'system'

export interface CanvasSettings {
  /** 地（箱もチップも無い面）の上の左ドラッグでパンする */
  panWithEmptyDrag: boolean
  panWithSpaceDrag: boolean
  panWithMiddleDrag: boolean
  /** 有効な間はキャンバスの `contextmenu` を止める */
  panWithRightDrag: boolean
  /** 修飾キーの無いホイールでズームする。`Ctrl+ホイール` は設定に関わらず効く */
  zoomWithoutModifier: boolean
}

export interface AppSettings {
  theme: Theme
  canvas: CanvasSettings
}

/**
 * 右ドラッグだけ既定を落とす。rev 10章が右クリックをコンテキストメニューに
 * 予約しているので、選んだ人にだけ `contextmenu` の抑止が掛かる形にする
 */
export const DEFAULT_SETTINGS: AppSettings = {
  theme: 'system',
  canvas: {
    panWithEmptyDrag: true,
    panWithSpaceDrag: true,
    panWithMiddleDrag: true,
    panWithRightDrag: false,
    zoomWithoutModifier: true,
  },
}

/** パンの手段。設定画面が「最後の1つ」を無効化する判定にも使う */
export const PAN_KEYS = [
  'panWithEmptyDrag',
  'panWithSpaceDrag',
  'panWithMiddleDrag',
  'panWithRightDrag',
] as const satisfies readonly (keyof CanvasSettings)[]

const THEMES: readonly Theme[] = ['light', 'dark', 'system']

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {}
}

function readBool(source: Record<string, unknown>, key: keyof CanvasSettings): boolean {
  const value = source[key]
  return typeof value === 'boolean' ? value : DEFAULT_SETTINGS.canvas[key]
}

/**
 * 読み込んだ JSON を設定に均す。**壊れていても投げない**——設定が読めないことは
 * 起動を止める理由にならないので、欠けたキー・型の違う値・列挙に無い文字列を
 * 既定で埋める。
 *
 * **パンの手段が4つとも false の入力は空きドラッグを起こす。** 盤面を動かせない
 * アプリになる状態をファイルから作れないようにする（起こすのは1つだけで、
 * 他の選択には触らない）
 */
export function normalizeSettings(raw: unknown): AppSettings {
  const root = asRecord(raw)
  const source = asRecord(root.canvas)
  const canvas: CanvasSettings = {
    panWithEmptyDrag: readBool(source, 'panWithEmptyDrag'),
    panWithSpaceDrag: readBool(source, 'panWithSpaceDrag'),
    panWithMiddleDrag: readBool(source, 'panWithMiddleDrag'),
    panWithRightDrag: readBool(source, 'panWithRightDrag'),
    zoomWithoutModifier: readBool(source, 'zoomWithoutModifier'),
  }
  if (!PAN_KEYS.some((key) => canvas[key])) canvas.panWithEmptyDrag = true
  return {
    theme: THEMES.find((theme) => theme === root.theme) ?? DEFAULT_SETTINGS.theme,
    canvas,
  }
}
