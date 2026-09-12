import { Plus, X } from 'lucide-react'
import { buttonBase } from '@/components/button-styles'
import { CellInput, type FieldState } from '@/components/CellInput'
import { cellField, cellFocus, cellInput, headCell } from '@/components/table-styles'
import { cellFace, CELL_FACE_CLASS, type ErrorMarks } from '@/core/list-editor/cell-face'
import { focusCellField } from '@/core/list-editor/cell-hit'
import { cellId } from '@/core/list-editor/use-list-rows'
import { isMissingLabel } from './missing'

/**
 * ラベルの入力欄。**幅は固定**で、`cellInput` の `w-full` だけが違う。
 * ラベルは行ごとに本数が違うので、内容に追随させると列の見た目が揃わない
 */
const labelInput = `w-32 ${cellField} text-ink`

/** 列の境界の縦罫。先頭列（No）には引かない。色は辺指定で書く（無方向だと下罫まで薄くなる） */
const colBorder = 'border-l border-l-rule-muted'

/** ヘッダーの列の境界の縦罫。データ行より一段濃い `--rule` を使う（薄い面の上では薄い罫が消える） */
const headColBorder = 'border-l border-l-rule'

/** アイコンだけの小さなボタン。`<Button>` を使うほどでないので土台だけ敷く */
const iconButton = `${buttonBase} size-6 shrink-0 text-ink-muted hover:bg-canvas hover:text-ink`

export interface DefinitionRow {
  id: string
  name: string
  labels: string[]
}

export interface DefinitionListProps {
  heading: string
  nameLabel: string
  itemLabel: string
  rows: readonly DefinitionRow[]
  marks: ErrorMarks
  /** ラベルをこの本数より減らせない。条件は1、結果は0 */
  minLabels: number
  /** 追加を押せるか。行数の上限に達していれば偽 */
  canAddRow: boolean
  canAddLabel: (index: number) => boolean
  addRowLabel: string
  /** 行の鍵。`useListRows` の rowKeys をそのまま渡す。条件と結果で別々の配列なので衝突しない */
  rowKeys: readonly string[]
  /**
   * ラベル列を指す指摘の `field`。条件は `'values'`、結果は `'choices'`。
   *
   * **ラベル1つずつの `label:N` とは別に要る。** ラベルの重複の指摘は
   * 「どのラベルか」ではなく「この条件の中で重なっている」を指すので、
   * 列そのものを指す名前を持たないと、どのセルにも当たらないまま赤が消える
   */
  labelsField: string
  onRenameRow: (index: number, name: string) => void
  onRenameLabel: (index: number, labelIndex: number, label: string) => void
  onAddRow: () => void
  onRemoveRow: (index: number) => void
  onAddLabel: (index: number) => void
  onRemoveLabel: (index: number, labelIndex: number) => void
  onCellKeyDown: (
    e: React.KeyboardEvent,
    at: { index: number; field: string },
    state: FieldState,
    deletableField: boolean,
  ) => void
  addButtonRef: React.RefObject<HTMLButtonElement | null>
}

/**
 * 「名前＋ラベルの配列」の一覧。条件（名前＋値）と結果（名前＋選択肢）が同じ形なので、
 * **部品は1つで、語と手続きは呼び出し側が渡す**。
 *
 * ラベルの削除は `minLabels` で止める。条件の値が0本になると直積が空になり、
 * 条件ごと消したのと画面上で見分けが付かなくなる
 */
export function DefinitionList(props: DefinitionListProps) {
  const {
    heading,
    nameLabel,
    itemLabel,
    rows,
    marks,
    minLabels,
    canAddRow,
    canAddLabel,
    addRowLabel,
    rowKeys,
    labelsField,
    onRenameRow,
    onRenameLabel,
    onAddRow,
    onRemoveRow,
    onAddLabel,
    onRemoveLabel,
    onCellKeyDown,
    addButtonRef,
  } = props

  const face = (index: number, field: string, warn: boolean, rowAnchor = false): string =>
    CELL_FACE_CLASS[cellFace(marks, index, field, warn, rowAnchor)]

  return (
    <section>
      <h2 className="mb-2 text-base font-medium text-ink">{heading}</h2>
      <div className="border border-rule bg-surface">
        <table className="w-full table-fixed border-collapse text-sm">
          <colgroup>
            <col style={{ width: 56 }} />
            <col style={{ width: 176 }} />
            {/* ラベル列だけ幅を持たない。残りを全部もらう */}
            <col />
            <col style={{ width: 40 }} />
          </colgroup>
          <thead>
            <tr className="text-left">
              <th className={`${headCell} text-right`}>No</th>
              <th className={`${headCell} ${headColBorder}`}>{nameLabel}</th>
              <th className={`${headCell} ${headColBorder}`}>{itemLabel}</th>
              {/* 削除列の見出しは空。列の意味は行の ✕ のアクセシブル名が運ぶ */}
              <th className={`${headCell} ${headColBorder}`} />
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const rowKey = rowKeys[index]
              const no = index + 1
              return (
                <tr key={rowKey} className="border-b border-rule-muted align-middle">
                  {/* 行全体の指摘（ID 重複など欄を特定できないもの）は No セルの面で示す */}
                  <td className={`px-2 py-1 text-right text-ink-muted ${face(index, 'no', false, true)}`}>
                    {no}
                  </td>
                  <td
                    className={`${colBorder} cursor-text ${cellFocus} ${face(index, 'name', isMissingLabel(row.name))}`}
                    onMouseDown={focusCellField}
                  >
                    <CellInput
                      className={cellInput}
                      aria-label={`${nameLabel}（${no}行目）`}
                      data-cell={cellId(rowKey, 'name')}
                      value={row.name}
                      onValueChange={(v) => onRenameRow(index, v)}
                      onFieldKeyDown={(e, s) => onCellKeyDown(e, { index, field: 'name' }, s, true)}
                    />
                  </td>
                  {/* ラベル列そのものの指摘（重複）はこの面が運ぶ。ラベル1つずつの
                      面は下の span が別に持つ。**フォーカス枠もこのセルには載せない**
                      ——1つのセルにラベルが複数並ぶので、セルを囲むとどのラベルに
                      いるか分からない。枠は下の span が `cellFocus` で描く */}
                  <td className={`${colBorder} ${face(index, labelsField, false)}`}>
                    <div className="flex flex-wrap gap-1 px-2 py-1">
                      {row.labels.map((label, labelIndex) => {
                        const field = `label:${labelIndex}`
                        return (
                          <span
                            key={field}
                            className={`inline-flex items-center rounded-sm ${cellFocus} ${face(index, field, isMissingLabel(label))}`}
                          >
                            <CellInput
                              className={labelInput}
                              aria-label={`${itemLabel}（${no}行目の${labelIndex + 1}つ目）`}
                              data-cell={cellId(rowKey, field)}
                              value={label}
                              onValueChange={(v) => onRenameLabel(index, labelIndex, v)}
                              onFieldKeyDown={(e, s) =>
                                // 最後の1つは空欄 Backspace でも消せない。消せると
                                // 直積が空になり、行そのものを消したのと見分けが付かなくなる
                                onCellKeyDown(e, { index, field }, s, row.labels.length > minLabels)
                              }
                            />
                            <button
                              type="button"
                              // キーボードからは空欄 `Backspace` で消せるので、`Tab` の
                              // 順に入れない。入れると値を打つたびに ✕ を1回踏む
                              tabIndex={-1}
                              aria-label={`${itemLabel}を消す（${no}行目の${labelIndex + 1}つ目）`}
                              disabled={row.labels.length <= minLabels}
                              className={iconButton}
                              onClick={() => onRemoveLabel(index, labelIndex)}
                            >
                              <X aria-hidden className="size-4" />
                            </button>
                          </span>
                        )
                      })}
                      <button
                        type="button"
                        aria-label={`${itemLabel}を追加（${no}行目）`}
                        disabled={!canAddLabel(index)}
                        className={`${iconButton} border border-rule`}
                        onClick={() => onAddLabel(index)}
                      >
                        <Plus aria-hidden className="size-4" />
                      </button>
                    </div>
                  </td>
                  <td className={`${colBorder} px-1 py-1 text-center`}>
                    <button
                      type="button"
                      aria-label={`${heading}を消す（${no}行目）`}
                      className={iconButton}
                      onClick={() => onRemoveRow(index)}
                    >
                      <X aria-hidden className="size-4" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      {/* 0件のときだけでなく常に出す。追加が Enter だけだと、マウスで操作する人に手段が無い */}
      <button
        ref={addButtonRef}
        type="button"
        disabled={!canAddRow}
        className={`${buttonBase} mt-3 gap-1 border border-rule bg-surface px-3 py-1 text-base text-ink hover:bg-canvas`}
        onClick={onAddRow}
      >
        <Plus aria-hidden className="size-4" />
        {addRowLabel}
      </button>
    </section>
  )
}
