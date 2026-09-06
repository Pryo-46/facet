import { stripBom } from './canonical'
import { createSchemaValidator, type SchemaValidationResult } from './schema-validation'
import type { AnyToolModule, ModuleRegistry } from './registry'

/**
 * ファイル読み込みの区分（rev 5章の2レベル検証のレベル1側）。
 * - editable: スキーマ検証まで通過。エディタで開ける
 * - rejected: レベル1（拒否）。構造が解釈できないため開けない
 * - listOnly: 未知 type / 未知の新しい schemaVersion。一覧表示のみ・編集不可
 *   （クラッシュせずに受け止める区分）
 */
export type LoadResult =
  | { status: 'editable'; type: string; title: string; data: unknown }
  | { status: 'rejected'; type: string | null; title: string | null; reason: string; errors: string[] }
  | { status: 'listOnly'; type: string | null; title: string | null; reason: string }

/** title が読めないときの表示。一覧と帯が共有する */
export const UNTITLED = '(無題)'

/**
 * 文書レコードから表示用の title を読む。読めなければ `(無題)`。
 * **空文字はそのまま返す**——空欄は「まだ決めていない」という意思表示なので、
 * ここで潰すと未決が見えなくなる（表示側が `(無題)` に落とすかを決める）。
 * `classifyFile` と `applyEdit` の両方から呼ぶので、判定はここ1箇所に閉じる
 */
export function titleOf(data: unknown): string {
  if (typeof data !== 'object' || data === null) return UNTITLED
  const t = (data as Record<string, unknown>).title
  return typeof t === 'string' ? t : UNTITLED
}

/** 文書レコードの title だけを差し替えた新しいレコードを返す（額縁の帯が使う） */
export function withTitle(data: unknown, title: string): unknown {
  return { ...(data as Record<string, unknown>), title }
}

const validatorCache = new WeakMap<AnyToolModule, (data: unknown) => SchemaValidationResult>()

export function classifyFile(text: string, registry: ModuleRegistry): LoadResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripBom(text))
  } catch (e) {
    return {
      status: 'rejected',
      type: null,
      title: null,
      reason: 'JSON として解釈できません',
      errors: [e instanceof Error ? e.message : String(e)],
    }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return {
      status: 'rejected',
      type: null,
      title: null,
      reason: 'オブジェクトではありません',
      errors: [],
    }
  }
  const record = parsed as Record<string, unknown>
  const title = typeof record.title === 'string' ? record.title : null
  const type = typeof record.type === 'string' ? record.type : null

  // type / schemaVersion はスキーマ検証より先に読む（rev 5章。
  // 新版ファイルを「開けない」でなく「一覧表示のみ」に落とすため）
  if (!('type' in record)) {
    return {
      status: 'listOnly',
      type: null,
      title,
      reason: 'ツールのファイルではありません（type がありません）',
    }
  }
  if (type === null) {
    return {
      status: 'listOnly',
      type: null,
      title,
      reason: 'ツールのファイルではありません（type が文字列ではありません）',
    }
  }
  const module = registry.get(type)
  if (!module) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない type です: ${type}`,
    }
  }
  if (!('schemaVersion' in record)) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: 'schemaVersion がありません（このバージョンでは編集できません）',
    }
  }
  const version = record.schemaVersion
  if (typeof version !== 'number' || version > module.schemaVersion) {
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない schemaVersion です: ${String(version)}`,
    }
  }
  // 既知の旧版はメモリ上で現行版へ移してから検証する（rev 5章）。
  // **移行は検証を飛ばさない**——移した結果がスキーマに合わなければ rejected
  const candidate: Record<string, unknown> =
    version < module.schemaVersion
      ? (module.migrate(record, version) as Record<string, unknown>)
      : record

  let validate = validatorCache.get(module)
  if (!validate) {
    validate = createSchemaValidator(module.schema)
    validatorCache.set(module, validate)
  }
  const result = validate(candidate)
  if (!result.ok) {
    return {
      status: 'rejected',
      type,
      title,
      reason: 'スキーマ検証に失敗しました（このファイルは開けません）',
      errors: result.errors,
    }
  }
  return { status: 'editable', type, title: titleOf(candidate), data: candidate }
}
