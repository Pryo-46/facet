import type { ClipboardExchange } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { decodeMiroClipboard, encodeMiroClipboard, hasMiroMindmap } from './miro-codec'
import { nodesToMiroPayload } from './miro-export'
import { miroPayloadToNodes } from './miro-import'

/**
 * Miro のマインドマップとのクリップボード交換（規約7）。
 * 器（miro-codec）と木（miro-import / miro-export）を束ねるだけで、判断は持たない。
 */
export const miroMindmapExchange: ClipboardExchange<LogicTreeSchemaVersion1> = {
  id: 'miro-mindmap',
  label: 'Miro のマインドマップ',

  toClipboard(data) {
    const { payload, texts, plainTexts } = nodesToMiroPayload(data)
    return {
      html: encodeMiroClipboard(payload, texts),
      // プレーンテキスト側は他アプリ向け。**texts（HTML エスケープ済み）ではなく
      // plainTexts（生の文言）を使う**——ここに texts を使うと、貼り付け先が
      // HTML を解釈しないアプリの場合に `&amp;` のようなエスケープ済み文字列が
      // そのまま見えてしまう
      text: plainTexts.join('\n'),
    }
  },

  canImport(html) {
    return hasMiroMindmap(html)
  },

  fromClipboard(html, title) {
    const payload = decodeMiroClipboard(html)
    if (payload === null) return { ok: false, reason: 'Miro のデータとして読めませんでした。' }
    const result = miroPayloadToNodes(payload)
    if (!result.ok) return result
    return {
      ok: true,
      data: { schemaVersion: 1, type: 'logicTree', title, nodes: result.nodes },
    }
  },
}
