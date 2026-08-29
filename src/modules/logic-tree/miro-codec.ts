/**
 * Miro のクリップボード形式の**器**（CF_HTML と data-meta）。木のことは知らない。
 *
 * 器と木を分けてあるのは、**器の不具合が木のテストでは見えない**ため。M2 の調査では
 * 閉じタグの欠落に3回の実機実験を費やした——復号は末尾の余分を黙って捨てるので通り、
 * 往復テストも通ってしまう。だから器のテストは**原本のバイト列と照合する**。
 *
 * 形式の詳細は docs/superpowers/plans/2026-08-29-logic-tree-m3-miro-clipboard-design.md
 */

const OPEN = '<--(miro-data-v1)'
const CLOSE = '(/miro-data-v1)-->'
/** 各バイトに足すシフト量。Miro の難読化（暗号ではない） */
const SHIFT = 59

const CF_PRE = '<html>\r\n<body>\r\n<!--StartFragment-->'
const CF_POST = '<!--EndFragment-->\r\n</body>\r\n</html>'

/** data-meta の中身を取り出す。無ければ null */
function readMetaAttribute(html: string): string | null {
  const matched = /data-meta="([^"]*)"/.exec(html)
  if (matched === null) return null
  const value = matched[1]
  return value.startsWith(OPEN) ? value : null
}

export function hasMiroMindmap(html: string): boolean {
  return readMetaAttribute(html) !== null
}

export function decodeMiroClipboard(html: string): unknown | null {
  const meta = readMetaAttribute(html)
  if (meta === null) return null
  // 閉じタグは**あれば外す**。Miro は付けてくるが、無くても base64 は読める
  const body = meta.slice(OPEN.length).replace(CLOSE, '')
  try {
    const shifted = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    const raw = shifted.map((b) => (b - SHIFT) & 0xff)
    const json = new TextDecoder().decode(raw)
    return JSON.parse(json)
  } catch {
    // 壊れたクリップボードは「Miro のデータではない」として扱う。例外は投げない
    return null
  }
}

/** ヘッダは桁数固定なので、値が変わっても長さは変わらない */
function cfHeader(startHtml: number, endHtml: number, startFrag: number, endFrag: number): string {
  const pad = (n: number) => String(n).padStart(10, '0')
  return (
    `Version:0.9\r\nStartHTML:${pad(startHtml)}\r\nEndHTML:${pad(endHtml)}\r\n` +
    `StartFragment:${pad(startFrag)}\r\nEndFragment:${pad(endFrag)}\r\n`
  )
}

/** UTF-8 のバイト数。**CF_HTML のオフセットは文字数ではなくバイト位置である** */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function encodeMiroClipboard(payload: unknown, texts: readonly string[]): string {
  const json = JSON.stringify(payload)
  const raw = new TextEncoder().encode(json)
  const shifted = raw.map((b) => (b + SHIFT) & 0xff)
  let binary = ''
  for (const b of shifted) binary += String.fromCharCode(b)
  const meta = OPEN + btoa(binary) + CLOSE

  // div 側は表示用（構造は持たない）。区切りは \n であって \r\n ではない
  const fragment =
    `<span data-meta="${meta}"></span>` +
    texts.map((t) => `<div><div><div>${t}</div></div></div>`).join('\n')

  const headLen = byteLength(cfHeader(0, 0, 0, 0))
  const startHtml = headLen
  const startFrag = startHtml + byteLength(CF_PRE)
  const endFrag = startFrag + byteLength(fragment)
  const endHtml = endFrag + byteLength(CF_POST)
  return cfHeader(startHtml, endHtml, startFrag, endFrag) + CF_PRE + fragment + CF_POST
}
