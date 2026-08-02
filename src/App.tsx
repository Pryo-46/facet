import { useState } from 'react'
import { Button } from '@/components/ui/button'

/**
 * M0 の足場確認用の画面。アプリの機能はまだ何も無い。
 * ここで見たいのは2つだけ:
 *   - shadcn/ui の Button が描画されること
 *   - ライト/ダークの切り替えで役割トークンの色が入れ替わること
 * M1 で用語集の画面を作る時点で、この中身は丸ごと置き換わる。
 */
function App() {
  const [dark, setDark] = useState(false)

  const toggleTheme = () => {
    const next = !dark
    setDark(next)
    document.documentElement.classList.toggle('dark', next)
  }

  return (
    <main className="min-h-screen bg-canvas text-ink">
      <header className="border-b border-rule px-6 py-4">
        <h1 className="text-lg font-bold text-ink">facet</h1>
        <p className="text-sm text-ink-muted">M0: 足場のみ。機能は未実装。</p>
      </header>

      <section className="space-y-6 p-6">
        <div className="flex items-center gap-3">
          <Button onClick={toggleTheme}>
            {dark ? 'ライトに切り替え' : 'ダークに切り替え'}
          </Button>
          <span className="text-sm text-ink-muted">
            現在: {dark ? 'ダーク' : 'ライト'}
          </span>
        </div>

        <div className="flex flex-wrap gap-3">
          <span className="rounded-md bg-warning px-3 py-1.5 text-sm text-warning-fg">
            warning（未定義・削除）
          </span>
          <span className="rounded-md bg-ok px-3 py-1.5 text-sm text-ok-fg">
            ok（確定・結果）
          </span>
          <span className="rounded-md border border-rule bg-surface px-3 py-1.5 text-sm text-ink-muted">
            surface / rule / ink-muted
          </span>
        </div>
      </section>
    </main>
  )
}

export default App
