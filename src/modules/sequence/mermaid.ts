/**
 * Mermaid `sequenceDiagram` の組み立て（design-notes 論点8・11）。
 *
 * **置き場はモジュール内。** 論点11 は「先に出力を実装した側が正規化関数を
 * 1本立て、後発がそれに乗る」としているが、コアの `markdown-table.ts` 自身が
 * 用語集で生まれて M10 の2本目で引き上げられた経緯があり、このリポジトリは
 * 「1本目では抽象を作らない」で通っている。logic-tree の出力を作るときに
 * `core/mermaid.ts` へ引き上げる（open-issues に記録）
 */

import type { SequenceSchemaVersion1 } from '@/types/sequence'
import { stepShapeOf, type StepShapeValue } from './commands'
import { UNDEFINED_VALUE, UNRESOLVED_ACTOR_LABEL } from './output-labels'

/**
 * Mermaid のラベルに収める。
 *
 * - 改行は含められないので `<br>` にする（Mermaid はラベル内の `<br>` を解釈する）
 * - `#` はエンティティ記法（`#35;`）の開始文字、`;` は文の区切りに読まれうる
 *
 * **1回の走査で置き換える。** `replace` を順に掛けると、後の置換が前の置換で
 * 入れた文字を食う（`escapeCell` がバックスラッシュを先に処理しているのと
 * 同じ問題だが、こちらは順序では解けない——どちらを先にしても壊れる）
 */
export function escapeMermaidLabel(text: string): string {
  return text
    .replace(/[#;]/g, (ch) => (ch === '#' ? '#35;' : '#59;'))
    .replace(/\r\n|\r|\n/g, '<br>')
}

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
    // 末尾に置く——既存の参加者の列順を動かさない
    participants.push(`    participant ${UNRESOLVED_ID} as ${UNRESOLVED_ACTOR_LABEL}`)
  }

  return ['sequenceDiagram', ...participants, ...messages].join('\n')
}
