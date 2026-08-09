/**
 * 測定層（DOM 非依存・純関数）。
 *
 * レイアウト計算には各ノードの幅と高さが必要だが、高さは折り返し行数で決まり、
 * 行数は幅で決まる。「描画 → 実測 → レイアウト → 再描画」の2パスにすると
 * Enter のたびに一瞬ずれた位置に出てから飛ぶ。ここで**同期的に**確定させて
 * 「入力 → サイズ計算 → レイアウト → 一度だけ描画」の1パスにする。
 *
 * **幅の測り方は引数で受け取る。** 本番は canvas の measureText（node-font.ts）、
 * テストは決定的な概算器。この関数自体は DOM を知らない。
 */

/** ノード矩形の最大幅。日本語で全角20文字前後（tech-notes 論点4） */
export const NODE_MAX_WIDTH = 320
/** ノード矩形の最小幅。空のノードが点にならないための下限 */
export const NODE_MIN_WIDTH = 96
export const NODE_PADDING_X = 10
export const NODE_PADDING_Y = 6
export const NODE_BORDER = 1

/**
 * 測定が使う内側の余白。**CSS の padding と border の合計と必ず一致させること。**
 * ここが実際より小さいと、ブラウザに与えられる幅が測定の前提より狭くなり、
 * 測定より多い行数に折り返して文字が切れる
 */
export const NODE_INSET_X = NODE_PADDING_X + NODE_BORDER
export const NODE_INSET_Y = NODE_PADDING_Y + NODE_BORDER

/**
 * 上の定数に対応する Tailwind クラス。**片方だけ変えないこと。**
 * px-2.5 = 10px ／ py-1.5 = 6px ／ border = 1px
 */
export const NODE_BOX_CLASS = 'border px-2.5 py-1.5'

export type MeasureWidth = (text: string) => number

export interface WrappedText {
  /** 折り返し後の行。**描画側と同じフォント指定を前提に確定させてある** */
  lines: string[]
  /** ノード矩形の幅（余白込み） */
  width: number
  /** ノード矩形の高さ（余白込み） */
  height: number
}

/**
 * 文言を折り返してノード矩形の寸法を出す。
 *
 * 折り返しは**コードポイント単位のグリーディ**で、CSS の `word-break: break-all`
 * と同じ規則。日本語は任意位置で折り返せるので単語単位にする意味がなく、
 * 単語単位にすると測定層とブラウザの判断がずれる。
 *
 * 幅は各行の実測の最大値を切り上げて使う。**切り上げているので、描画側に
 * 渡る内容幅は測定時の前提以上になり、ブラウザが測定より早く折り返すことはない**
 *（遅く折り返して行数が減る方向は、余白が1行分増えるだけで文字は切れない）。
 */
export function wrapText(text: string, measure: MeasureWidth, lineHeight: number): WrappedText {
  const maxContent = NODE_MAX_WIDTH - NODE_INSET_X * 2
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
    NODE_MAX_WIDTH,
    Math.max(NODE_MIN_WIDTH, Math.ceil(contentWidth) + NODE_INSET_X * 2),
  )
  const height = Math.ceil(lines.length * lineHeight) + NODE_INSET_Y * 2
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
