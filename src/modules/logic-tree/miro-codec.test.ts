import { describe, expect, it } from 'vitest'
import { MIRO_MINDMAP_CF_HTML_BASE64, MIRO_MINDMAP_CF_HTML_BYTES } from './miro.fixture'
import { decodeMiroClipboard, encodeMiroClipboard, hasMiroMindmap } from './miro-codec'

/** フィクスチャ（base64）を原本の文字列に戻す */
function originalCfHtml(): string {
  return Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8')
}

describe('hasMiroMindmap', () => {
  it('原本を Miro のデータと判定する', () => {
    expect(hasMiroMindmap(originalCfHtml())).toBe(true)
  })
  it('無関係な HTML は false', () => {
    expect(hasMiroMindmap('<p>ただの貼り付け</p>')).toBe(false)
  })
  it('空文字は false', () => {
    expect(hasMiroMindmap('')).toBe(false)
  })
})

describe('decodeMiroClipboard', () => {
  it('原本から Miro の JSON を取り出す', () => {
    const decoded = decodeMiroClipboard(originalCfHtml()) as {
      host: string
      data: { objects: unknown[] }
    }
    expect(decoded.host).toBe('miro.com')
    expect(decoded.data.objects).toHaveLength(11)
  })
  it('Miro のデータでなければ null', () => {
    expect(decodeMiroClipboard('<p>ただの貼り付け</p>')).toBe(null)
  })
  it('base64 が壊れていても例外を投げず null', () => {
    expect(decodeMiroClipboard('<span data-meta="<--(miro-data-v1)!!!!(/miro-data-v1)-->"></span>')).toBe(
      null,
    )
  })
})

describe('encodeMiroClipboard', () => {
  // **この計画で最も重要なテスト。**
  // 復号したものを再び符号化して原本のバイト列に戻ることを確かめる。
  // エクスポートの壊れ方はインポートのテストでも往復テストでも検出できない
  it('原本を復号して符号化し直すと、バイト列が原本に一致する', () => {
    const original = originalCfHtml()
    const payload = decodeMiroClipboard(original)
    // 原本の div は「見た目順（y 昇順）」で並んでいる
    const texts = ['孫ノード１', '子ノード１', '孫ノード２', '親ノード', '子ノード２', '子ノード３']
    const rebuilt = encodeMiroClipboard(payload, texts)
    expect(Buffer.byteLength(rebuilt, 'utf8')).toBe(MIRO_MINDMAP_CF_HTML_BYTES)
    expect(Buffer.from(rebuilt, 'utf8').equals(Buffer.from(original, 'utf8'))).toBe(true)
  })

  it('符号化したものは自分で復号できる', () => {
    const payload = { host: 'miro.com', data: { objects: [], meta: {} } }
    const html = encodeMiroClipboard(payload, ['あ'])
    expect(decodeMiroClipboard(html)).toEqual(payload)
  })

  it('閉じタグを必ず付ける', () => {
    const html = encodeMiroClipboard({ a: 1 }, ['x'])
    expect(html).toContain('(/miro-data-v1)-->')
  })
})
