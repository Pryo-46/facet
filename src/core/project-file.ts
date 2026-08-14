import type { ConsistencyIssue } from './consistency'
import { UNTITLED, type LoadResult } from './load'
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
 * 一覧の行の主表示（rev 5章。ファイル名は識別子ではないので、
 * 大きく出すのは人間がつけた名前の方）。
 *
 * **開けないファイルでも title を出す**——`classifyFile` は title を
 * スキーマ検証より前に読む（`src/core/load.ts`）ので、壊れたシーケンスでも
 * 「受注フロー」だと分かることが多い。パースすらできなければ null なので
 * ファイル名に落ちる
 */
export function displayTitle(file: ProjectFile): string {
  const { result } = file
  if (result.status === 'editable') return result.title === '' ? UNTITLED : result.title
  return result.title !== null && result.title !== '' ? result.title : file.name
}

/**
 * 全ファイルの整合性検証（レベル2）をやり直す。
 * 現在の呼び出し経路は6本——「フォルダ走査時」「ファイル選択時の読み直し」
 *「編集時」「ファイル作成時」「ファイル削除時」「外部変更の取り込み時」
 *（いずれも src/core/app-controller.ts）。必ずここを通すこと
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
