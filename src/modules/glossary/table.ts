import {
  type Table,
  type TableOptions,
  UNDEFINED_TEXT,
  type VisibleRows,
} from '@/core/table-export'
import type { GlossarySchemaVersion1 } from '@/types/glossary'
import { NO_COLUMN_LABEL } from './columns'
import { FIELD_LABELS, FIELD_ORDER } from './fields'
import { kindLabel } from './kind-labels'

/**
 * 用語集の表（モジュール規約8。M29）。
 *
 * **列は画面のエディタの並びそのまま**（`FIELD_ORDER`）。Markdown 出力が種別を
 * `###` のグループ見出しへ逃がして列から落としているのとは違う——表に見出しは
 * 無く、グループごとに表を分けて空行で区切ると、スプレッドシートに貼ったときに
 * 1つの表にならない。
 *
 * **走査順はデータ配列順**（＝UI の既定表示順が正。スキーマの記述）。
 * Markdown が enum 順にグループを組み直すのに合わせない——**表は画面の側にいる**。
 *
 * **No はデータ配列の位置（`index + 1`）で、`visible` で絞っても振り直さない。**
 * 振り直すと画面の No と食い違い、口頭で指すための目印として使えなくなる
 *（`error-catalog/markdown.ts` の No の JSDoc と同じ理由。用語集の画面には
 *  No 列が無いが、番号が飛ぶことで「これは全件ではない」が読み取れる）
 */
export function glossaryToTable(
  data: GlossarySchemaVersion1,
  options: TableOptions,
  visible?: VisibleRows,
): Table {
  const header = [
    ...(options.numbering ? [NO_COLUMN_LABEL] : []),
    ...FIELD_ORDER.map((field) => FIELD_LABELS[field]),
  ]
  const rows: string[][] = []
  data.terms.forEach((term, index) => {
    if (visible != null && !visible.has(term.id)) return
    rows.push([
      ...(options.numbering ? [String(index + 1)] : []),
      term.name,
      kindLabel(term.kind),
      // **定義の空だけを（未定義）に落とす。** 別名・備考の空は Markdown 出力でも
      // 空のままで、「まだ決めていない」の意思表示ではない（`markdown.ts` と同じ規則）
      options.showUndefined && term.definition === '' ? UNDEFINED_TEXT : term.definition,
      // 別名は1行1件で持っているので、表に収めるときだけ読点で連ねる
      term.aliases.join('、'),
      term.notes,
    ])
  })
  return { header, rows }
}
