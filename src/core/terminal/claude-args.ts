/**
 * 端末で起動する `claude` に渡す引数（コア・純関数）。
 *
 * **同梱プラグインを渡すのは、利用者がプラグインを導入していないときだけ。**
 * 導入済みの版と同梱の版が両方読まれると、同じ名前の Skill が2つ現れる
 */
export function buildClaudeArgs(bundledPluginDir: string | null): string[] {
  if (bundledPluginDir === null || bundledPluginDir === '') return []
  return ['--plugin-dir', bundledPluginDir]
}
