/**
 * Mermaid `sequenceDiagram` の組み立て（design-notes 論点8・11）。
 *
 * **ラベルのエスケープ（`escapeMermaidLabel`）はコアへ引き上げ済み。** 論点11 は
 * 「先に出力を実装した側が正規化関数を1本立て、後発がそれに乗る」としており、
 * sequence が1本目としてここに持っていたが、logic-tree の出力を作った
 * logic-tree-m3 で `@/core/mermaid.ts` へ引き上げた（`markdown-table.ts` が
 * 用語集→コアと辿った道と同じ）。ここでは re-export して既存の import 経路
 * （`from './mermaid'`）を壊さない
 */

import { escapeMermaidLabel } from '@/core/mermaid'
import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { stepShapeOf, type StepShapeValue } from './commands'
import { UNDEFINED_VALUE, UNRESOLVED_ACTOR_LABEL } from './output-labels'

export { escapeMermaidLabel }

/**
 * 矢印の形は kind × awaitsReply から導出する（design-notes 論点8）。
 * UML 慣習に一致: 実線・塗り矢頭／実線・開き矢頭／破線・開き矢頭
 */
const ARROW: Record<StepShapeValue, string> = {
  'call-sync': '->>',
  'call-async': '-)',
  reply: '-->>',
  self: '->>',
}

/** 解決できない参照の逃げ場。Mermaid の識別子なので英数字にする */
const UNRESOLVED_ID = 'unresolved'

/** 空の名前・文言は（未定義）にする。`participant a1 as ` や `a1->>a2: ` は Mermaid で壊れる */
function orUndefined(text: string): string {
  return text === '' ? UNDEFINED_VALUE : text
}

/**
 * 正常系のみの `sequenceDiagram`（design-notes 論点11）。失敗考慮は出さない。
 * 末尾に改行を付けない——呼び出し側（markdown.ts）がフェンスで囲む。
 *
 * **``` でフェンスが割れることはない。** ラベルは escapeMermaidLabel で
 * 改行が `<br>` になるので、生成される行は必ず4スペースのインデントで始まる。
 * ``` が行頭に来ないので、フェンスの終端と誤読されない
 */
export function sequenceToMermaid(data: SequenceSchemaVersion1): string {
  // ID 重複を受け入れるファイルなので、先頭の1つだけが採番を持つ（後続は
  // 参照から引けず（未解決）へ落ちる）。logic-tree の「ID が重複している
  // ファイルでは先頭の1つにだけ付く」と同じ扱い
  const idOf = new Map<string, string>()
  data.actors.forEach((actor, i) => {
    if (!idOf.has(actor.id)) idOf.set(actor.id, `a${i + 1}`)
  })

  let usedUnresolved = false
  const resolve = (ref: string | undefined): string => {
    const id = ref === undefined ? undefined : idOf.get(ref)
    if (id === undefined) {
      usedUnresolved = true
      return UNRESOLVED_ID
    }
    return id
  }

  // **メッセージ行を先に組む。** （未解決）を宣言するかどうかが、
  // 全ステップを見終わるまで決まらないため
  const messages = data.steps.map((step) => {
    const shape = stepShapeOf(step)
    const from = resolve(step.from)
    // self は宛先を持たない（to があっても無視する。to-mismatch は赤表示が扱う）
    const to = shape === 'self' ? from : resolve(step.to)
    return `    ${from}${ARROW[shape]}${to}: ${escapeMermaidLabel(orUndefined(step.label))}`
  })

  const participants = data.actors
    // ID 重複の2つ目以降は採番を持たない（先頭が `a{i+1}` を握っている）ので宣言しない
    .filter((actor, i) => idOf.get(actor.id) === `a${i + 1}`)
    .map(
      (actor) =>
        `    participant ${idOf.get(actor.id)} as ${escapeMermaidLabel(orUndefined(actor.name))}`,
    )
  if (usedUnresolved) {
    // 末尾に置く——既存のアクターの列順を動かさない
    participants.push(`    participant ${UNRESOLVED_ID} as ${UNRESOLVED_ACTOR_LABEL}`)
  }

  return ['sequenceDiagram', ...participants, ...messages].join('\n')
}
