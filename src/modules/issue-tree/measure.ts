/**
 * 課題ツリーの箱の寸法（DOM 非依存の定数だけ）。折り返しの規則は
 * core/canvas/wrap.ts が持つ。
 *
 * **定数と Tailwind クラスは必ず対で直すこと。** 測定が実際より小さいと、
 * ブラウザに与えられる幅が前提より狭くなり、測定より多い行数に折り返して
 * 文字が切れる（logic-tree M1 の measure.ts と同じ約束）
 */

/** 課題ノード。ロジックツリーのノードと同じ寸法（同じ役割の箱だから） */
export const ISSUE_MAX_WIDTH = 320
export const ISSUE_MIN_WIDTH = 96
export const ISSUE_PADDING_X = 10
export const ISSUE_PADDING_Y = 6
export const ISSUE_BORDER = 1
export const ISSUE_INSET_X = ISSUE_PADDING_X + ISSUE_BORDER
export const ISSUE_INSET_Y = ISSUE_PADDING_Y + ISSUE_BORDER
/** px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px */
export const ISSUE_BOX_CLASS = 'border px-2.5 py-1.5'

/**
 * 仮説カード。**幅は導出しない（固定）。**
 *
 * カードの中には文言・由来・メモ・イベントの根拠という**性質の違う文章が
 * 縦に積まれる**ので、一番長い行に幅を合わせると、短い仮説と長い仮説で
 * カード幅がばらつき、木が階段状に見える。シーケンスがガター幅を導出しない
 * と決めた（design-notes 論点7）のと同じ判断
 */
export const CARD_WIDTH = 320
export const CARD_PADDING_X = 10
export const CARD_PADDING_Y = 6
export const CARD_BORDER = 1
export const CARD_INSET_X = CARD_PADDING_X + CARD_BORDER
export const CARD_INSET_Y = CARD_PADDING_Y + CARD_BORDER
export const CARD_BOX_CLASS = 'border px-2.5 py-1.5'

/** カードを課題ノードの下へずらす量（「この課題に属する」ことを字下げで見せる） */
export const CARD_INDENT = 16
/** 課題ノードとカード、カードどうしの空き */
export const CARD_GAP = 6
/** カードの中の行どうしの空き */
export const ROW_GAP = 4
/** メモ行・イベントの根拠行の字下げ */
export const ROW_INDENT = 8
/** 問いバッジ・イベント種別ラベルの行の高さ（どちらも1行で固定） */
export const BADGE_HEIGHT = 20

/** カードの中の文章が使える幅 */
export const CARD_CONTENT_WIDTH = CARD_WIDTH - CARD_INSET_X * 2
