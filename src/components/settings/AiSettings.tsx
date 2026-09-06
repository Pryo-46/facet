import type { SettingsPanelProps } from './types'

/** Skill の名前と、何をするものかの1行 */
export const SKILL_LABELS: readonly { name: string; label: string }[] = [
  { name: 'read-project', label: 'このフォルダのデータを読む' },
  { name: 'write-term', label: '用語を書く' },
  { name: 'write-error', label: 'エラーを書く' },
  { name: 'write-sequence', label: 'シーケンスを書く' },
  { name: 'write-issue-tree', label: '課題ツリーを書く' },
  { name: 'write-logic-tree', label: 'ロジックツリーを書く' },
]

const INSTALL_COMMANDS = [
  'claude plugin marketplace add Pryo-46/facet --sparse .claude-plugin plugins',
  'claude plugin install facet@facet',
]

/**
 * AI 連携の案内。**設定する項目は無い**——いまの状態と、導入の手順を見せる。
 *
 * 導入すると、facet を開かなくても同じフォルダを Claude Code で開くだけで
 * Skill が使える。未導入でも、アプリの端末では同梱版が使われる
 */
export function AiSettings({ pluginInstalled }: SettingsPanelProps) {
  return (
    <div className="flex flex-col gap-4 text-base text-ink">
      <p>
        {pluginInstalled
          ? 'facet のプラグインは導入済みです。アプリの端末も、外の Claude Code も、同じ Skill を使います。'
          : 'facet のプラグインは未導入です。アプリの端末では同梱の Skill が使えますが、外の Claude Code では使えません。'}
      </p>
      {!pluginInstalled && (
        <section className="flex flex-col gap-2">
          <h3 className="text-sm text-ink-muted">導入するには</h3>
          <p>次の2つを端末で実行してください。以後はどのフォルダでも Skill が使えます。</p>
          {INSTALL_COMMANDS.map((command) => (
            <code key={command} className="rounded-sm bg-surface-muted px-2 py-1 text-sm">
              {command}
            </code>
          ))}
        </section>
      )}
      <section className="flex flex-col gap-2">
        <h3 className="text-sm text-ink-muted">使える Skill</h3>
        <ul className="flex flex-col gap-1">
          {SKILL_LABELS.map(({ name, label }) => (
            <li key={name}>
              <code className="text-sm">facet:{name}</code> — {label}
            </li>
          ))}
        </ul>
      </section>
    </div>
  )
}
