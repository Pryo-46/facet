/**
 * 出力（Markdown 表 ＋ Mermaid）に現れる語。**1箇所に置く。**
 * 表と図で同じ状態を別の語で書くと、読み手は2つの語彙を覚えることになる。
 *
 * `mermaid.ts` と `markdown.ts` の両方が読む。定数だけを持つ独立したファイルに
 * するのは、どちらか一方に置くと import が循環するため（markdown.ts は
 * sequenceToMermaid を呼ぶ）
 */

/** 問いは立っているが答えていない／文言が空。既存2ツールの出力と同じ語 */
export const UNDEFINED_VALUE = '（未定義）'

/** notApplicable（人が「考えなくてよい」と決めた）。画面の GutterSlot も同じ語を出す（M22。─ の記号は初見に意図が伝わらないためやめた） */
export const NOT_APPLICABLE_LABEL = '考慮不要'

/**
 * 参照が引けない（from / to が actors に無い、call / reply に to が無い）。
 * **行を落とす代わりにこの語へ寄せる**——図から消すと、貼った先の仕様書では
 * 不完全なのに完全に見える（「仕様書に貼った瞬間に見えなくなる」の再生産）
 */
export const UNRESOLVED_ACTOR_LABEL = '（未解決）'

/**
 * 表の列見出し（design-notes 論点11 の列構成）。
 *
 * **`実行済みなら` は consistency.ts の PATH_LABEL の `既に実行されていたら` と
 * 意図的に違う。** 前者は表の列名（短くする）、後者は指摘文の中の呼び名。
 * 揃えないこと——揃えると列見出しが冗長になるか、指摘文が不自然になる
 */
export const TABLE_HEADERS: readonly string[] = [
  'No',
  'from → to',
  'ラベル',
  '失敗確定',
  '結果不明',
  '実行済みなら',
]
