/**
 * `palette.css` が満たすべき**契約**。
 *
 * ★ ここは配色ではない。★ 色値は1つも持たない。「どのトークンが要るか」
 *   「どの面の上で何:1 を満たすべきか」「半透明はどの濃さを使うか」だけを持つ。
 *   **配色を差し替えてもこのファイルは変わらない。**
 *
 * 読み手は2つある——`palette.test.ts`（検査する）と
 * `.claude/skills/palette-retheme/scripts/palette-fit.mjs`（差し替え時に測る）。
 * **同じ表を2箇所に書かないためにここへ出した。** 書き写すと、片方だけ
 * 直したときに検算と検査が食い違ったまま両方が緑を返す。
 *
 * **このファイルは上記の `.mjs` から Node の型ストリップで直接 import される**
 * （設計スペック 決定H）。だから消去可能な構文だけで書くこと——`enum` や
 * コンストラクタのパラメータプロパティを入れると型ストリップが落ちる。
 */

/** コメントを落としてから読む（`}` を含むコメントがブロック抽出を壊さないように） */
export const stripCssComments = (css: string): string => css.replace(/\/\*[\s\S]*?\*\//g, '')

/** `:root { ... }` / `.dark { ... }` から `--name: value` を拾う */
export function readTokenBlock(
  css: string,
  selectorPattern: string,
  label: string,
): Record<string, string> {
  const m = new RegExp(`${selectorPattern}\\s*\\{([^}]*)\\}`).exec(css)
  if (m === null) throw new Error(`${label} のブロックが palette.css に見つからない`)
  const out: Record<string, string> = {}
  for (const line of m[1].split('\n')) {
    const d = /^\s*--([a-z-]+)\s*:\s*([^;]+);/.exec(line)
    if (d !== null) out[d[1]] = d[2].trim()
  }
  return out
}

export const TOKENS = [
  'canvas',
  'surface',
  'surface-accent',
  'ink',
  'ink-muted',
  'ink-faint',
  'rule',
  'grid',
  'warning',
  'ok',
  'warning-fg',
  'ok-fg',
] as const

export const MODES = [
  { label: 'ライト', pattern: ':root' },
  { label: 'ダーク', pattern: '\\.dark' },
] as const

/**
 * 背景に対して満たすべきコントラスト。
 *
 * **`grid` がここに無いのは意図的。** 方眼紙の線は純粋な装飾であり、
 * WCAG 1.4.11（情報を伝える非テキスト UI 要素は 3:1）の対象外。
 * むしろ薄いことに意味がある（設計スペック 決定2）
 */
export const REQUIREMENTS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
  // **非アクティブな内容の文字と枠。** WCAG 1.4.3 は非アクティブ UI 部品を
  // 本文の 4.5:1 から免除しているが、読めなくてよいわけではない——
  // 「いま作業する面ではない」と読めて、かつ消えて見えない段として 3:1 を課す。
  // **アクティブな本文に使わない**（使うと本文の保証を割る）
  { token: 'ink-faint', min: 3.0, use: '非アクティブの文字・枠（抑制された配下）' },
  { token: 'rule', min: 3.0, use: 'セル境界・入力枠' },
  { token: 'warning', min: 4.5, use: '未定義・削除' },
  { token: 'ok', min: 4.5, use: '確定・応答' },
] as const

/**
 * **背景は canvas と surface の両方を見る。**
 * テーブルもカードもモーダルも surface の上に乗るので、canvas だけで
 * 満たしても足りない（実際、ダークの rule を canvas だけ見て決めたとき
 * surface 上で 2.997:1 と 3:1 を割った）
 */
export const BACKGROUNDS = ['canvas', 'surface'] as const

/**
 * warning / ok を面として使うときに載せる文字色の要件。
 *
 * **`REQUIREMENTS` には無い。** warning-fg / ok-fg は自分の面（warning /
 * ok）の上にしか載らない専用の文字色で、`BACKGROUNDS`（canvas / surface）に
 * 対して測る意味が無い。`REQUIREMENTS` の形（token, min, use）に、載る面を
 * 指す `face` を足しただけで、意味は同じ
 */
export const FACE_REQUIREMENTS = [
  { token: 'warning-fg', face: 'warning', min: 4.5, use: '警告・削除の面の文字' },
  { token: 'ok-fg', face: 'ok', min: 4.5, use: '確定・応答の面の文字' },
] as const

/**
 * 半透明の重ね合わせ（M8 決定11）。**値は GlossaryEditor.tsx の
 * errorCell / warnCell と一致していなければならない**（下の紐づき検査が見る）
 */
export const OVERLAYS = [
  { label: 'エラーセル', alpha: 0.2, className: 'bg-warning/20' },
  { label: '未定義・未分類セル', alpha: 0.1, className: 'bg-warning/10' },
] as const

/**
 * これらの面の上に置く文字。**warning は置かない**（M8 決定12）——
 * 測ると warning/10 の面の上で 4.59:1 しか出ず、同系色が重なって読みにくい
 */
export const OVERLAY_FOREGROUNDS = [
  { token: 'ink', use: '本文' },
  { token: 'ink-muted', use: 'プレースホルダ「未定義」' },
] as const

/**
 * 閾値ちょうどを置かない（M7 の教訓）。**この余裕は `palette-fit.mjs` の
 * 提案（`fitLightness` に渡す条件）とも共有する。** 値を変えるならここ
 * 1箇所を直せば両方に効く——書き写すと片方だけ直したときに食い違う。
 */
export const MARGIN = 1.03

/** 本文 4.5:1 に `MARGIN` の余裕を載せた、重ね合わせの面の要件 */
export const OVERLAY_MIN = 4.5 * MARGIN

/**
 * 見出しの面（テーブルのカラム名・選択中タブ）。**issue-tree の見送った課題
 * 自身の箱の塗りもこの面を流用している**（`IssueBox.tsx`。新しいトークンを
 * 足す代わりに検算済みの面を再利用した。役割が2つになった経緯と、
 * 「未決を面で塗らない」「地の色に落とさない」の既存規則がなぜ及ばないかは
 * `docs/issue-tree/仮説検証モジュール-設計ノート.md` D8）。載る文字は
 * どちらの用途でも `ink` / `ink-muted` だけなので、下の検証はそのままでよい。
 *
 * **`BACKGROUNDS` に入れないのは意図的。** あちらは「あらゆる役割トークンが
 * 載りうる汎用の面」（地とカードの面）の集合で、`surface-accent` の上に載るのは
 * 見出しの文字と見送りの箱の文字だけである。`warning` や `ok` や `rule` を
 * この面の上で要件を満たすよう縛ると、淡い緑を選べなくなる（この面より
 * 暗い色でしか 3:1 / 4.5:1 を作れないため）。**載らないものを検証しない**
 * 代わりに、載るものは両モードで必ず検証する
 */
export const HEADING_FACE = 'surface-accent' as const

/** `HEADING_FACE` の上に置く文字。載るのはカラム名の文字と、見送った課題の箱の文字（タイトル・バッジ・理由） */
export const HEADING_FACE_FOREGROUNDS = [
  { token: 'ink', min: 4.5, use: '本文・見出し' },
  { token: 'ink-muted', min: 4.5, use: '抑えた文字' },
] as const
