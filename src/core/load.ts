import { stripBom } from './canonical'
import { createSchemaValidator, type SchemaValidationResult } from './schema-validation'
import type { AnyToolModule, ModuleRegistry } from './registry'

/**
 * ファイル読み込みの区分（rev 5章の2レベル検証のレベル1側）。
 * - editable: スキーマ検証まで通過。エディタで開ける
 * - rejected: レベル1（拒否）。構造が解釈できないため開けない
 * - listOnly: 未知 type / 未知の新しい schemaVersion。一覧表示のみ・編集不可
 *   （M2 で赤バッジ等の本格対応。M1 ではクラッシュしない受け皿として持つ）
 */
export type LoadResult =
  | { status: 'editable'; type: string; title: string; data: unknown }
  | { status: 'rejected'; type: string | null; title: string | null; reason: string; errors: string[] }
  | { status: 'listOnly'; type: string | null; title: string | null; reason: string }

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
  if (record.schemaVersion !== module.schemaVersion) {
    // 既知の旧版が生まれたら module.migrate による移行をここに挟む
    // （glossary は schemaVersion 1 が初版のため、現状「異なる版」は新版しかない）
    return {
      status: 'listOnly',
      type,
      title,
      reason: `このバージョンでは編集できない schemaVersion です: ${String(record.schemaVersion)}`,
    }
  }

  let validate = validatorCache.get(module)
  if (!validate) {
    validate = createSchemaValidator(module.schema)
    validatorCache.set(module, validate)
  }
  const result = validate(record)
  if (!result.ok) {
    return {
      status: 'rejected',
      type,
      title,
      reason: 'スキーマ検証に失敗しました（このファイルは開けません）',
      errors: result.errors,
    }
  }
  return { status: 'editable', type, title: title ?? '(無題)', data: record }
}
