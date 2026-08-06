import type { ConsistencyIssue } from './consistency'
import type { LoadResult } from './load'
import { checkProjectConsistency } from './project-consistency'
import type { ModuleRegistry } from './registry'

/** 走査済みプロジェクトファイル1件。額縁の一覧・エディタの赤表示が共有する */
export interface ProjectFile {
  path: string
  name: string
  result: LoadResult
  /** モジュール内検証＋コア横断検証の結果（レベル2）。一覧バッジとエディタ赤表示に使う */
  issues: ConsistencyIssue[]
}

export function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * 全ファイルの整合性検証（レベル2）をやり直す。
 * 現在の呼び出し経路は「フォルダ走査時」「編集時」「ファイル作成・削除時」。
 * M5 の外部変更の取り込みも必ずここを通すこと
 */
export function computeIssues(files: ProjectFile[], registry: ModuleRegistry): ProjectFile[] {
  const cross = checkProjectConsistency(
    files.map((f) => ({ path: f.path, type: f.result.type })),
    registry,
  )
  return files.map((f) => {
    const local =
      f.result.status === 'editable'
        ? (registry.get(f.result.type)?.checkConsistency(f.result.data) ?? [])
        : []
    return { ...f, issues: [...local, ...(cross.get(f.path) ?? [])] }
  })
}
