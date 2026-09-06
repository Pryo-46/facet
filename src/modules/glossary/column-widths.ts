import { createColumnWidthStore } from '@/core/column-resize'
import { DEFAULT_WIDTHS } from './columns'

/**
 * 用語テーブルの列幅（決定7）。
 *
 * **アプリを閉じるまで保持し、ファイル切替をまたぐ。** GlossaryEditor は
 * App 側で `key={selected.path}` を付けて作り直されるので、エディタ内の
 * state に置くと切り替えのたびに幅が戻る。
 *
 * **type ごとに1つ持つ（ファイルごとではない）。** 同じ列構成なら幅も
 * 揃っている方が自然で、ファイル単位にすると「どのファイルで広げたか」を
 * 覚えていられない。用語集は singleton なので今は差が出ない。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * DOM テストの beforeEach で `glossaryColumnWidths.reset()` を呼ぶこと
 */
export const glossaryColumnWidths = createColumnWidthStore(DEFAULT_WIDTHS)

/** 列の最小幅(px)。日本語の見出しが2文字で折り返さない程度 */
export const MIN_COLUMN_WIDTH = 88

/** 定義列（幅を持たない列）に残す最小幅(px) */
export const DEFINITION_MIN_WIDTH = 200

/** キーボード（←→）1回あたりの変化量(px) */
export const RESIZE_STEP = 16
