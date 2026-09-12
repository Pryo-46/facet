import { describe, expect, it } from 'vitest'
import { buttonCell, cellButton, cellField, cellFocus, cellInput, headCell } from './table-styles'

describe('表の見出しセル', () => {
  it('下罫線を border ではなく影で描く', () => {
    // border-collapse の表では罫線が表の格子に属するので、sticky で浮いた
    // 見出しは罫線を置き去りにする。影は要素が自分で塗るので付いてくる
    expect(headCell).toContain('sticky')
    expect(headCell).not.toMatch(/border-b/)
    expect(headCell).toContain('shadow-[inset_0_-1px_0_var(--rule)]')
  })
})

describe('表のセルの入力欄', () => {
  it('枠を自分で描かない', () => {
    // 入力欄はセルより小さいので、入力欄が枠を描くと枠がセルの中に浮く。
    // 空のセルでは中身の高さが 0 になり、その枠が細い線に潰れる
    expect(cellInput).not.toMatch(/ring/)
    expect(cellInput).not.toMatch(/rounded/)
  })

  it('幅と文字色は土台から分けてあり、呼び出し側が決められる', () => {
    // ラベル欄は固定幅で並べ、起こりえないのセルは非アクティブの文字色で置く。
    // 同じ要素に文字色を2つ載せると、どちらが出るかは生成 CSS の並び順で決まる
    expect(cellField).not.toMatch(/\bw-/)
    expect(cellField).not.toMatch(/\btext-/)
    expect(cellInput).toContain('w-full')
    expect(cellInput).toContain('text-ink')
    expect(cellInput).toContain(cellField)
  })
})

describe('表のセルのフォーカス枠', () => {
  it('セルが描き、角丸を持たない', () => {
    // 枠の矩形をセルの矩形に一致させる。td は角丸を持たないので、
    // 角丸を足すと罫線と枠がずれて「浮いた箱」に戻る
    expect(cellFocus).toContain('focus-within:ring-2')
    expect(cellFocus).toContain('focus-within:ring-inset')
    expect(cellFocus).toContain('focus-within:ring-ring')
    expect(cellFocus).not.toMatch(/rounded/)
  })
})

describe('選択肢・ボタンのセル', () => {
  it('セルの高さいっぱいに広がる', () => {
    // 広がっていないと、メニューを開くのに欄の帯を狙うことになる。
    // インラインのままだと行ボックスの下端に隙間が残り、高さが揃わない
    expect(cellButton).toContain('h-full')
    expect(cellButton).toMatch(/(^| )block( |$)/)
    expect(cellButton).toContain(cellInput)
  })

  it('入力欄の側は高さを持たない', () => {
    // CellInput は scrollHeight から折り返しの行数を測る。高さを固定すると
    // 測定値がセルの高さになり、1行のセルが行いっぱいの行数を返す
    expect(cellInput).not.toContain('h-full')
    expect(cellField).not.toContain('h-full')
  })
})

describe('選択肢・ボタンのセルの <td>', () => {
  it('高さを指定する', () => {
    // td の高さが auto だと、中の h-full が auto に解決されて欄が伸びない
    // （Chrome 実測: セル 99.4px に対して欄 26.2px）。1px は下限であり、
    // セルは中身と行の高さまで伸びる
    expect(buttonCell).toContain('h-px')
  })
})
