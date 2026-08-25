/**
 * 測定層（DOM 非依存・純関数）。
 *
 * レイアウト計算には各ノードの幅と高さが必要だが、高さは折り返し行数で決まり、
 * 行数は幅で決まる。「描画 → 実測 → レイアウト → 再描画」の2パスにすると
 * Enter のたびに一瞬ずれた位置に出てから飛ぶ。ここで**同期的に**確定させて
 * 「入力 → サイズ計算 → レイアウト → 一度だけ描画」の1パスにする。
 *
 * **幅の測り方は引数で受け取る。** 本番は canvas の measureText（canvas-font.ts）、
 * テストは決定的な概算器。この関数自体は DOM を知らない。
 */

export type MeasureWidth = (text: string) => number

export interface WrapOptions {
  maxWidth: number
  minWidth: number
  insetX: number
  insetY: number
}

export interface WrappedBlock {
  /** 折り返し後の行。**描画側と同じフォント指定を前提に確定させてある** */
  lines: string[]
  /** 箱の幅（余白込み） */
  width: number
  /** 箱の高さ（余白込み） */
  height: number
}

/**
 * 文言を折り返して箱の寸法を出す。
 *
 * 折り返しは**コードポイント単位のグリーディ**で、CSS の `word-break: break-all`
 * と同じ規則。日本語は任意位置で折り返せるので単語単位にする意味がなく、
 * 単語単位にすると測定層とブラウザの判断がずれる。
 *
 * 幅は各行の実測の最大値を切り上げて使う。**切り上げているので、描画側に
 * 渡る内容幅は測定時の前提以上になり、ブラウザが測定より早く折り返すことはない**
 *（遅く折り返して行数が減る方向は、余白が1行分増えるだけで文字は切れない）。
 *
 * **行数に上限は無い。** M24 が一度 `maxLines` を足したが、実機で撤回した
 *（`docs/history/m24-core-node-width-lock.md` の実機確認の節）——`textarea` を
 * 上限行数で打ち切ると、**溢れた行へキャレットが届かず編集できなくなる。**
 * 打ち切るなら「全文をどこで読ませるか」を先に用意する必要がある
 */
export function wrapWithin(
  text: string,
  measure: MeasureWidth,
  lineHeight: number,
  opts: WrapOptions,
): WrappedBlock {
  const maxContent = opts.maxWidth - opts.insetX * 2
  const lines: string[] = []
  for (const segment of text.split('\n')) {
    let line = ''
    // for...of は文字列をコードポイント単位で回す（サロゲートペアを割らない）
    for (const ch of segment) {
      if (line === '') {
        line = ch
        continue
      }
      if (measure(line + ch) > maxContent) {
        lines.push(line)
        line = ch
      } else {
        line += ch
      }
    }
    lines.push(line)
  }
  const contentWidth = lines.reduce((w, line) => Math.max(w, measure(line)), 0)
  const width = Math.min(
    opts.maxWidth,
    Math.max(opts.minWidth, Math.ceil(contentWidth) + opts.insetX * 2),
  )
  const height = Math.ceil(lines.length * lineHeight) + opts.insetY * 2
  return { lines, width, height }
}

/**
 * 測れない環境（jsdom には canvas が無い）用の概算。ASCII を半分の幅とみなす。
 * **本番では使わない**——等幅を前提にした計算が日本語で成立しないことが、
 * measureText を選んだ理由そのものである（tech-notes 論点4）
 */
export function createEstimateMeasurer(fontSize: number): MeasureWidth {
  return (text) => {
    let width = 0
    for (const ch of text) {
      width += ((ch.codePointAt(0) ?? 0) < 0x80 ? 0.5 : 1) * fontSize
    }
    return width
  }
}
