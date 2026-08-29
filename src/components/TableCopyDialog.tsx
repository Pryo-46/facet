import { useEffect, useRef, useState } from 'react'
import { Chip } from '@/components/Chip'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { resolveVariantId, tableCopyPrefs } from '@/core/table-copy-options'
import type { TableOptionId, TableOptions } from '@/core/table-export'

export interface TableCopyDialogProps {
  open: boolean
  /** 整合性エラーの説明。**null なら警告を出さない** */
  warning: string | null
  /** ダイアログに出す設定項目（モジュールの `tableExport.options`） */
  options: readonly TableOptionId[]
  /** 読み手の選択肢。**1本なら選択を出さない** */
  variants: readonly { id: string; label: string }[]
  onCopy: (variantId: string, options: TableOptions) => void
  onCancel: () => void
}

/**
 * 表形式コピーの設定ダイアログ（M29）。
 *
 * **`ConfirmDialog` / `ChoiceDialog` を流用できない。** どちらも二択専用で、
 * 本文に入力要素を持てない。土台の `AlertDialog` は共通。
 *
 * **設定は「アプリを閉じるまで」覚える**（`tableCopyPrefs`）。開くたびに
 * ストアの値から始め、**[コピー] を押したときだけ書き戻す**——キャンセルで
 * 閉じた操作が次回の既定を変えるのは、押した本人の意図と食い違う。
 *
 * **チェックボックスとラジオはネイティブを使う。** M25 がネイティブ `<select>` を
 * やめたのは「開いたときのリストが OS 描画で styled にできない」ためで、
 * インラインで完結するチェックボックス・ラジオにその問題は無い。
 * 読み手の選択だけ `Chip` にするのは、エディタ側の表示プロファイル切り替えと
 * 同じ見た目・同じ部品にするため。
 *
 * **開いている間は呼び出し側が `KeyContext.modalOpen` を true にすること**
 *（rev 10章の境界規則。`ConfirmDialog` と同じ配線。額縁はモーダルキューの
 *  長さで判断しているので、この要求は自動的に満たされる）
 *
 * **Esc・オーバーレイクリックは `onCancel` に落とす**（`ConfirmDialog` と
 * 同じ配線）。ここは「取り込み」のような宙ぶらりんが残る操作ではなく、
 * キャンセルしても閉じるだけで今の状態がそのまま残る（`ChoiceDialog` の
 * JSDoc が挙げる「Esc を許してよい場面」そのもの）。配線を怠ると、
 * `open` が制御下で `onOpenChange` が無いまま Radix の Esc ハンドラが
 * 素通りし——ダイアログは閉じず、額縁側の Esc ショートカットは
 * `KeyContext.modalOpen` で塞がれたまま——マウスでしか閉じられなくなる
 */
export function TableCopyDialog(props: TableCopyDialogProps) {
  const remembered = tableCopyPrefs.getSnapshot()
  const [options, setOptions] = useState<TableOptions>(remembered.options)
  const [variantId, setVariantId] = useState<string>(() =>
    resolveVariantId(props.variants, remembered.variantId),
  )

  // **`open` の立ち上がりでだけストアから読み直す。** 依存に `props.variants` を
  // 置くだけだと、開いている最中に呼び出し側が新しい配列を渡した瞬間にも走り、
  // 利用者が入力途中の設定が黙ってストアの値へ戻る。**部品の正しさを
  // 呼び出し側のメモ化の作法に依存させない**
  const wasOpen = useRef(false)
  useEffect(() => {
    if (props.open && !wasOpen.current) {
      const prefs = tableCopyPrefs.getSnapshot()
      setOptions(prefs.options)
      setVariantId(resolveVariantId(props.variants, prefs.variantId))
    }
    wasOpen.current = props.open
  }, [props.open, props.variants])

  const has = (id: TableOptionId): boolean => props.options.includes(id)
  const toggle = (id: 'numbering' | 'repeatParent' | 'showUndefined') => (): void =>
    setOptions((o) => ({ ...o, [id]: !o[id] }))

  const copy = (): void => {
    tableCopyPrefs.set({ options, variantId })
    props.onCopy(variantId, options)
  }

  return (
    <AlertDialog
      open={props.open}
      onOpenChange={(next) => {
        // Esc・オーバーレイクリックはどちらも「閉じる」に落ちてくる
        if (!next) props.onCancel()
      }}
    >
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>表形式でコピー</AlertDialogTitle>
          <AlertDialogDescription>
            Excel やスプレッドシートに貼れる表としてクリップボードへ載せます。
          </AlertDialogDescription>
        </AlertDialogHeader>

        {props.warning !== null && (
          <p role="alert" className="whitespace-pre-line text-base text-ink">
            {props.warning}
          </p>
        )}

        {props.variants.length > 1 && (
          <div role="group" aria-label="読み手" className="flex items-center gap-1">
            {props.variants.map((v) => (
              <Chip key={v.id} selected={v.id === variantId} onClick={() => setVariantId(v.id)}>
                {v.label}
              </Chip>
            ))}
          </div>
        )}

        <div className="flex flex-col gap-2">
          {has('numbering') && (
            <label className="flex items-center gap-2 text-base text-ink">
              <input type="checkbox" checked={options.numbering} onChange={toggle('numbering')} />
              No 列を付ける
            </label>
          )}
          {has('numberStyle') && (
            <div role="radiogroup" aria-label="No の形式" className="ml-6 flex flex-col gap-1">
              {(['path', 'serial'] as const).map((style) => (
                <label key={style} className="flex items-center gap-2 text-base text-ink">
                  <input
                    type="radio"
                    name="table-copy-number-style"
                    checked={options.numberStyle === style}
                    // **No 列を出さないなら形式は効かない。** 押せるが何も
                    // 変わらないラジオを出さない（ExportMenu の disabled と同じ原則）
                    disabled={!options.numbering}
                    onChange={() => setOptions((o) => ({ ...o, numberStyle: style }))}
                  />
                  {style === 'path' ? '階層番号（1_1_1）' : '通し番号（1, 2, 3…）'}
                </label>
              ))}
            </div>
          )}
          {has('repeatParent') && (
            <label className="flex items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                checked={options.repeatParent}
                onChange={toggle('repeatParent')}
              />
              親の文言を毎行くり返す
            </label>
          )}
          {has('showUndefined') && (
            <label className="flex items-center gap-2 text-base text-ink">
              <input
                type="checkbox"
                checked={options.showUndefined}
                onChange={toggle('showUndefined')}
              />
              未記入を（未定義）と出す
            </label>
          )}
        </div>

        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
          {/* AlertDialogAction も内部実装は AlertDialogCancel と同じ Dialog.Close で、
              クリックすると onOpenChange(false) も発火してしまう（Radix の仕様。
              ConfirmDialog が踏んだ M4 の罠と同じ形）。onOpenChange を onCancel に
              配線した今、これを止めないとコピーのたびに onCancel まで呼ばれる。
              preventDefault で内部の close 発火を止め、経路を copy() 一本にする */}
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              copy()
            }}
          >
            コピー
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
