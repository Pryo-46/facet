import type { ConsistencyIssue } from '@/core/consistency'
import { findDuplicates } from '@/core/duplicate'
import { buildErrorMarks, type ErrorMarks } from '@/core/list-editor/cell-face'
import { normalizeForMatch } from '@/core/normalize'
import { rowRef } from '@/core/row-ref'
import type { DecisionTableSchemaVersion1 } from '@/types/decision-table'
import { productSize, valueIndicesAt } from './rows'

/**
 * 指摘が指す区画。条件・結果・行はそれぞれ別の索引空間を持つ。
 *
 * **接頭辞を落とすと、3つの索引空間が1つの `ErrorMarks` に混ざる**
 *——条件の3行目の赤が表本体の3行目にも出る
 */
export type Section = 'condition' | 'outcome' | 'row'

export function locationField(section: Section, field: string): string {
  return `${section}:${field}`
}

/** 指摘を区画で絞り、接頭辞を外して `cellFace` が読める形にする */
export function sectionMarks(
  issues: readonly ConsistencyIssue[],
  section: Section,
): ErrorMarks {
  const prefix = `${section}:`
  const narrowed = issues.map((issue) => ({
    ...issue,
    locations: issue.locations.flatMap((loc) =>
      loc.field !== null && loc.field.startsWith(prefix)
        ? [{ ...loc, field: loc.field.slice(prefix.length) }]
        : [],
    ),
  }))
  return buildErrorMarks(narrowed)
}

/** 空は未記入であって矛盾ではない。重複の判定から外す */
const named = (text: string): boolean => text !== ''

/**
 * デシジョンテーブルのモジュール内検証（規約4）。自ファイルで完結する検証のみ。
 *
 * **行は ID を持たない**ので `entityId` は空文字を渡す。位置は `entityIndex` が指し、
 * メッセージは `#N` で行を呼ぶ（rev 9章 D4）
 */
export function checkDecisionTableConsistency(
  data: DecisionTableSchemaVersion1,
): ConsistencyIssue[] {
  const issues: ConsistencyIssue[] = []
  const { conditions, outcomes, rows } = data

  // ID 重複（ID は機械的識別子なので正規化しない完全一致）
  for (const [id, indices] of findDuplicates(conditions, (x) => x.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(' ／ ')}）: ${id}`,
      locations: indices.map((i) => ({
        entityId: id,
        entityIndex: i,
        field: locationField('condition', 'id'),
      })),
    })
  }
  for (const [id, indices] of findDuplicates(outcomes, (x) => x.id)) {
    issues.push({
      rule: 'duplicate-id',
      message: `ID が重複しています（${indices.length}件。${indices.map(rowRef).join(' ／ ')}）: ${id}`,
      locations: indices.map((i) => ({
        entityId: id,
        entityIndex: i,
        field: locationField('outcome', 'id'),
      })),
    })
  }

  // 名前の重複（同名2件は宣言としての矛盾。rev 5章）
  {
    const targets = conditions.filter((x) => named(x.name))
    for (const indices of findDuplicates(targets, (x) => normalizeForMatch(x.name)).values()) {
      const at = indices.map((i) => conditions.indexOf(targets[i]))
      issues.push({
        rule: 'duplicate-name',
        message: `条件名「${targets[indices[0]].name}」が${indices.length}件重複しています（${at.map(rowRef).join(' ／ ')}）`,
        locations: at.map((i) => ({
          entityId: conditions[i].id,
          entityIndex: i,
          field: locationField('condition', 'name'),
        })),
      })
    }
  }
  {
    const targets = outcomes.filter((x) => named(x.name))
    for (const indices of findDuplicates(targets, (x) => normalizeForMatch(x.name)).values()) {
      const at = indices.map((i) => outcomes.indexOf(targets[i]))
      issues.push({
        rule: 'duplicate-name',
        message: `結果名「${targets[indices[0]].name}」が${indices.length}件重複しています（${at.map(rowRef).join(' ／ ')}）`,
        locations: at.map((i) => ({
          entityId: outcomes[i].id,
          entityIndex: i,
          field: locationField('outcome', 'name'),
        })),
      })
    }
  }

  // 値ラベル・選択肢ラベルの重複（1つの条件・結果の中だけを見る）
  conditions.forEach((c, index) => {
    const labels = c.values.filter(named)
    for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
      issues.push({
        rule: 'duplicate-value',
        message: `${rowRef(index)}「${c.name}」の値「${labels[group[0]]}」が${group.length}件重複しています`,
        locations: [
          { entityId: c.id, entityIndex: index, field: locationField('condition', 'values') },
        ],
      })
    }
  })
  outcomes.forEach((o, index) => {
    const labels = o.choices.filter(named)
    for (const group of findDuplicates(labels, (v) => normalizeForMatch(v)).values()) {
      issues.push({
        rule: 'duplicate-choice',
        message: `${rowRef(index)}「${o.name}」の選択肢「${labels[group[0]]}」が${group.length}件重複しています`,
        locations: [
          { entityId: o.id, entityIndex: index, field: locationField('outcome', 'choices') },
        ],
      })
    }
  })

  // 長さの不一致と未知の値
  rows.forEach((row, index) => {
    if (row.values.length !== conditions.length || row.results.length !== outcomes.length) {
      issues.push({
        rule: 'row-length',
        message: `${rowRef(index)} の列数が条件・結果の本数と違います（値 ${row.values.length}／${conditions.length}、結果 ${row.results.length}／${outcomes.length}）`,
        locations: [{ entityId: '', entityIndex: index, field: locationField('row', 'id') }],
      })
    }
    row.values.forEach((value, i) => {
      const condition = conditions[i]
      if (condition === undefined || value === '' || condition.values.includes(value)) return
      issues.push({
        rule: 'unknown-value',
        message: `${rowRef(index)} の「${condition.name}」に、条件の値にない「${value}」が入っています`,
        locations: [{ entityId: '', entityIndex: index, field: locationField('row', 'id') }],
      })
    })
    row.results.forEach((value, j) => {
      const outcome = outcomes[j]
      if (outcome === undefined || value === '' || outcome.choices.includes(value)) return
      issues.push({
        rule: 'unknown-value',
        message: `${rowRef(index)} の「${outcome.name}」に、選択肢にない「${value}」が入っています`,
        locations: [
          { entityId: '', entityIndex: index, field: locationField('row', `result:${j}`) },
        ],
      })
    })
  })

  // 直積との不一致。**欠け・余り・順序違いをまとめて1件で出す**
  // ——行ごとに出すと、条件を1つ足しただけで全行が赤くなる
  const total = productSize(conditions)
  const matches =
    rows.length === total &&
    rows.every((row, position) => {
      const indices = valueIndicesAt(conditions, position)
      return conditions.every((c, i) => row.values[i] === c.values[indices[i]])
    })
  if (!matches) {
    issues.push({
      rule: 'row-set',
      message: `行の集合が条件の直積と一致しません（${rows.length}行／${total}行）。条件か値を編集すると整い直します`,
      locations: [],
    })
  }

  return issues
}
