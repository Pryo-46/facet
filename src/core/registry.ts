import type { ComponentType } from 'react'
import type { JsonSchema } from './canonical'
import type { ConsistencyIssue } from './consistency'

export interface EditorProps<TData> {
  data: TData
  /**
   * 編集の反映。mergeKey は Undo 履歴のまとめ単位（同一セルへの連続入力は
   * 同じキーを渡すと1履歴にまとまる）。構造操作（行追加・削除・並び替え）は
   * null を渡して常に独立した履歴にする
   */
  onChange: (next: TData, mergeKey?: string | null) => void
  /** このファイルの整合性検証結果（レベル2）。エディタはセル・行の赤表示に使う */
  issues: ConsistencyIssue[]
  /**
   * モーダル（確認ダイアログ等）が開いているか。true の間は操作言語を止める
   *（Esc をモーダルとエディタで取り合わないため。rev 10章の境界規則）。
   * 各エディタはこれを KeyContext.modalOpen へそのまま渡すだけでよい
   */
  modalOpen: boolean
}

/**
 * 出力プロファイル（規約5。rev 6章・8章）。**同じデータでも読み手によって
 * 出すべき列が違う**ため、モジュールは1つ以上のプロファイルを宣言する。
 * 読み手ごとにファイルを分けると二重管理が発生し、文章仕様書の問題が
 * 再生産される——だから1つのデータから出し分ける
 */
export interface OutputProfile<TData> {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ドロップダウンに出す表示名 */
  label: string
  /**
   * 書き出しの既定ファイル名に足す接尾辞（単一プロファイルなら ''）。
   * **`label` から導出しない。** 表示名は画面の都合でいつでも変えたくなるが、
   * 書き出したファイル名は Git に成果物として残る側なので別の軸として持つ
   */
  fileSuffix: string
  /**
   * NotePM 等へ貼る Markdown を返す。額縁がクリップボードへのコピーと
   * `.md` 書き出しの両方に使うので、**副作用を持たない純関数**であること
   *（ファイルにもクリップボードにも触らない）
   */
  toMarkdown: (data: TData) => string
  /**
   * 整合性エラー（レベル2の赤）があるまま出力しようとしたとき、
   * **出力に何が起きるか**を述べる1文。額縁の確認ダイアログが本文の末尾に足す。
   *
   * 何が起きるかはツールごとに違う（用語集の ID 重複と、シーケンスの参照切れでは
   * 出力に起きることが別）ので、額縁が文面を持てない。**任意スロットであり、
   * 持たないツールは汎用文だけになる**——モジュール規約の点数は増えない
   *（M9 が規約5 を複数プロファイルへ拡張したのと同じ層の拡張）
   */
  describeIssueEffect?: (issues: readonly ConsistencyIssue[]) => string
}

/**
 * 画像出力プロファイル（rev 8章 M18で追加）。`OutputProfile` と違い
 * **副作用を持たない純関数にはできない**——DOM実測（レイアウト後の座標・
 * フォントメトリクス）に依存するため、データから画像を導出する関数を
 * ここには持たない。実処理は `core/image-export.ts` が DOM 要素を受け取って行う
 */
export interface ImageOutputProfile {
  /** 安定識別子。UI の選択状態・テストが参照する */
  id: string
  /** ドロップダウンに出す表示名 */
  label: string
  /** 書き出しの既定ファイル名に足す接尾辞（単一プロファイルなら ''） */
  fileSuffix: string
  /** キャプチャから除外する data-export-role の値（省略時は全部含める） */
  excludeRoles?: readonly string[]
}

/**
 * ツールモジュール規約（rev 6章）。M6 の出力ロジック追加で6点セットが埋まった。
 * `createEmpty` は6点セットには無い7つ目のスロット（額縁の新規作成が使う雛形）。
 * M9 で規約5を複数プロファイル（`outputs`）へ拡張した。
 */
export interface ToolModule<TData = unknown> {
  /** 規約1: type 識別子 */
  type: string
  /** 一覧・エラーメッセージで使う表示名（例: 用語集） */
  displayName: string
  /**
   * 一覧に出すアイコン（規約: 表示名とセット）。**`LucideIcon` と書かないこと**
   * ——コアを lucide に依存させないため。lucide のアイコンはこの型に代入できる
   */
  icon: ComponentType<{ className?: string }>
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
  /**
   * 規約5: 出力プロファイル（rev 6章・8章）。
   *
   * **0本は「出力を作っていないツール」の状態として正しい。** 額縁の
   * `ExportMenu` はプロファイルが無いとき出力ボタンを押せなくする——
   * 「押せるが壊れた文字列が出るボタン」を作らないため
   */
  outputs: readonly OutputProfile<TData>[]
  /**
   * 画像出力プロファイル（rev 8章 M18）。**0本は「画像出力を持たないツール」
   * の状態として正しい**——`outputs` と同じ思想（額縁は0本のとき画像出力
   * ボタンを押せなくする）
   */
  imageOutputs: readonly ImageOutputProfile[]
  /** プロジェクト内に同 type のファイルを1つしか許さないか（コア横断検証が使う） */
  singleton: boolean
  /** 規約6: マイグレータ（旧 schemaVersion → 現行版。初版は恒等） */
  migrate: (data: unknown, fromVersion: number) => TData
  /**
   * 新規作成（額縁のファイル操作。rev 6章）が使う空文書の雛形。
   * rev 6章のモジュール規約6点セットには無いスロットだが、額縁は type から
   * モジュールを引いて作るため、雛形を置ける場所はモジュール側しかない。
   * title は額縁が決めたファイル名（拡張子なし）を渡す——初期状態で
   * ファイル名と表示名を一致させ、単一性違反時にどちらの話か見分けられるようにする
   */
  createEmpty: (title: string) => TData
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
  /** 登録順の全モジュール。新規作成の type 選択肢に使う */
  list(): AnyToolModule[]
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
    list() {
      return [...byType.values()]
    },
  }
}
