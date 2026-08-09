import { createColumnWidthStore, type ColumnWidthStore } from '@/core/column-resize'
import { PROFILE_COLUMNS } from './columns'
import type { ProfileId } from './profiles'

/**
 * エラーテーブルの列幅（M10 決定16）。
 *
 * **プロファイルごとに1本持つ。** 列数が変わるので1本では持てない——
 * 幅配列は固定幅の列を並び順で持つだけなので、列が増減すると同じ添字が
 * 別の列を指してしまう。
 *
 * アプリを閉じるまで保持し、ファイル切替をまたぐ（エディタは App 側で
 * `key={selected.path}` により作り直されるため、エディタ内の state には置けない）。
 *
 * **モジュールスコープの可変状態はテスト間で漏れる。**
 * DOM テストの beforeEach で両方の `reset()` を呼ぶこと
 */
export const errorColumnWidths: Record<ProfileId, ColumnWidthStore> = {
  support: createColumnWidthStore(PROFILE_COLUMNS.support.defaultWidths),
  dev: createColumnWidthStore(PROFILE_COLUMNS.dev.defaultWidths),
}

/** 列の最小幅(px)。用語集と同じ値に揃える */
export const MIN_COLUMN_WIDTH = 88

/** 原因（業務）列（幅を持たない列）に残す最小幅(px) */
export const CAUSE_MIN_WIDTH = 144

/** キーボード（←→）1回あたりの変化量(px) */
export const RESIZE_STEP = 16
