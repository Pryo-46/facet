/**
 * 表形式コピー（モジュール規約8。M29）の型。
 *
 * **規約5（`OutputProfile`）に乗せない理由**: あちらは「Markdown 文字列を返す
 * 純関数」と `.md` 書き出しを前提にしている。表形式コピーは出力が TSV と HTML の
 * 2つで1本の文字列に収まらず、`.md` 書き出しに意味が無く（ファイル出力は作らない）、
 * さらに設定を引数に取る。押し込むと `toMarkdown` という名前が嘘になる。
 * **規約7（`ClipboardExchange`。Miro 交換）を別枠にしたのと同じ判断**であり、
 * 同じ層の任意拡張として足す。**宣言しないツールの規約の点数は増えない**
 */

/** 表1枚。**header と rows は同じ列数であること**（崩れると貼り先でセルがずれる） */
export interface Table {
  header: readonly string[]
  rows: readonly (readonly string[])[]
}

/**
 * 画面に出ている行の ID 集合。**null / undefined は「絞り込みなし＝全件」。**
 *
 * **行を間引くのは出力側の仕事である。** 額縁が先にデータを間引くと、
 * No（データ配列の位置。`index + 1`）が 1 から振り直され、画面の No と
 * 食い違う——`error-catalog/markdown.ts` の No の JSDoc が
 * 「口頭で指すための目印として使えない」と警告している壊れ方そのもの。
 * **間引きと採番を同じ場所に置くことでしか避けられない**
 */
export type VisibleRows = ReadonlySet<string> | null

/**
 * ダイアログが出す設定。**コアが全部知っている。**
 * モジュールは「自分がどれを使うか」を宣言するだけで、設定の意味も既定値も持たない
 * ——ツールごとに `numbering` の意味が違う、という状態を作らないため
 */
export interface TableOptions {
  /** No 列を付ける */
  readonly numbering: boolean
  /** No の形式。'serial' = 1, 2, 3… / 'path' = 1-1-1 */
  readonly numberStyle: 'serial' | 'path'
  /** 親の文言を毎行くり返す */
  readonly repeatParent: boolean
  /** 未記入を（未定義）と出す */
  readonly showUndefined: boolean
}

export type TableOptionId = keyof TableOptions

export const DEFAULT_TABLE_OPTIONS: TableOptions = {
  numbering: true,
  numberStyle: 'path',
  repeatParent: false,
  showUndefined: true,
}

/**
 * 未記入の欄に出す文言。**既存の Markdown 出力と1文字も違えない**——
 * 仕様書に貼った瞬間に未定義が見えなくなるのは文章仕様書の悪癖の再生産である
 *（rev 5章）。`glossary/markdown.ts` と `error-catalog/markdown.ts` と
 * `logic-tree/markdown.ts` が各自ローカル定数で持っている値と同じ。
 * **今回は表側だけがここを使う**——Markdown 側の3つを畳むのは M29 の仕事ではない
 */
export const UNDEFINED_TEXT = '（未定義）'

/**
 * 読み手の出し分け。**規約5 の `OutputProfile` を流用しない**——あちらは
 * `fileSuffix` と `toMarkdown` を必ず持つが、表形式コピーではどちらも意味が無い
 *（ファイル出力を作らない）。持てない値を持たせると、必ず誰かが使う
 */
export interface TableVariant<TData> {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ダイアログの読み手選択に出す表示名 */
  label: string
  /** 設定 → 表。**副作用を持たない純関数**であること（規約5 と同じ制約） */
  toTable: (data: TData, options: TableOptions, visible?: VisibleRows) => Table
}

export interface TableExport<TData> {
  /**
   * ダイアログに出す設定項目。**ここに無い設定は既定値で固定される**
   *（用語集に `numberStyle` を出しても階層が無いので選ばせる意味がない）
   */
  options: readonly TableOptionId[]
  /**
   * 読み手ごとの出し分け。**1本ならダイアログに読み手の選択を出さない**
   *（`ExportMenu` が「プロファイルが1本のときはドロップダウンを出さない」と
   *  している原則と同じ。選択肢が1つしかない選択は何も選ばせない）
   */
  variants: readonly TableVariant<TData>[]
}
