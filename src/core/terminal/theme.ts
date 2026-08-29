import { oklchToLinear, parseOklch, toHex } from '@/styles/contrast'

/**
 * 端末（xterm）の配色を facet の役割トークンから作る（コア・純関数）。
 *
 * **ソースに色値を書かない**（rev 9章。`src/styles/conventions.test.ts` が
 * 直書きを弾く）ため、`palette.css` の役割トークンを実行時に読んで
 * sRGB の16進へ変換する。**xterm は `oklch()` を解釈しない**ので、
 * 変換は `src/styles/contrast.ts` の既存の式を使う（同じ式を2本持たない）。
 *
 * **ANSI の16色は xterm の既定のままにする。** 16色は facet の役割
 * トークン（rev 9章）に対応物が無く、持つと「配色を差し替える」作業が
 * 「16色を選び直す」作業になる。代わりに `TERMINAL_MIN_CONTRAST` を
 * xterm の `minimumContrastRatio` へ渡し、ダークの面で既定の16色が
 * 読める濃さへ xterm 自身に寄せさせる
 */

/** xterm の `ITheme` のうち facet が決める分だけ。値はすべて `#rrggbb` */
export interface TerminalTheme {
  background: string
  foreground: string
  cursor: string
  cursorAccent: string
  selectionBackground: string
}

/**
 * 端末の文字が面に対して満たすべきコントラスト比。**本文の 4.5:1 に揃える**
 *（rev 9章）。xterm はこの値を下回る前景色を自動で寄せる
 */
export const TERMINAL_MIN_CONTRAST = 4.5

/**
 * 役割トークンの値（`oklch(L C H)` の文字列）を返す関数を渡すと、xterm へ
 * 渡せる配色を返す。
 *
 * **1つでも読めなければ null。** 半端に流し込むと、面だけ変わって文字が
 * 読めない端末になる。null のときは呼び出し側が xterm の既定に任せる
 */
export function buildTerminalTheme(readToken: (name: string) => string): TerminalTheme | null {
  const hex = (token: string): string | null => {
    const parsed = parseOklch(readToken(token))
    return parsed === null ? null : toHex(oklchToLinear(parsed))
  }
  const background = hex('--surface')
  const foreground = hex('--ink')
  // 選択の面は「一段沈んだ面」。ink / ink-muted が載ることを
  // palette.test.ts が BACKGROUNDS の一員として検証している
  const selectionBackground = hex('--surface-muted')
  if (background === null || foreground === null || selectionBackground === null) return null
  return {
    background,
    foreground,
    // カーソルは文字と同じ色。その上に乗る文字（ブロックカーソルの下の
    // 1文字）は面と同じ色にして、反転しても読めるようにする
    cursor: foreground,
    cursorAccent: background,
    selectionBackground,
  }
}
