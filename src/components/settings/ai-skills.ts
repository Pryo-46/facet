/** Skill の名前と、何をするものかの1行 */
export const SKILL_LABELS: readonly { name: string; label: string }[] = [
  { name: 'read-project', label: 'このフォルダのデータを読む' },
  { name: 'write-term', label: '用語を書く' },
  { name: 'write-error', label: 'エラーを書く' },
  { name: 'write-sequence', label: 'シーケンスを書く' },
  { name: 'write-issue-tree', label: '課題ツリーを書く' },
  { name: 'write-logic-tree', label: 'ロジックツリーを書く' },
]

export const INSTALL_COMMANDS = [
  'claude plugin marketplace add Pryo-46/facet --sparse .claude-plugin plugins',
  'claude plugin install facet@facet',
]
