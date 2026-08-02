import type { ConsistencyIssue } from './consistency'
import type { ModuleRegistry } from './registry'

export interface ProjectFileEntry {
  path: string
  /** classifyFile が読み取った type（読めなかったファイルは null） */
  type: string | null
}

function fileName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/**
 * コア横断検証（rev 6章の責務内訳の「コア」側）。単一ファイルでは判定できない検証。
 * 現状は singleton モジュールの単一性違反（用語集の単一性。rev 5章）のみ。
 * rejected / listOnly のファイルも type が読めていれば数える——仕様は
 * 「type: glossary のファイルが2つ以上」という物理条件であり、
 * 壊れた用語集ファイルも「どちらを正とするか」の人間の判断対象に含まれるため。
 */
export function checkProjectConsistency(
  files: ProjectFileEntry[],
  registry: ModuleRegistry,
): Map<string, ConsistencyIssue[]> {
  const byType = new Map<string, ProjectFileEntry[]>()
  for (const f of files) {
    if (f.type === null) continue
    byType.set(f.type, [...(byType.get(f.type) ?? []), f])
  }
  const out = new Map<string, ConsistencyIssue[]>()
  for (const [type, group] of byType) {
    const module = registry.get(type)
    if (!module?.singleton || group.length <= 1) continue
    const names = group.map((f) => fileName(f.path)).join('、')
    const issue: ConsistencyIssue = {
      rule: 'singleton-violation',
      message: `${module.displayName}のファイルがプロジェクトに${group.length}件あります（1つにしてください）: ${names}`,
      locations: [],
    }
    for (const f of group) addIssue(out, f.path, issue)
  }
  return out
}

/**
 * 検証結果への追記。コア横断ルールが2本目になったとき、先のルールの
 * issue を上書きで消さないためのヘルパ。新しいルールは必ずこれを通すこと
 */
export function addIssue(
  out: Map<string, ConsistencyIssue[]>,
  path: string,
  issue: ConsistencyIssue,
): void {
  out.set(path, [...(out.get(path) ?? []), issue])
}
