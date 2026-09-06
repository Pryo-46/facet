import { homeDir, join, resolveResource } from '@tauri-apps/api/path'
import { readTextFile } from '@tauri-apps/plugin-fs'

/**
 * プラグインの識別子。`<プラグイン名>@<marketplace 名>` で、どちらも
 * `.claude-plugin/marketplace.json` が決めている
 */
export const FACET_PLUGIN_ID = 'facet@facet'

/**
 * 同梱プラグインの実体の場所。`bundle.resources` が
 * `plugins/facet` を `plugin` として入れている
 */
export function bundledPluginDir(): Promise<string> {
  return resolveResource('plugin')
}

/**
 * 利用者がプラグインを導入して有効にしているか。
 *
 * **コマンドを起こさずファイルを1つ読む。** `claude plugin list --json` の
 * ほうが正確だが、そのために子プロセスを起こす手段を増やすことになる。
 * 有効・無効は `enabledPlugins` に現れるので、これで足りる。
 *
 * **読めなければ false を返す。** ファイルが無い（Claude Code を一度も
 * 使っていない）・壊れている・形式が変わった、のどれでも
 * 「導入していない」に倒す——同梱版を渡す側に倒れるので、
 * 最悪でも「同じ Skill が2つ見える」で済む。逆に倒すと Skill が消える
 */
export async function readFacetPluginEnabled(): Promise<boolean> {
  try {
    const path = await join(await homeDir(), '.claude', 'settings.json')
    const parsed: unknown = JSON.parse(await readTextFile(path))
    if (typeof parsed !== 'object' || parsed === null) return false
    const enabled = (parsed as { enabledPlugins?: unknown }).enabledPlugins
    if (typeof enabled !== 'object' || enabled === null) return false
    return (enabled as Record<string, unknown>)[FACET_PLUGIN_ID] === true
  } catch {
    return false
  }
}
