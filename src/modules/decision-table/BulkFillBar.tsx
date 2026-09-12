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
import { CLEAR_RESULT_LABEL, IMPOSSIBLE_LABEL } from './labels'

export interface BulkFillBarProps {
  outcomes: readonly Outcome[]
  /** 表に出ている行数。ボタンの文言に出す */
  targetCount: number
  onApply: (target: BulkTarget) => void
}

/** 適用先の鍵。結果は位置、起こりえないは専用の値で指す */
const IMPOSSIBLE_KEY = 'impossible'

/** 起こりえないを適用先に選んだときの値の選択肢 */
const IMPOSSIBLE_VALUES = ['on', 'off'] as const

/**
 * 適用先を選んだときの値の既定。**結果列は1つ目の選択肢にする**——
 * 空にするを既定にすると、選択肢を選ばずに押した人が値を消すことになる。
 * 選択肢を持たない結果列では空にするしか無いので、そのまま空を返す
 */
function defaultValue(outcome: Outcome | undefined): string {
  if (outcome === undefined) return IMPOSSIBLE_VALUES[0]
  return outcome.choices[0] ?? ''
}

/**
 * まとめて入力。**対象は絞り込みが決める**ので、このバーは適用先と値だけを持つ。
 * 対象を指す操作を2つ持つと、絞り込んだ表を見ながら別の条件へ書き込む事故が起きる。
 *
 * **通常のフォームであり、表の操作言語（`family: 'grid'`）を掛けない。**
 * 掛けると、値を選ぶだけの `↑↓` が表の行移動として消費される
 */
export function BulkFillBar({ outcomes, targetCount, onApply }: BulkFillBarProps) {
  const [where, setWhere] = useState<string>(() =>
    outcomes.length > 0 ? '0' : IMPOSSIBLE_KEY,
  )
  const outcomeIndex = where === IMPOSSIBLE_KEY ? null : Number(where)
  const outcome = outcomeIndex === null ? undefined : outcomes[outcomeIndex]
  /** 値の選択肢。結果列は空にするを先頭に置く */
  const options = outcome === undefined ? [...IMPOSSIBLE_VALUES] : ['', ...outcome.choices]
  const [value, setValue] = useState<string>(() => defaultValue(outcomes[0]))

  /** 適用先を変えたら値も既定へ戻す。前の列の値がそのまま残ると、押した瞬間に別の語が入る */
  const changeWhere = (next: string): void => {
    setWhere(next)
    setValue(defaultValue(next === IMPOSSIBLE_KEY ? undefined : outcomes[Number(next)]))
  }

  const valueLabel = (v: string): string => {
    if (outcome === undefined) return v === 'on' ? 'する' : 'しない'
    return v === '' ? CLEAR_RESULT_LABEL : v
  }

  const apply = (): void => {
    if (outcome === undefined || outcomeIndex === null) {
      onApply({ kind: IMPOSSIBLE_KEY, on: value === 'on' })
      return
    }
    onApply({ kind: 'result', outcomeIndex, value })
  }

  return (
    <div className="mb-2 flex flex-wrap items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="適用先">
            {outcome === undefined ? IMPOSSIBLE_LABEL : outcome.name}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={where} onValueChange={changeWhere}>
            {outcomes.map((o, j) => (
              // 値に位置を使う。ID 重複は赤表示する正規の状態なので、id では一意に指せない
              <DropdownMenuRadioItem key={`out-${j}`} value={`${j}`}>
                {o.name}
              </DropdownMenuRadioItem>
            ))}
            <DropdownMenuRadioItem value={IMPOSSIBLE_KEY}>{IMPOSSIBLE_LABEL}</DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" aria-label="書き込む値">
            {valueLabel(value)}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuRadioGroup value={value} onValueChange={setValue}>
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
      {/* 対象が0行でも押せる状態を保つ。押せなくすると、なぜ押せないのかが
          行数の表示からしか読めない */}
      <Button variant="outline" onClick={apply}>
        {`表示中の ${targetCount} 行に適用`}
      </Button>
    </div>
  )
}
