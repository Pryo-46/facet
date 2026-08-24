/**
 * シーケンス図の箱の寸法定数とラベル文字列の組み立て。
 * 折り返しの規則そのものは `@/core/canvas/wrap.ts` が持つ（M20 でコアへ引き上げた）。
 */

/** ステップ文言の最大幅。logic-tree のノードと同じ値（tech-notes 論点4の根拠を引き継ぐ） */
export const LABEL_MAX_WIDTH = 320
export const LABEL_MIN_WIDTH = 64
export const LABEL_PADDING_X = 6
export const LABEL_PADDING_Y = 2
export const LABEL_BORDER = 0
export const LABEL_INSET_X = LABEL_PADDING_X + LABEL_BORDER
export const LABEL_INSET_Y = LABEL_PADDING_Y + LABEL_BORDER
/** 上の定数に対応する Tailwind クラス。片方だけ変えないこと */
export const LABEL_BOX_CLASS = 'px-1.5 py-0.5'

/** self ボックス。枠線があるぶん inset が違う */
export const SELF_PADDING_X = 10
export const SELF_PADDING_Y = 6
export const SELF_BORDER = 1
export const SELF_INSET_X = SELF_PADDING_X + SELF_BORDER
export const SELF_INSET_Y = SELF_PADDING_Y + SELF_BORDER
export const SELF_MIN_WIDTH = 96
export const SELF_BOX_CLASS = 'border px-2.5 py-1.5'

/** 参加者ヘッダ */
export const ACTOR_MIN_WIDTH = 96
export const ACTOR_MAX_WIDTH = 240
export const ACTOR_PADDING_X = 12
export const ACTOR_BORDER = 1
export const ACTOR_INSET_X = ACTOR_PADDING_X + ACTOR_BORDER
export const ACTOR_BOX_CLASS = 'border px-3 py-1'

/** ガターの答えセル。内容幅は固定（design-notes 論点7: ガター幅は導出しない） */
export const ANSWER_CONTENT_WIDTH = 240
export const ANSWER_PADDING_X = 8
export const ANSWER_PADDING_Y = 4
export const ANSWER_BORDER = 1
export const ANSWER_INSET_X = ANSWER_PADDING_X + ANSWER_BORDER
export const ANSWER_INSET_Y = ANSWER_PADDING_Y + ANSWER_BORDER
export const ANSWER_BOX_CLASS = 'border px-2 py-1'

/**
 * notApplicable の答えは GutterSlot が「考慮不要」の接頭ぶん左を空ける
 * （`pl-18` = 4.5rem = 72px。M23 で本文 16px 化に伴い `pl-16` から広げた
 * （接頭「考慮不要」4字×16px＝64px が `left-2`(8px) から始まるため 8+64=72）。
 * 実効幅が狭くなるのは差分の 64px（72−8）。SequenceEditor の折り返し測定は
 * この狭さを見積もりに反映しないと、reason 付きの notApplicable で行数を
 * 過小に見積もり、CellInput の `overflow-hidden` で下端が欠ける。
 * **GutterSlot.tsx の `pl-18` と対応する。片方だけ変えないこと**
 */
export const ANSWER_NOT_APPLICABLE_PREFIX_PAD_X = 72

/**
 * ラベル列に実際に描画される文字列（ifExecuted の「└ 」接頭を含む）。
 * **測る文字列と描く文字列を同じにするため**、GutterSlot の描画も
 * SequenceEditor の questionHeight もこの戻り値だけを見る。素の問い文言を
 * 測ると接頭辞のぶん短く出て、折り返しが1行足りず下の行へ食い込む。
 * ANSWER_BOX_CLASS と同じ理由でこの純粋層に置く——描画と測定の共通語彙は、
 * 部品側に置くと測定側から見えず二重定義になる
 */
export function gutterLabelText(question: string, indent: boolean): string {
  return indent ? `└ ${question}` : question
}

export {
  wrapWithin,
  createEstimateMeasurer,
  type MeasureWidth,
  type WrapOptions,
  type WrappedBlock,
} from '@/core/canvas/wrap'
