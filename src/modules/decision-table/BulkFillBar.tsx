import { ChevronDown } from 'lucide-react'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import type { Outcome } from '@/types/decision-table'
import type { BulkTarget } from './bulk'
import { outcomeFilterLabels } from './filter'
import { UNFILLED_LABEL } from './labels'

export interface BulkFillBarProps {
  outcomes: readonly Outcome[]
  /** 適用を押したときに実際に書き込む行数。文の中に出す */
  targetCount: number
  onApply: (target: BulkTarget) => void
}

/**
 * 適用先を選んだときの値の既定。**1つ目の選択肢にする**——空を既定にすると、
 * 選択肢を選ばずに押した人が値を消すことになる。選択肢を持たない結果列では
 * 空しか無いので、そのまま空を返す
 */
function defaultValue(outcome: Outcome | undefined): string {
  return outcome?.choices[0] ?? ''
}

/**
 * まとめて入力。**対象は絞り込みが決める**ので、このバーは適用先と値だけを持つ。
 * 対象を指す操作を2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。
 *
 * **書き込む先は結果列だけ。** 起こりえないは行ごとの入り切りが受け持つ。
 * 結果列が1本も無い表では書き込む先が無いので、何も描かない。
 *
 * **通常のフォームであり、表の操作言語（`family: 'grid'`）を掛けない。**
 * 掛けると、値を選ぶだけの `↑↓` が表の行移動として消費される
 */
export function BulkFillBar({ outcomes, targetCount, onApply }: BulkFillBarProps) {
  const [where, setWhere] = useState<string>('0')
  const [value, setValue] = useState<string>(() => defaultValue(outcomes[0]))

  /**
   * 適用先を毎描画ごとに `outcomes` から解決し直す。**state をそのまま信じない**
   *——`where` は結果の位置を指す持ち方なので、選んでいた結果が定義部の操作で
   * 消えると同じ添字が別の結果や「無い」を指すことになる。放置すると、押した
   * 瞬間に書き込まれる列が画面の表示と食い違う
   */
  const resolvedIndex = outcomes[Number(where)] !== undefined ? Number(where) : 0
  const outcome = outcomes[resolvedIndex]
  /** 値の選択肢。空文字（未記入）を先頭に置く */
  const options = outcome === undefined ? [] : outcomeFilterLabels(outcome)
  // 選んでいた値がいまの選択肢から外れていたら既定へ落とす。選択肢に無い値を
  // 残すと、画面に出ている語がどの行にも書けない値になる
  const resolvedValue = options.includes(value) ? value : defaultValue(outcome)

  /** 適用先を変えたら値も既定へ戻す。前の列の値がそのまま残ると、押した瞬間に別の語が入る */
  const changeWhere = (next: string): void => {
    setWhere(next)
    setValue(defaultValue(outcomes[Number(next)]))
  }

  const valueLabel = (v: string): string => (v === '' ? UNFILLED_LABEL : v)

  // 結果列が1本も無ければ書き込む先が無い
  if (outcome === undefined) return null

  return (
    <div className="mb-2 flex flex-wrap items-center justify-end gap-2 text-base text-ink">
      {/* 数は適用を押したときに書き込む行数であり、表示中の行数ではない */}
      <span>{`表示中の ${targetCount} 行に`}</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          {/* 山形を中に置く。置かないと、選ぶための入口が適用のボタンと見分けられない */}
          <Button variant="outline" aria-label="適用先">
            {outcome.name}
            <ChevronDown aria-hidden className="size-4 text-ink-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={`${resolvedIndex}`} onValueChange={changeWhere}>
            {outcomes.map((o, j) => (
              // 値に位置を使う。ID 重複は赤表示する正規の状態なので、id では一意に指せない
              <DropdownMenuRadioItem key={`out-${j}`} value={`${j}`}>
                {o.name}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span>の</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="書き込む値">
            {valueLabel(resolvedValue)}
            <ChevronDown aria-hidden className="size-4 text-ink-muted" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={resolvedValue} onValueChange={setValue}>
            {options.map((v, at) => (
              // key に生のラベルを使わない。同じラベルの選択肢が2件あるファイルは
              // duplicate-choice が赤で出す正規の状態で、key が衝突する
              <DropdownMenuRadioItem key={`${at}`} value={v}>
                {valueLabel(v)}
              </DropdownMenuRadioItem>
            ))}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <span>を</span>
      {/* 対象が0行でも押せる状態を保つ。押せなくすると、なぜ押せないのかが
          行数の表示からしか読めない */}
      <Button
        variant="outline"
        onClick={() =>
          onApply({ kind: 'result', outcomeIndex: resolvedIndex, value: resolvedValue })
        }
      >
        適用
      </Button>
    </div>
  )
}
