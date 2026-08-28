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
    const { payload, texts } = nodesToMiroPayload(data)
    return {
      html: encodeMiroClipboard(payload, texts),
      // プレーンテキスト側は他アプリ向け。Miro も同じ位置に文言だけを並べている
      text: texts.join('\n'),
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
