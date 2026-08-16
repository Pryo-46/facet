import { toBlob } from 'html-to-image'

/**
 * 画像キャプチャ対象のレイヤ構成（M18）。シーケンス図・ロジックツリーは
 * どちらも背景・エッジ（SVG）・ノードの3レイヤに同じ transform を掛けている
 *（`data-layer="background"|"edges"|"nodes"`）。CSS の transform を持つ層と
 * SVG の `<g transform="...">` 属性を持つ層は書き換え方が違うため分けて渡す
 */
export interface CaptureLayers {
  /** html-to-image に渡すルート要素（各エディタの containerRef） */
  root: HTMLElement
  /** style.transform を持つ DOM 要素（background・nodes レイヤ） */
  cssLayers: readonly HTMLElement[]
  /** SVG 内の `<g transform="...">` 要素（edges レイヤ） */
  svgLayers: readonly SVGElement[]
}

export interface CaptureOptions {
  /** キャプチャから除外する data-export-role の値 */
  excludeRoles?: readonly string[]
}

// cssTransform/svgTransform（sequence/logic-tree の viewport.ts に複製されている）
// には依存しない。コアが2本の複製へ依存を増やさないための選択（design spec 決定6）
const IDENTITY_CSS_TRANSFORM = 'translate(0px, 0px) scale(1)'
const IDENTITY_SVG_TRANSFORM = 'translate(0,0) scale(1)'

/**
 * 図全体を PNG バイト列としてキャプチャする。
 *
 * **transform は実DOMを直接書き換える。** html-to-image の `style` オプションは
 * キャプチャ対象のルート要素にしか効かず、子孫レイヤの transform は書き換えられない
 *（design spec 決定6）。書き換えは `toBlob` の呼び出しを挟んで必ず元に戻す
 *（`finally`）——キャプチャ中は画面が一瞬「全体表示」に見えるちらつきを許容する
 *（React state は変更しないので d3-zoom の内部状態とはズレない）。
 *
 * **サイズは `root.scrollWidth`/`scrollHeight` で実測する。** `layout.totalWidth`/
 * `totalHeight` の帳簿値は実際の描画より小さいことが分かっている
 *（open-issues の帳簿ずれ）。`overflow: hidden` な要素でも `scrollWidth`/
 * `scrollHeight` は中身の実サイズを返すので、transform をリセットした状態で
 * 読めば図全体のサイズが取れる。`chrome`（編集用UI）を除外指定していても、
 * `filter` は画像に描かないだけでキャンバスサイズには反映されない——
 * その分の余白が残ることがあるが、要素が切れるよりましなので許容する
 */
export async function captureImagePng(
  layers: CaptureLayers,
  options: CaptureOptions = {},
): Promise<Uint8Array> {
  // 'chrome'（編集用UI）は options に関わらず常に除外する。gutter はプロファイルごとに
  // ユーザーが選ぶもの（with-gutter/without-gutter）だが、chrome は「編集用UIを画像に
  // 描かない」という不変条件そのもの——各プロファイルの excludeRoles に値として書くと、
  // 新しいプロファイルを足す人が書き忘れる余地が生まれる（design spec 決定5）。
  // だからプロファイル側の値としてではなく、ここで構造的に常時追加する
  const excludeRoles = new Set([...(options.excludeRoles ?? []), 'chrome'])
  const cssOriginal = layers.cssLayers.map((el) => el.style.transform)
  const svgOriginal = layers.svgLayers.map((el) => el.getAttribute('transform'))

  for (const el of layers.cssLayers) el.style.transform = IDENTITY_CSS_TRANSFORM
  for (const el of layers.svgLayers) el.setAttribute('transform', IDENTITY_SVG_TRANSFORM)

  try {
    const width = layers.root.scrollWidth
    const height = layers.root.scrollHeight
    const blob = await toBlob(layers.root, {
      width,
      height,
      style: { overflow: 'visible' },
      // html-to-image は DOM ツリーを歩く途中で Text/Comment ノードにも filter を
      // 呼ぶ（宣言上の型は `HTMLElement` だが実際には違う）。getAttribute を
      // 持たないノードが来るので `?.` で無条件に呼ばず、`== null` で
      // 「Element でない」と「属性が無い」の両方を「除外対象ではない」として扱う
      filter: (node) => {
        const role = (node as Element).getAttribute?.('data-export-role')
        return role == null || !excludeRoles.has(role)
      },
    })
    if (blob === null) throw new Error('画像の生成に失敗しました')
    return new Uint8Array(await blob.arrayBuffer())
  } finally {
    // **無条件には書き戻さない。** await の間に他の誰か（d3-zoom のパン/ズーム等）が
    // この要素の transform を書き換えていたら、その値が正——ここで identity のまま
    // 退避値へ戻すと、React state は新しい transform を指しているのに DOM だけ
    // キャプチャ前の値に固定される。React はレンダー前後で vdom の値が変わらない
    // 限り DOM へ書き戻さないため（新しい値は既に vdom に反映済み）、
    // 一度この状態に落ちるとユーザーが再度パン/ズームするまで直らない。
    // 「まだ自分が書いた identity のまま」の要素だけを復元することで、
    // 割り込んだ側の書き込みを保護する
    layers.cssLayers.forEach((el, i) => {
      if (el.style.transform === IDENTITY_CSS_TRANSFORM) el.style.transform = cssOriginal[i]
    })
    layers.svgLayers.forEach((el, i) => {
      if (el.getAttribute('transform') !== IDENTITY_SVG_TRANSFORM) return
      const original = svgOriginal[i]
      if (original === null) el.removeAttribute('transform')
      else el.setAttribute('transform', original)
    })
  }
}
