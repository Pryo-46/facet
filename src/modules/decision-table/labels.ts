/**
 * 画面に出す語の定数。**`起こりえない` は画面と出力のどちらも同じ語を使う**
 *（シーケンスの `考慮不要` と同じ扱い。docs/missing-semantics.md 規約2）。
 * 出力側も同じ語を参照するので、置き場を1箇所にまとめる
 */
export const IMPOSSIBLE_LABEL = '起こりえない'

/**
 * 結果の空文字を指す語。絞り込みの一覧・結果セルのドロップダウンの項目・
 * まとめて入力のバーで、どれも同じこの語を使う。**結果列は空文字も
 * 絞り込みの対象に並べる**——空欄は欠落であり、一覧から外すと抜けだけを
 * 取り出せなくなる。
 *
 * **閉じたセルにはこの語を描かない。** セルは空をそのまま描き、欠落の面が
 * 空であることを運ぶ
 */
export const UNFILLED_LABEL = '未記入'

/**
 * 列見出しの語。**画面の定義部・表本体と、出力の列見出しが同じ定数を読む**
 *——画面が「条件名」、出力が「条件」と書くと、貼った表と画面で同じ列を別の語で呼ぶ
 */
export const NO_COLUMN_LABEL = 'No'
export const CONDITION_NAME_LABEL = '条件名'
export const VALUE_LABEL = '値'
export const OUTCOME_NAME_LABEL = '結果名'
export const CHOICE_LABEL = '選択肢'
