import type { ComponentType } from 'react'
import type { JsonSchema } from './canonical'
import type { ConsistencyIssue } from './consistency'

export interface EditorProps<TData> {
  data: TData
  onChange: (next: TData) => void
  /** このファイルの整合性検証結果（レベル2）。エディタはセル・行の赤表示に使う */
  issues: ConsistencyIssue[]
}

/**
 * ツールモジュール規約（rev 6章）の M1 時点の枠。
 * 整合性検証ルール（M2）と出力ロジック（M6）は該当マイルストーンでスロットを追加する。
 */
export interface ToolModule<TData = unknown> {
  /** 規約1: type 識別子 */
  type: string
  /** 一覧・エラーメッセージで使う表示名（例: 用語集） */
  displayName: string
  /** 現行の schemaVersion。これと異なる版のファイルは「一覧表示のみ」に落ちる */
  schemaVersion: number
  /** 規約2: JSON Schema（schemas/ の実体を import する。コピー禁止） */
  schema: JsonSchema
  /** ID 規約の entityPrefix。レジストリが登録時に重複検査する（rev 5章） */
  idPrefixes: readonly string[]
  /** 規約3: エディタコンポーネント */
  Editor: ComponentType<EditorProps<TData>>
  /** 規約4: 整合性検証ルール（モジュール内検証。レベル2＝受け入れて赤表示） */
  checkConsistency: (data: TData) => ConsistencyIssue[]
  /** プロジェクト内に同 type のファイルを1つしか許さないか（コア横断検証が使う） */
  singleton: boolean
  /** 規約6: マイグレータ（旧 schemaVersion → 現行版。初版は恒等） */
  migrate: (data: unknown, fromVersion: number) => TData
}

// Editor の data 型はモジュールごとに異なるため、レジストリ内では any で保持する
// （取り出した側が type で分岐して扱う。EditorProps が TData に対して不変なため
//   unknown では代入できない）
// biome-ignore / oxlint 上 any が警告される場合はこの1箇所に限り抑止してよい
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnyToolModule = ToolModule<any>

export interface ModuleRegistry {
  register(module: AnyToolModule): void
  get(type: string): AnyToolModule | undefined
}

export function createRegistry(): ModuleRegistry {
  const byType = new Map<string, AnyToolModule>()
  const prefixOwner = new Map<string, string>()
  return {
    register(module) {
      if (byType.has(module.type)) {
        throw new Error(`type が重複しています: ${module.type}`)
      }
      const seen = new Set<string>()
      for (const p of module.idPrefixes) {
        if (seen.has(p)) {
          throw new Error(`ID プレフィクスがモジュール内で重複しています: ${p}（${module.type}）`)
        }
        seen.add(p)
        const owner = prefixOwner.get(p)
        if (owner) {
          throw new Error(`ID プレフィクスが重複しています: ${p}（${owner} と ${module.type}）`)
        }
      }
      byType.set(module.type, module)
      for (const p of module.idPrefixes) prefixOwner.set(p, module.type)
    },
    get(type) {
      return byType.get(type)
    },
  }
}
