# ロジックツリー M2: Miro のマインドマップとのクリップボード交換 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** ロジックツリーと Miro のマインドマップを、クリップボード経由で双方向に交換できるようにする。あわせてロジックツリーの Markdown 出力（M1 からの宿題）を足す。

**Architecture:** Miro 形式の符号化・復号は `src/modules/logic-tree/miro.ts` の純関数に閉じる（Tauri も React も知らない）。クリップボードの読み書きは `src/fs/clipboard.ts` だけが Tauri を知り、HTML の読み取りだけ Rust の自前コマンドを1つ通す。額縁はモジュールが宣言した `clipboardExchanges` を見るだけで、ツールを名指ししない。

**Tech Stack:** TypeScript / React 19 / Vite / Vitest / Tauri 2 / Rust（`arboard` 3.6.1）

**Spec:** `docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md`

## Global Constraints

- **作業ディレクトリは worktree**: `C:\Dev\Projects\facet\.claude\worktrees\logic-tree-m2-miro-clipboard`。主チェックアウトで作業しない
- **`src/types/*.ts` は生成物**（`.gitignore` 済み）。`npm run gen:types` で作られる。`npm test` / `npm run build` は `pre` スクリプトで自動実行する
- **コアは Tauri を知らない**（rev 12章）。`src/core/` と `src/modules/` から `@tauri-apps/*` を import しない。IO は `AppIo` として注入する
- **額縁はツールを名指ししない**（rev 6章）。`App.tsx` に `'logicTree'` という文字列を書かない
- **Miro の色は10進の整数**。黒は `1710618`（`#1A1A1A`）
- **`data-meta` の囲み**: 開き `<--(miro-data-v1)`、閉じ `(/miro-data-v1)-->`。**閉じは復号では無視されるが符号化では必須**
- **符号化**: `JSON → UTF-8 → 各バイト +59 (mod 256) → base64`。復号は `-59`
- **出力の固定値**: `boardId = "ZmFjZXQtdHI="` / `initialId` は `3458764699000000001` からの連番 / `meta.widgetToken` は `1` からの連番。**実行のたびに変わる値を混ぜない**（原本照合が成立しなくなる）
- **文言の規約**: 空文言は Markdown 出力で `（未定義）`。`h1` は使わない（`title` が h2）
- **コミットメッセージは日本語の Conventional Commits**。末尾に `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`
- **既に済んでいること**: 設計文書（`acb1eb8`）と原本フィクスチャ `src/modules/logic-tree/miro.fixture.ts`（`9180319`）はコミット済み

---

## セットアップ（Task 1 の前に1回だけ）

```bash
cd C:/Dev/Projects/facet/.claude/worktrees/logic-tree-m2-miro-clipboard
npm install          # 数分かかる。省略しない
npm run gen:types    # src/types/*.ts を作る。これが無いと import が全部壊れる
npm test             # 緑を確認してから着手する
```

---

## ファイル構成

| ファイル | 責務 | Task |
| --- | --- | --- |
| `src/modules/logic-tree/miro-codec.ts` | CF_HTML と `data-meta` の**器**の読み書き。木を知らない | 1 |
| `src/modules/logic-tree/miro-import.ts` | Miro の JSON → ロジックツリー | 2 |
| `src/modules/logic-tree/miro-export.ts` | ロジックツリー → Miro の JSON | 3 |
| `src/modules/logic-tree/miro.ts` | 上3つを束ねて `ClipboardExchange` を作る | 4 |
| `src/modules/logic-tree/markdown.ts` | Markdown 出力（規約5） | 5 |
| `src/core/registry.ts` | `ClipboardExchange` 型と任意スロット | 4 |
| `src/modules/logic-tree/module.ts` | `outputs` と `clipboardExchanges` の宣言 | 4, 5 |
| `src-tauri/src/lib.rs` / `Cargo.toml` / `capabilities/default.json` | `read_clipboard_html` と HTML 書き込み権限 | 6 |
| `src/fs/clipboard.ts` | Tauri を知る唯一の層 | 6 |
| `src/components/ChoiceDialog.tsx` | `onCancel?` を任意で足す | 7 |
| `src/core/app-controller.ts` | 取り込み・書き出しの**順序** | 8 |
| `src/App.tsx` / `src/components/ExportMenu.tsx` | ボタンとフォーカス検知 | 9 |

**器（Task 1）と木（Task 2・3）を分ける**のは、器の不具合（閉じタグの欠落）が木のテストでは見えないため。境界を分けておけば、器のテストが器だけを見る。

---

## Task 1: Miro クリップボードの器（CF_HTML と data-meta）

**Files:**
- Create: `src/modules/logic-tree/miro-codec.ts`
- Create: `src/modules/logic-tree/miro-codec.test.ts`
- Use: `src/modules/logic-tree/miro.fixture.ts`（コミット済み）

**Interfaces:**
- Consumes: `MIRO_MINDMAP_CF_HTML_BASE64`, `MIRO_MINDMAP_CF_HTML_BYTES`（フィクスチャ）
- Produces:
  - `decodeMiroClipboard(html: string): unknown | null` — CF_HTML でも素の HTML でもよい。Miro のデータでなければ `null`
  - `encodeMiroClipboard(payload: unknown, texts: readonly string[]): string` — CF_HTML 文字列（ヘッダのオフセット込み）
  - `hasMiroMindmap(html: string): boolean` — 速い判定（`canImport` が使う）

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/miro-codec.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIRO_MINDMAP_CF_HTML_BASE64, MIRO_MINDMAP_CF_HTML_BYTES } from './miro.fixture'
import { decodeMiroClipboard, encodeMiroClipboard, hasMiroMindmap } from './miro-codec'

/** フィクスチャ（base64）を原本の文字列に戻す */
function originalCfHtml(): string {
  return Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8')
}

describe('hasMiroMindmap', () => {
  it('原本を Miro のデータと判定する', () => {
    expect(hasMiroMindmap(originalCfHtml())).toBe(true)
  })
  it('無関係な HTML は false', () => {
    expect(hasMiroMindmap('<p>ただの貼り付け</p>')).toBe(false)
  })
  it('空文字は false', () => {
    expect(hasMiroMindmap('')).toBe(false)
  })
})

describe('decodeMiroClipboard', () => {
  it('原本から Miro の JSON を取り出す', () => {
    const decoded = decodeMiroClipboard(originalCfHtml()) as {
      host: string
      data: { objects: unknown[] }
    }
    expect(decoded.host).toBe('miro.com')
    expect(decoded.data.objects).toHaveLength(11)
  })
  it('Miro のデータでなければ null', () => {
    expect(decodeMiroClipboard('<p>ただの貼り付け</p>')).toBe(null)
  })
  it('base64 が壊れていても例外を投げず null', () => {
    expect(decodeMiroClipboard('<span data-meta="<--(miro-data-v1)!!!!(/miro-data-v1)-->"></span>')).toBe(
      null,
    )
  })
})

describe('encodeMiroClipboard', () => {
  // **この計画で最も重要なテスト。**
  // 復号したものを再び符号化して原本のバイト列に戻ることを確かめる。
  // エクスポートの壊れ方はインポートのテストでも往復テストでも検出できない
  it('原本を復号して符号化し直すと、バイト列が原本に一致する', () => {
    const original = originalCfHtml()
    const payload = decodeMiroClipboard(original)
    // 原本の div は「見た目順（y 昇順）」で並んでいる
    const texts = ['孫ノード１', '子ノード１', '孫ノード２', '親ノード', '子ノード２', '子ノード３']
    const rebuilt = encodeMiroClipboard(payload, texts)
    expect(Buffer.byteLength(rebuilt, 'utf8')).toBe(MIRO_MINDMAP_CF_HTML_BYTES)
    expect(Buffer.from(rebuilt, 'utf8').equals(Buffer.from(original, 'utf8'))).toBe(true)
  })

  it('符号化したものは自分で復号できる', () => {
    const payload = { host: 'miro.com', data: { objects: [], meta: {} } }
    const html = encodeMiroClipboard(payload, ['あ'])
    expect(decodeMiroClipboard(html)).toEqual(payload)
  })

  it('閉じタグを必ず付ける', () => {
    const html = encodeMiroClipboard({ a: 1 }, ['x'])
    expect(html).toContain('(/miro-data-v1)-->')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-codec.test.ts
```

Expected: FAIL（`Failed to resolve import "./miro-codec"`）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/miro-codec.ts`:

```ts
/**
 * Miro のクリップボード形式の**器**（CF_HTML と data-meta）。木のことは知らない。
 *
 * 器と木を分けてあるのは、**器の不具合が木のテストでは見えない**ため。M2 の調査では
 * 閉じタグの欠落に3回の実機実験を費やした——復号は末尾の余分を黙って捨てるので通り、
 * 往復テストも通ってしまう。だから器のテストは**原本のバイト列と照合する**。
 *
 * 形式の詳細は docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md
 */

const OPEN = '<--(miro-data-v1)'
const CLOSE = '(/miro-data-v1)-->'
/** 各バイトに足すシフト量。Miro の難読化（暗号ではない） */
const SHIFT = 59

const CF_PRE = '<html>\r\n<body>\r\n<!--StartFragment-->'
const CF_POST = '<!--EndFragment-->\r\n</body>\r\n</html>'

/** data-meta の中身を取り出す。無ければ null */
function readMetaAttribute(html: string): string | null {
  const matched = /data-meta="([^"]*)"/.exec(html)
  if (matched === null) return null
  const value = matched[1]
  return value.startsWith(OPEN) ? value : null
}

export function hasMiroMindmap(html: string): boolean {
  return readMetaAttribute(html) !== null
}

export function decodeMiroClipboard(html: string): unknown | null {
  const meta = readMetaAttribute(html)
  if (meta === null) return null
  // 閉じタグは**あれば外す**。Miro は付けてくるが、無くても base64 は読める
  const body = meta.slice(OPEN.length).replace(CLOSE, '')
  try {
    const shifted = Uint8Array.from(atob(body), (c) => c.charCodeAt(0))
    const raw = shifted.map((b) => (b - SHIFT) & 0xff)
    const json = new TextDecoder().decode(raw)
    return JSON.parse(json)
  } catch {
    // 壊れたクリップボードは「Miro のデータではない」として扱う。例外は投げない
    return null
  }
}

/** ヘッダは桁数固定なので、値が変わっても長さは変わらない */
function cfHeader(startHtml: number, endHtml: number, startFrag: number, endFrag: number): string {
  const pad = (n: number) => String(n).padStart(10, '0')
  return (
    `Version:0.9\r\nStartHTML:${pad(startHtml)}\r\nEndHTML:${pad(endHtml)}\r\n` +
    `StartFragment:${pad(startFrag)}\r\nEndFragment:${pad(endFrag)}\r\n`
  )
}

/** UTF-8 のバイト数。**CF_HTML のオフセットは文字数ではなくバイト位置である** */
function byteLength(text: string): number {
  return new TextEncoder().encode(text).length
}

export function encodeMiroClipboard(payload: unknown, texts: readonly string[]): string {
  const json = JSON.stringify(payload)
  const raw = new TextEncoder().encode(json)
  const shifted = raw.map((b) => (b + SHIFT) & 0xff)
  let binary = ''
  for (const b of shifted) binary += String.fromCharCode(b)
  const meta = OPEN + btoa(binary) + CLOSE

  // div 側は表示用（構造は持たない）。区切りは \n であって \r\n ではない
  const fragment =
    `<span data-meta="${meta}"></span>` +
    texts.map((t) => `<div><div><div>${t}</div></div></div>`).join('\n')

  const headLen = byteLength(cfHeader(0, 0, 0, 0))
  const startHtml = headLen
  const startFrag = startHtml + byteLength(CF_PRE)
  const endFrag = startFrag + byteLength(fragment)
  const endHtml = endFrag + byteLength(CF_POST)
  return cfHeader(startHtml, endHtml, startFrag, endFrag) + CF_PRE + fragment + CF_POST
}
```

- [ ] **Step 4: 通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-codec.test.ts
```

Expected: PASS（10件）

**原本照合が落ちたら、そこで止まって原因を突き止めること。** 通し方を変えるのではなく、生成物と原本を先頭から比較して最初に食い違うバイト位置を出す。オフセットの計算・改行の種類・閉じタグのどれかが必ず原因である。

- [ ] **Step 5: コミット**

```bash
git add src/modules/logic-tree/miro-codec.ts src/modules/logic-tree/miro-codec.test.ts
git commit -m "$(cat <<'EOF'
feat(logic-tree): Miro クリップボードの器（CF_HTML と data-meta）を読み書きする

符号化は JSON → UTF-8 → 各バイト +59 → base64。閉じタグ (/miro-data-v1)--> は
復号では無視されるが符号化では必須で、落とすと Miro がテキストとして貼る。

原本 9,768 バイトとのバイト照合をテストに置いた。エクスポートの壊れ方は
インポートのテストでも往復テストでも検出できないため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 2: Miro の JSON → ロジックツリー（取り込み）

**Files:**
- Create: `src/modules/logic-tree/miro-import.ts`
- Create: `src/modules/logic-tree/miro-import.test.ts`

**Interfaces:**
- Consumes: `decodeMiroClipboard`（Task 1）、`newId`（`@/core/new-id`）、`LogicTreeSchemaVersion1` / `TreeNode`（`@/types/logic-tree`）、`orderNodes`（`./commands`）
- Produces:
  - `type MiroImportResult = { ok: true; nodes: TreeNode[] } | { ok: false; reason: string }`
  - `miroPayloadToNodes(payload: unknown): MiroImportResult`
  - `stripMiroText(html: string): string`（文言の変換。テストから直接呼ぶ）

- [ ] **Step 1: 文言変換の失敗するテストを書く**

`src/modules/logic-tree/miro-import.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { MIRO_MINDMAP_CF_HTML_BASE64 } from './miro.fixture'
import { decodeMiroClipboard } from './miro-codec'
import { miroPayloadToNodes, stripMiroText } from './miro-import'

function originalPayload(): unknown {
  return decodeMiroClipboard(Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8'))
}

describe('stripMiroText', () => {
  it('p タグを剥がす', () => {
    expect(stripMiroText('<p>親ノード</p>')).toBe('親ノード')
  })
  it('段落が複数なら改行で繋ぐ', () => {
    expect(stripMiroText('<p>1行目</p><p>2行目</p>')).toBe('1行目\n2行目')
  })
  it('br も改行にする', () => {
    expect(stripMiroText('<p>上<br>下</p>')).toBe('上\n下')
    expect(stripMiroText('<p>上<br />下</p>')).toBe('上\n下')
  })
  it('装飾は捨てて中身だけ残す', () => {
    expect(stripMiroText('<p><b>太字</b>と<span style="color:red">色</span></p>')).toBe('太字と色')
  })
  it('エンティティを実体に戻す', () => {
    expect(stripMiroText('<p>A&amp;B &lt;C&gt; &quot;D&quot; &#39;E&#39; &nbsp;F</p>')).toBe(
      'A&B <C> "D" \'E\'  F',
    )
  })
  it('空の段落は空文字', () => {
    expect(stripMiroText('<p></p>')).toBe('')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-import.test.ts
```

Expected: FAIL（`Failed to resolve import "./miro-import"`）

- [ ] **Step 3: 文言変換だけ実装する**

`src/modules/logic-tree/miro-import.ts`（この時点では `stripMiroText` だけ）:

```ts
import { newId } from '@/core/new-id'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'

/**
 * Miro の JSON をロジックツリーへ。**この層は器を知らない**（復号済みの値を受ける）。
 *
 * 詳細は docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md
 */

const ENTITIES: ReadonlyMap<string, string> = new Map([
  ['&amp;', '&'],
  ['&lt;', '<'],
  ['&gt;', '>'],
  ['&quot;', '"'],
  ['&#39;', "'"],
  ['&apos;', "'"],
  ['&nbsp;', ' '],
])

/**
 * Miro のノード文言（HTML）を、ロジックツリーの text（プレーンテキスト）へ。
 *
 * **装飾は捨てる。** ロジックツリーは見た目を持たない設計で（スキーマ:「位置・幅・
 * 折りたたみ状態は持たない」）、text に置き場所がない。中途半端に持つと Markdown
 * 出力まで壊れる。**代償として、Miro で装飾した語は往復すると素の文字列に戻る。**
 */
export function stripMiroText(html: string): string {
  return html
    // 段落の切れ目と br を先に改行へ。**タグを消す前にやること**
    .replace(/<\/p>\s*<p[^>]*>/gi, '\n')
    .replace(/<br\s*\/?>/gi, '\n')
    // 残りのタグを落とす（装飾はここで消える）
    .replace(/<[^>]*>/g, '')
    // エンティティを実体へ。**&amp; を最後に回さないと二重復号になる**ので一括で置換する
    .replace(/&(?:amp|lt|gt|quot|#39|apos|nbsp);/g, (m) => ENTITIES.get(m) ?? m)
}
```

- [ ] **Step 4: 文言変換のテストが通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-import.test.ts
```

Expected: PASS（6件）

- [ ] **Step 5: 木の復元の失敗するテストを足す**

`src/modules/logic-tree/miro-import.test.ts` に追記:

```ts
/** テスト用の Miro オブジェクトを組む最小のヘルパ */
function node(text: string, y: number) {
  return {
    widgetData: {
      json: { _position: { offsetPx: { x: 0, y } }, size: { width: 90, height: 34 }, text: `<p>${text}</p>` },
      type: 'text',
    },
    'ns:mindmap': { theme: 'colorBranch' },
  }
}
function line(from: number, to: number) {
  return {
    widgetData: {
      json: { primary: { widgetIndex: from }, secondary: { widgetIndex: to } },
      type: 'line',
    },
    'ns:mindmap': { mindmap: true },
  }
}
const payloadOf = (objects: unknown[]) => ({ data: { objects, meta: {} } })

describe('miroPayloadToNodes', () => {
  it('原本から木を復元する（親1・子3・孫2）', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error(`取り込めるはず: ${result.reason}`)
    const byText = new Map(result.nodes.map((n) => [n.text, n]))
    expect(result.nodes).toHaveLength(6)

    const root = byText.get('親ノード')
    if (root === undefined) throw new Error('親ノードが無い')
    expect(root.parentId).toBe(null)

    for (const text of ['子ノード１', '子ノード２', '子ノード３']) {
      expect(byText.get(text)?.parentId).toBe(root.id)
    }
    const child1 = byText.get('子ノード１')
    for (const text of ['孫ノード１', '孫ノード２']) {
      expect(byText.get(text)?.parentId).toBe(child1?.id)
    }
  })

  it('配列は DFS 行きがけ順、兄弟は y 座標の昇順で並ぶ', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error('取り込めるはず')
    // 原本の objects の並びは 親,子1,孫1,子2,子3,孫2（＝ボードで作った順）。
    // **それに引きずられず**、y 昇順の兄弟順で DFS した並びになること
    expect(result.nodes.map((n) => n.text)).toEqual([
      '親ノード',
      '子ノード１',
      '孫ノード１',
      '孫ノード２',
      '子ノード２',
      '子ノード３',
    ])
  })

  it('兄弟順はエッジの出現順ではなく y 座標で決まる', () => {
    // エッジは 下→上 の順に置き、y は 上→下。**y が勝つこと**を見る
    const objects = [
      node('親', 0), // 0
      node('下の子', 100), // 1
      node('上の子', -100), // 2
      line(0, 1),
      line(0, 2),
    ]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず')
    expect(result.nodes.map((n) => n.text)).toEqual(['親', '上の子', '下の子'])
  })

  it('ID は node_ 接頭の新規採番で、Miro の initialId を持ち込まない', () => {
    const result = miroPayloadToNodes(originalPayload())
    if (!result.ok) throw new Error('取り込めるはず')
    for (const n of result.nodes) expect(n.id).toMatch(/^node_[A-Za-z0-9]{10}$/)
    expect(new Set(result.nodes.map((n) => n.id)).size).toBe(result.nodes.length)
  })

  it('ns:mindmap を持たないオブジェクトは黙って捨てる', () => {
    const sticky = { widgetData: { json: { text: '<p>付箋</p>' }, type: 'text' } }
    const objects = [node('親', 0), node('子', 10), line(0, 1), sticky]
    const result = miroPayloadToNodes(payloadOf(objects))
    if (!result.ok) throw new Error('取り込めるはず')
    expect(result.nodes.map((n) => n.text)).toEqual(['親', '子'])
  })

  it('ルートが2つ以上なら本数を添えて断る', () => {
    const objects = [node('木A', 0), node('木B', 10), node('木C', 20)]
    const result = miroPayloadToNodes(payloadOf(objects))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('3')
    expect(result.reason).toContain('マインドマップ1つ分')
  })

  it('ノードが0個なら断る', () => {
    expect(miroPayloadToNodes(payloadOf([])).ok).toBe(false)
    const onlySticky = [{ widgetData: { json: { text: '<p>付箋</p>' }, type: 'text' } }]
    const result = miroPayloadToNodes(payloadOf(onlySticky))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('マインドマップが見つかりません')
  })

  it('循環していたら断る', () => {
    // 2つのノードが互いを親にする（ルートが1つも無い）
    const objects = [node('A', 0), node('B', 10), line(0, 1), line(1, 0)]
    const result = miroPayloadToNodes(payloadOf(objects))
    expect(result.ok).toBe(false)
    if (result.ok) throw new Error('断るはず')
    expect(result.reason).toContain('木の形になっていません')
  })

  it('Miro のデータの形をしていなければ断る', () => {
    expect(miroPayloadToNodes(null).ok).toBe(false)
    expect(miroPayloadToNodes({}).ok).toBe(false)
    expect(miroPayloadToNodes({ data: { objects: 'ちがう' } }).ok).toBe(false)
  })
})
```

- [ ] **Step 6: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-import.test.ts
```

Expected: FAIL（`miroPayloadToNodes is not a function`）

- [ ] **Step 7: 木の復元を実装する**

`src/modules/logic-tree/miro-import.ts` に追記:

```ts
export type MiroImportResult =
  | { ok: true; nodes: TreeNode[] }
  | { ok: false; reason: string }

/** Miro のオブジェクト1件から、必要な値だけ取り出した形 */
interface MiroNode {
  index: number
  text: string
  y: number
}

const NO_MINDMAP = 'マインドマップが見つかりません。Miro でマインドマップを選んでコピーしてください。'
const NOT_A_TREE = '木の形になっていません（ノードが輪になっています）。'
const NOT_MIRO = 'Miro のデータとして読めませんでした。'

function objectsOf(payload: unknown): unknown[] | null {
  if (typeof payload !== 'object' || payload === null) return null
  const data = (payload as { data?: unknown }).data
  if (typeof data !== 'object' || data === null) return null
  const objects = (data as { objects?: unknown }).objects
  return Array.isArray(objects) ? objects : null
}

/** ns:mindmap を持つものだけが対象。付箋・図形の混入はここで落ちる */
function isMindmapObject(o: unknown): o is Record<string, unknown> {
  return typeof o === 'object' && o !== null && 'ns:mindmap' in o
}

function widgetJson(o: Record<string, unknown>): Record<string, unknown> | null {
  const wd = o.widgetData
  if (typeof wd !== 'object' || wd === null) return null
  const json = (wd as { json?: unknown }).json
  return typeof json === 'object' && json !== null ? (json as Record<string, unknown>) : null
}

function widgetType(o: Record<string, unknown>): string | null {
  const wd = o.widgetData
  if (typeof wd !== 'object' || wd === null) return null
  const t = (wd as { type?: unknown }).type
  return typeof t === 'string' ? t : null
}

export function miroPayloadToNodes(payload: unknown): MiroImportResult {
  const objects = objectsOf(payload)
  if (objects === null) return { ok: false, reason: NOT_MIRO }

  // 1. ns:mindmap を持つものだけに絞り、ノードとエッジに分ける。
  //    **index は絞る前の配列位置**（widgetIndex がそれを指すため）
  const nodes = new Map<number, MiroNode>()
  const edges: { from: number; to: number }[] = []
  objects.forEach((o, index) => {
    if (!isMindmapObject(o)) return
    const json = widgetJson(o)
    if (json === null) return
    if (widgetType(o) === 'text') {
      const text = typeof json.text === 'string' ? stripMiroText(json.text) : ''
      const pos = json._position as { offsetPx?: { y?: unknown } } | null | undefined
      const y = typeof pos?.offsetPx?.y === 'number' ? pos.offsetPx.y : 0
      nodes.set(index, { index, text, y })
    } else if (widgetType(o) === 'line') {
      const from = (json.primary as { widgetIndex?: unknown } | undefined)?.widgetIndex
      const to = (json.secondary as { widgetIndex?: unknown } | undefined)?.widgetIndex
      if (typeof from === 'number' && typeof to === 'number') edges.push({ from, to })
    }
  })
  if (nodes.size === 0) return { ok: false, reason: NO_MINDMAP }

  // 2. エッジから親子を作る。参照先が捨てられたオブジェクトを指すエッジは無視する
  const parentOf = new Map<number, number>()
  const childrenOf = new Map<number, number[]>()
  for (const { from, to } of edges) {
    if (!nodes.has(from) || !nodes.has(to) || from === to) continue
    // 同じ子に複数の親が来たら最初の1本を採る（Miro の木では起きないが、全域にしておく）
    if (parentOf.has(to)) continue
    parentOf.set(to, from)
    const siblings = childrenOf.get(from) ?? []
    siblings.push(to)
    childrenOf.set(from, siblings)
  }

  // 3. ルートは親を持たないノード。1つでなければ断る
  const roots = [...nodes.keys()].filter((i) => !parentOf.has(i))
  if (roots.length === 0) return { ok: false, reason: NOT_A_TREE }
  if (roots.length > 1) {
    return {
      ok: false,
      reason: `マインドマップ1つ分を選んでコピーしてください（木が ${roots.length} 本あります）。`,
    }
  }

  // 4. ルートから DFS。兄弟は y 座標の昇順（Miro 自身が見た目の順をこれで決めている）。
  //    **到達できなかったノードがあれば循環している**（buildTree と同じ考え方）
  const out: TreeNode[] = []
  const idOf = new Map<number, string>()
  const visited = new Set<number>()
  const walk = (index: number, parentId: string | null): void => {
    if (visited.has(index)) return
    visited.add(index)
    const id = newId('node')
    idOf.set(index, id)
    const self = nodes.get(index)
    out.push({ id, parentId, text: self === undefined ? '' : self.text })
    const kids = (childrenOf.get(index) ?? []).slice().sort((a, b) => {
      const ya = nodes.get(a)?.y ?? 0
      const yb = nodes.get(b)?.y ?? 0
      return ya - yb
    })
    for (const kid of kids) walk(kid, id)
  }
  walk(roots[0], null)

  if (visited.size !== nodes.size) return { ok: false, reason: NOT_A_TREE }
  return { ok: true, nodes: out }
}
```

- [ ] **Step 8: 通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-import.test.ts
```

Expected: PASS（15件）

- [ ] **Step 9: コミット**

```bash
git add src/modules/logic-tree/miro-import.ts src/modules/logic-tree/miro-import.test.ts
git commit -m "$(cat <<'EOF'
feat(logic-tree): Miro の JSON からロジックツリーの木を復元する

木はエッジ（primary→secondary の widgetIndex）から復元し、配列順は使わない
（原本の objects はボードで作った順で、木とも見た目とも一致しない）。
兄弟順は _position.offsetPx.y の昇順——Miro 自身が見た目の順をこれで決めており、
原本のプレーンテキストの並びが y 昇順と完全に一致することを確認済み。

ID は新規採番する。Miro の initialId はコピーのたびに変わるので同一性の
根拠にできず、node_ の ID 規約にも合わない。

森・循環・0個は理由を添えて断る。装飾は捨てる（text に置き場所がない）。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 3: ロジックツリー → Miro の JSON（書き出し）

**Files:**
- Create: `src/modules/logic-tree/miro-export.ts`
- Create: `src/modules/logic-tree/miro-export.test.ts`

**Interfaces:**
- Consumes: `LogicTreeSchemaVersion1` / `TreeNode`、`buildTree`（`@/core/canvas/flat-tree`）
- Produces:
  - `nodesToMiroPayload(data: LogicTreeSchemaVersion1): { payload: unknown; texts: string[] }`

**設計値（spec 4.1 より。変えないこと）:**

```
INK = 1710618 (#1A1A1A) / NODE_HEIGHT = 40 / COLUMN_GAP = 60 / ROW_GAP = 16
幅 = 全角16px + 半角9px + 余白28px、最小 72、**列内の最大へ揃える**
st = 28（角あり枠）/ bc = -1 / bo = 0 / bro = 1 / brw = 2 / brs = 2 / ta = "c"
autoLayout = true（座標も出す）/ boardId = "ZmFjZXQtdHI="
initialId = 3458764699000000001 からの連番 / widgetToken = 1 からの連番
```

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/miro-export.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { nodesToMiroPayload } from './miro-export'

/**  親 ─┬─ 枝A ─┬─ 枝Aの子1
 *       │       └─ 枝Aの子2
 *       └─ ずいぶん長い文言のノード                */
const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: 'テスト',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '枝A' },
    { id: 'node_cccccccccc', parentId: 'node_bbbbbbbbbb', text: '枝Aの子1' },
    { id: 'node_dddddddddd', parentId: 'node_bbbbbbbbbb', text: '枝Aの子2' },
    { id: 'node_eeeeeeeeee', parentId: 'node_aaaaaaaaaa', text: 'ずいぶん長い文言のノード' },
  ],
}

/** payload から text ウィジェットだけ取り出す */
function textWidgets(payload: unknown) {
  const objects = (payload as { data: { objects: Record<string, never>[] } }).data.objects
  return objects.filter((o: never) => (o as { widgetData: { type: string } }).widgetData.type === 'text')
}
function lineWidgets(payload: unknown) {
  const objects = (payload as { data: { objects: Record<string, never>[] } }).data.objects
  return objects.filter((o: never) => (o as { widgetData: { type: string } }).widgetData.type === 'line')
}

describe('nodesToMiroPayload', () => {
  it('ノードとエッジの本数が合う（N ノードなら N-1 エッジ）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    expect(textWidgets(payload)).toHaveLength(5)
    expect(lineWidgets(payload)).toHaveLength(4)
  })

  it('エッジは親→子を指す', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as { widgetData: { json: { text: string } } }[]
    const labelAt = (i: number) => texts[i].widgetData.json.text
    const lines = lineWidgets(payload) as unknown as {
      widgetData: { json: { primary: { widgetIndex: number }; secondary: { widgetIndex: number } } }
    }[]
    const pairs = lines.map((l) => [
      labelAt(l.widgetData.json.primary.widgetIndex),
      labelAt(l.widgetData.json.secondary.widgetIndex),
    ])
    expect(pairs).toContainEqual(['<p>親</p>', '<p>枝A</p>'])
    expect(pairs).toContainEqual(['<p>枝A</p>', '<p>枝Aの子1</p>'])
    expect(pairs).toContainEqual(['<p>枝A</p>', '<p>枝Aの子2</p>'])
    expect(pairs).toContainEqual(['<p>親</p>', '<p>ずいぶん長い文言のノード</p>'])
  })

  it('同じ深さのノードは幅が揃う（列内の最大に合わせる）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as {
      widgetData: { json: { text: string; size: { width: number } } }
    }[]
    const widthOf = (label: string) =>
      texts.find((t) => t.widgetData.json.text === `<p>${label}</p>`)?.widgetData.json.size.width
    // 深さ1 は「枝A」と「ずいぶん長い文言のノード」。長い方に揃う
    expect(widthOf('枝A')).toBe(widthOf('ずいぶん長い文言のノード'))
    // 深さ2 は別の列なので、深さ1 とは違ってよい
    expect(widthOf('枝Aの子1')).toBe(widthOf('枝Aの子2'))
  })

  it('兄弟は y 座標が上から順に並び、親は子の中央に来る', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const texts = textWidgets(payload) as unknown as {
      widgetData: { json: { text: string; _position: { offsetPx: { x: number; y: number } } } }
    }[]
    const at = (label: string) =>
      texts.find((t) => t.widgetData.json.text === `<p>${label}</p>`)!.widgetData.json._position.offsetPx
    expect(at('枝Aの子1').y).toBeLessThan(at('枝Aの子2').y)
    expect(at('枝A').y).toBeLessThan(at('ずいぶん長い文言のノード').y)
    // 親は枝Aと長い文言の間
    expect(at('親').y).toBeGreaterThan(at('枝A').y)
    expect(at('親').y).toBeLessThan(at('ずいぶん長い文言のノード').y)
    // 深さが進むと x が増える
    expect(at('親').x).toBeLessThan(at('枝A').x)
    expect(at('枝A').x).toBeLessThan(at('枝Aの子1').x)
  })

  it('見た目の値が仕様どおり（角あり枠・黒・中央寄せ・autoLayout true）', () => {
    const { payload } = nodesToMiroPayload(TREE)
    const first = textWidgets(payload)[0] as unknown as {
      widgetData: { json: { style: string } }
      'ns:mindmap': { autoLayout: boolean }
    }
    const style = JSON.parse(first.widgetData.json.style)
    expect(style.st).toBe(28)
    expect(style.brc).toBe(1710618)
    expect(style.tc).toBe(1710618)
    expect(style.bro).toBe(1)
    expect(style.bc).toBe(-1)
    expect(style.ta).toBe('c')
    expect(first['ns:mindmap'].autoLayout).toBe(true)

    const line = lineWidgets(payload)[0] as unknown as { widgetData: { json: { style: string } } }
    expect(JSON.parse(line.widgetData.json.style).lc).toBe(1710618)
  })

  it('毎回同じ結果になる（固定値だけを使い、乱数も時刻も混ぜない）', () => {
    const a = JSON.stringify(nodesToMiroPayload(TREE).payload)
    const b = JSON.stringify(nodesToMiroPayload(TREE).payload)
    expect(a).toBe(b)
  })

  it('texts は Miro に渡す表示用の並び（DFS 行きがけ順）', () => {
    const { texts } = nodesToMiroPayload(TREE)
    expect(texts).toEqual(['親', '枝A', '枝Aの子1', '枝Aの子2', 'ずいぶん長い文言のノード'])
  })

  it('空文言のノードも落とさずに出す', () => {
    const withEmpty: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [
        { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
        { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '' },
      ],
    }
    expect(textWidgets(nodesToMiroPayload(withEmpty).payload)).toHaveLength(2)
  })

  it('HTML として危険な文字をエスケープする', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'A & B <script>' }],
    }
    const { payload, texts } = nodesToMiroPayload(risky)
    const first = textWidgets(payload)[0] as unknown as { widgetData: { json: { text: string } } }
    expect(first.widgetData.json.text).toBe('<p>A &amp; B &lt;script&gt;</p>')
    // div 側（表示用）も同じくエスケープされていること
    expect(texts[0]).toBe('A &amp; B &lt;script&gt;')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-export.test.ts
```

Expected: FAIL（`Failed to resolve import "./miro-export"`）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/miro-export.ts`:

```ts
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import type { LogicTreeSchemaVersion1, TreeNode } from '@/types/logic-tree'

/**
 * ロジックツリー → Miro の JSON。**この層は器を知らない**（値を組むだけ）。
 *
 * 決定と根拠は docs/superpowers/plans/2026-08-29-logic-tree-m2-miro-clipboard-design.md の
 * 4章。要点だけ:
 *
 * - **autoLayout: true かつ座標も出す。** 座標が無いと兄弟の順序が壊れ（Miro が勝手に
 *   並べる）、autoLayout が false だと見た目が硬くなる。両方要る
 * - **幅は列内の最大へ揃える。** 揃えないと骨格が読めない（tree-layout.ts が列の x を
 *   最大幅で決めているのと同じ考え方）
 * - **幅は概算であり、広めに倒す。** 狭いと Miro 側で折り返して見た目が崩れる。
 *   フォントの実測手段が無いので、折り返しが出たら係数を上げるのが対処
 * - **固定値だけを使う**（乱数も時刻も混ぜない）。原本照合のテストが成立しなくなる
 */

/** Miro の標準の黒 (#1A1A1A)。枠・線・文字すべてこれ */
const INK = 1710618
const NODE_HEIGHT = 40
const COLUMN_GAP = 60
const ROW_GAP = 16
/** 全角 / 半角 1文字あたりの概算幅と、左右の余白 */
const EM_WIDTH = 16
const EN_WIDTH = 9
const PADDING_X = 28
const MIN_WIDTH = 72

const BOARD_ID = 'ZmFjZXQtdHI='
const INITIAL_ID_BASE = 3458764699000000000n

const NODE_STYLE = JSON.stringify({
  st: 28, bc: -1, bo: 0, bsc: 0, ta: 'c', tc: INK, tsc: 1, ffn: 'Noto Sans',
  b: 0, u: 0, i: 0, s: 0, fw: 0, brc: INK, bro: 1, brw: 2, brs: 2, hl: 0,
})
const LINE_STYLE = JSON.stringify({
  lc: INK, ls: 2, t: 2, lt: 3, a_start: 0, a_end: 0, VER: 2, jump: 0,
})

/** 半角と見なす範囲（ASCII と半角カナ） */
const HALF_WIDTH = /[ -~｡-ﾟ]/

function estimateWidth(text: string): number {
  let w = 0
  for (const ch of text) w += HALF_WIDTH.test(ch) ? EN_WIDTH : EM_WIDTH
  return Math.max(MIN_WIDTH, w + PADDING_X)
}

/** Miro のノード文言は HTML なので、地の文をエスケープしてから <p> で包む */
function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}

export function nodesToMiroPayload(
  data: LogicTreeSchemaVersion1,
): { payload: unknown; texts: string[] } {
  const built = buildTree(data.nodes)

  // 1. DFS 行きがけ順で並べる。**この順が objects の index になる**（widgetIndex が指す先）
  const ordered: { node: TreeNode; depth: number; parentIndex: number | null }[] = []
  const indexByKey = new Map<string, number>()
  const walk = (flat: FlatTreeNode, depth: number, parentIndex: number | null): void => {
    const index = ordered.length
    indexByKey.set(flat.key, index)
    ordered.push({ node: data.nodes[flat.index], depth, parentIndex })
    for (const child of flat.children) walk(child, depth + 1, index)
  }
  for (const root of built.roots) walk(root, 0, null)

  // 2. 列ごとの幅（列内の最大に揃える）と、列の x
  const colWidth: number[] = []
  for (const { node, depth } of ordered) {
    colWidth[depth] = Math.max(colWidth[depth] ?? 0, estimateWidth(node.text))
  }
  const colX: number[] = []
  let acc = 0
  for (let d = 0; d < colWidth.length; d++) {
    colX[d] = acc
    acc += colWidth[d] + COLUMN_GAP
  }

  // 3. y は「葉を上から積み、親は子の中央」。ordered は行きがけ順なので、
  //    子の y を先に確定させるために**後ろから走る**
  const childIndices = new Map<number, number[]>()
  ordered.forEach((entry, index) => {
    if (entry.parentIndex === null) return
    const siblings = childIndices.get(entry.parentIndex) ?? []
    siblings.push(index)
    childIndices.set(entry.parentIndex, siblings)
  })
  const y: number[] = new Array(ordered.length).fill(0)
  // 葉を上から順に積む。**行きがけ順に前から走ると、葉は画面の上から下の順に現れる**
  let cursor = 0
  for (let i = 0; i < ordered.length; i++) {
    const kids = childIndices.get(i)
    if (kids === undefined || kids.length === 0) {
      y[i] = cursor
      cursor += NODE_HEIGHT + ROW_GAP
    }
  }
  // 親は子の中央。**後ろから走る**ことで、自分を計算する時点で子が確定している
  //（行きがけ順なので、子は必ず親より後ろにいる）
  for (let i = ordered.length - 1; i >= 0; i--) {
    const kids = childIndices.get(i)
    if (kids === undefined || kids.length === 0) continue
    y[i] = Math.round((y[kids[0]] + y[kids[kids.length - 1]]) / 2)
  }

  // 4. Miro のオブジェクトへ。**ノードを全部並べてからエッジを足す**
  //    （widgetIndex が指すのは objects の位置なので、ノードの index を先に確定させる）
  const objects: unknown[] = []
  const initialIdOf = (i: number) => String(INITIAL_ID_BASE + BigInt(i) + 1n)
  ordered.forEach((entry, index) => {
    objects.push({
      widgetData: {
        json: {
          _position: { offsetPx: { x: colX[entry.depth], y: y[index] }, schema: 'canvasOffsetPx' },
          scale: { scale: 1 },
          relativeScale: 1,
          rotation: { rotation: 0 },
          relativeRotation: 0,
          size: { width: colWidth[entry.depth], height: NODE_HEIGHT },
          _parent: null,
          text: `<p>${escapeHtml(entry.node.text)}</p>`,
          style: NODE_STYLE,
        },
        type: 'text',
      },
      type: 14,
      'ns:mindmap': {
        theme: 'colorBranch',
        layout: 'butterfly',
        autoLayout: true,
        collapsibleBranch: { isBranchCollapsed: false, isNodeHidden: false },
      },
      id: index,
      initialId: initialIdOf(index),
      meta: { boardId: BOARD_ID, widgetToken: index + 1 },
    })
  })
  ordered.forEach((entry, index) => {
    if (entry.parentIndex === null) return
    const id = objects.length
    objects.push({
      widgetData: {
        json: {
          points: [],
          primary: { point: { x: 1, y: 0.5 }, positionType: 0, widgetIndex: entry.parentIndex },
          secondary: { point: { x: 0, y: 0.5 }, positionType: 0, widgetIndex: index },
          _position: null,
          _parent: null,
          style: LINE_STYLE,
          line: { captions: [] },
        },
        type: 'line',
      },
      type: 14,
      'ns:mindmap': { mindmap: true },
      id,
      initialId: initialIdOf(id),
      meta: { boardId: BOARD_ID, widgetToken: id + 1 },
    })
  })

  return {
    payload: {
      isProtected: false,
      boardId: BOARD_ID,
      data: { objects, meta: {} },
      version: 2,
      host: 'miro.com',
      asPortalAmount: 0,
      copierType: 'COPY',
    },
    // div 側は表示用。Miro の原本もエスケープ済みの文言を並べている
    texts: ordered.map((e) => escapeHtml(e.node.text)),
  }
}
```

- [ ] **Step 4: 通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro-export.test.ts
```

Expected: PASS（9件）

- [ ] **Step 5: コミット**

```bash
git add src/modules/logic-tree/miro-export.ts src/modules/logic-tree/miro-export.test.ts
git commit -m "$(cat <<'EOF'
feat(logic-tree): ロジックツリーを Miro のマインドマップの JSON にする

autoLayout: true かつ座標も出す。座標が無いと兄弟の順序が壊れ（Miro が勝手に
並べる）、autoLayout が false だと見た目が硬くなる——実機で両方確認した。

幅は文字数からの概算（全角16 / 半角9 / 余白28）を列内の最大へ揃える。
揃えないと木の骨格が読めない。概算は広めに倒す（狭いと Miro が折り返す）。

固定値だけを使い、乱数も時刻も混ぜない。原本とのバイト照合が成立しなくなるため。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 4: モジュール規約に `clipboardExchanges` を足す

**Files:**
- Modify: `src/core/registry.ts`
- Create: `src/modules/logic-tree/miro.ts`
- Create: `src/modules/logic-tree/miro.test.ts`
- Modify: `src/modules/logic-tree/module.ts`
- Modify: `src/modules/logic-tree/module.test.ts`

**Interfaces:**
- Consumes: Task 1〜3 の全部
- Produces:
  - `ClipboardExchange<TData>`（`@/core/registry`）
  - `ToolModule.clipboardExchanges?: readonly ClipboardExchange<TData>[]`
  - `miroMindmapExchange: ClipboardExchange<LogicTreeSchemaVersion1>`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/miro.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { MIRO_MINDMAP_CF_HTML_BASE64 } from './miro.fixture'
import { miroMindmapExchange } from './miro'

const originalCfHtml = () =>
  Buffer.from(MIRO_MINDMAP_CF_HTML_BASE64, 'base64').toString('utf8')

const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '往復テスト',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '親' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '子1' },
    { id: 'node_cccccccccc', parentId: 'node_aaaaaaaaaa', text: '子2' },
    { id: 'node_dddddddddd', parentId: 'node_bbbbbbbbbb', text: '孫' },
  ],
}

describe('miroMindmapExchange', () => {
  it('id と label を持つ', () => {
    expect(miroMindmapExchange.id).toBe('miro-mindmap')
    expect(miroMindmapExchange.label).toBe('Miro のマインドマップ')
  })

  it('canImport は原本を受け入れ、無関係な HTML を弾く', () => {
    expect(miroMindmapExchange.canImport(originalCfHtml())).toBe(true)
    expect(miroMindmapExchange.canImport('<p>ただの貼り付け</p>')).toBe(false)
    expect(miroMindmapExchange.canImport('')).toBe(false)
  })

  it('fromClipboard は title を持つロジックツリーを返す', () => {
    const result = miroMindmapExchange.fromClipboard(originalCfHtml(), 'ロジックツリー2')
    if (!result.ok) throw new Error(`取り込めるはず: ${result.reason}`)
    expect(result.data.schemaVersion).toBe(1)
    expect(result.data.type).toBe('logicTree')
    expect(result.data.title).toBe('ロジックツリー2')
    expect(result.data.nodes).toHaveLength(6)
  })

  it('fromClipboard は Miro のデータでなければ理由を返す', () => {
    const result = miroMindmapExchange.fromClipboard('<p>ちがう</p>', 'x')
    expect(result.ok).toBe(false)
  })

  it('往復しても木の形と文言が保たれる', () => {
    const { html } = miroMindmapExchange.toClipboard(TREE)
    const back = miroMindmapExchange.fromClipboard(html, '往復テスト')
    if (!back.ok) throw new Error('往復できるはず')

    // ID は採番し直されるので、**形と文言で比べる**
    const shape = (data: LogicTreeSchemaVersion1) => {
      const byId = new Map(data.nodes.map((n) => [n.id, n]))
      return data.nodes.map((n) => ({
        text: n.text,
        parent: n.parentId === null ? null : (byId.get(n.parentId)?.text ?? '?'),
      }))
    }
    expect(shape(back.data)).toEqual(shape(TREE))
  })

  it('toClipboard は html と text の両方を返す', () => {
    const { html, text } = miroMindmapExchange.toClipboard(TREE)
    expect(html).toContain('data-meta=')
    // text は他アプリに貼るためのもの。DFS 行きがけ順の文言を改行で連ねる
    expect(text).toBe('親\n子1\n孫\n子2')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/miro.test.ts
```

Expected: FAIL（`Failed to resolve import "./miro"`）

- [ ] **Step 3: `ClipboardExchange` を規約に足す**

`src/core/registry.ts` の `OutputProfile` の下に追記:

```ts
/**
 * 規約7（任意）: 外部ツールとのクリップボード交換（logic-tree M2）。
 *
 * **規約5（`OutputProfile`）に乗せない理由**: あちらは「Markdown を返す純関数」と
 * `.md` 書き出しを前提にしている。Miro 交換は出力が HTML とプレーンテキストの2つで、
 * `.md` 書き出しに意味がなく、そもそも**入力の口が規約に無い**。押し込むと
 * `toMarkdown` という名前が嘘になる。
 *
 * **宣言しないツールの規約の点数は増えない**（`describeIssueEffect` と同じ層の任意拡張）。
 */
export interface ClipboardExchange<TData> {
  /** 安定識別子。UI の状態とテストが参照する */
  id: string
  /** ボタンの説明に使う名前（例: Miro のマインドマップ） */
  label: string
  /**
   * データ → クリップボードに書くもの。**副作用を持たない純関数**であること
   *（書き込むのは額縁。モジュールはクリップボードに触らない）。
   * `text` を併せて返すのは、HTML だけを載せると他アプリに貼れなくなるため
   */
  toClipboard: (data: TData) => { html: string; text: string }
  /**
   * この HTML は自分の形式か。**ウィンドウがアクティブになるたびに呼ぶので速いこと**
   *（完全な復号をせず、印の有無だけを見る）
   */
  canImport: (html: string) => boolean
  /** HTML → データ。取り込めないときは**人に見せる理由**を返す */
  fromClipboard: (
    html: string,
    title: string,
  ) => { ok: true; data: TData } | { ok: false; reason: string }
}
```

`ToolModule` の `outputs` の下に追記:

```ts
  /**
   * 規約7（任意）: 外部ツールとのクリップボード交換。**持たないツールは書かない。**
   * 額縁はこの有無だけを見てボタンの活性を決める（ツールを名指ししない）
   */
  clipboardExchanges?: readonly ClipboardExchange<TData>[]
```

- [ ] **Step 4: `miro.ts` を実装する**

`src/modules/logic-tree/miro.ts`:

```ts
import type { ClipboardExchange } from '@/core/registry'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { decodeMiroClipboard, encodeMiroClipboard, hasMiroMindmap } from './miro-codec'
import { nodesToMiroPayload } from './miro-export'
import { miroPayloadToNodes } from './miro-import'

/**
 * Miro のマインドマップとのクリップボード交換（規約7）。
 * 器（miro-codec）と木（miro-import / miro-export）を束ねるだけで、判断は持たない。
 */
export const miroMindmapExchange: ClipboardExchange<LogicTreeSchemaVersion1> = {
  id: 'miro-mindmap',
  label: 'Miro のマインドマップ',

  toClipboard(data) {
    const { payload, texts } = nodesToMiroPayload(data)
    return {
      html: encodeMiroClipboard(payload, texts),
      // プレーンテキスト側は他アプリ向け。Miro も同じ位置に文言だけを並べている
      text: texts.join('\n'),
    }
  },

  canImport(html) {
    return hasMiroMindmap(html)
  },

  fromClipboard(html, title) {
    const payload = decodeMiroClipboard(html)
    if (payload === null) return { ok: false, reason: 'Miro のデータとして読めませんでした。' }
    const result = miroPayloadToNodes(payload)
    if (!result.ok) return result
    return {
      ok: true,
      data: { schemaVersion: 1, type: 'logicTree', title, nodes: result.nodes },
    }
  },
}
```

- [ ] **Step 5: `module.ts` で宣言する**

`src/modules/logic-tree/module.ts` に import を足し、`outputs` の下に1行:

```ts
import { miroMindmapExchange } from './miro'
```

```ts
  // 規約7（任意）: Miro のマインドマップとのクリップボード交換（M2）。
  // **他のツールは宣言しない**——額縁はこの有無でボタンの活性を決める
  clipboardExchanges: [miroMindmapExchange],
```

- [ ] **Step 6: 通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/
npx tsc -b
```

Expected: PASS（`miro.test.ts` 6件を含む）／ tsc はエラーなし

- [ ] **Step 7: `module.test.ts` に宣言の確認を足す**

`src/modules/logic-tree/module.test.ts` に追記:

```ts
  it('Miro のクリップボード交換を1本宣言する', () => {
    expect(logicTreeModule.clipboardExchanges).toHaveLength(1)
    expect(logicTreeModule.clipboardExchanges?.[0].id).toBe('miro-mindmap')
  })
```

他4ツールが宣言していないことも押さえる。`src/modules/index.test.ts` に追記:

```ts
  it('クリップボード交換を宣言するのはロジックツリーだけ（M2）', () => {
    const declared = appRegistry
      .list()
      .filter((m) => (m.clipboardExchanges?.length ?? 0) > 0)
      .map((m) => m.type)
    expect(declared).toEqual(['logicTree'])
  })
```

- [ ] **Step 8: 全体が緑であることを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: すべて緑

- [ ] **Step 9: コミット**

```bash
git add src/core/registry.ts src/modules/logic-tree/miro.ts src/modules/logic-tree/miro.test.ts src/modules/logic-tree/module.ts src/modules/logic-tree/module.test.ts src/modules/index.test.ts
git commit -m "$(cat <<'EOF'
feat(core): モジュール規約に任意の clipboardExchanges を足す

規約5（OutputProfile）は「Markdown を返す純関数」と .md 書き出しが前提で、
Miro 交換（HTML とテキストの2つを返す・入力の口が要る）は乗らない。
宣言しないツールの規約の点数は増えない（describeIssueEffect と同じ層）。

ロジックツリーだけが宣言する。額縁はこの有無でボタンの活性を決めるので、
ツールを名指しせずに済む。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 5: Markdown 出力（M1 からの宿題）

**Files:**
- Create: `src/modules/logic-tree/markdown.ts`
- Create: `src/modules/logic-tree/markdown.test.ts`
- Modify: `src/modules/logic-tree/module.ts`

**Interfaces:**
- Consumes: `documentHeading`（`@/core/markdown-table`）、`buildTree`
- Produces: `logicTreeToMarkdown(data: LogicTreeSchemaVersion1): string`

- [ ] **Step 1: 失敗するテストを書く**

`src/modules/logic-tree/markdown.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'
import { logicTreeToMarkdown } from './markdown'

const TREE: LogicTreeSchemaVersion1 = {
  schemaVersion: 1,
  type: 'logicTree',
  title: '売上の分解',
  nodes: [
    { id: 'node_aaaaaaaaaa', parentId: null, text: '売上が落ちた' },
    { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '客数が減った' },
    { id: 'node_cccccccccc', parentId: 'node_bbbbbbbbbb', text: '新規が減った' },
    { id: 'node_dddddddddd', parentId: 'node_aaaaaaaaaa', text: '単価が下がった' },
  ],
}

describe('logicTreeToMarkdown', () => {
  it('h1 を使わず、title が h2', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('## 売上の分解')
    expect(md).not.toMatch(/^# /m)
  })

  it('mermaid の flowchart を出す', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('```mermaid')
    expect(md).toContain('flowchart LR')
    expect(md).toContain('n1["売上が落ちた"] --> n2["客数が減った"]')
    expect(md).toContain('n2["客数が減った"] --> n3["新規が減った"]')
    expect(md).toContain('n1["売上が落ちた"] --> n4["単価が下がった"]')
  })

  it('入れ子の箇条書きを出す', () => {
    const md = logicTreeToMarkdown(TREE)
    expect(md).toContain('- 売上が落ちた\n  - 客数が減った\n    - 新規が減った\n  - 単価が下がった')
  })

  it('空文言は（未定義）', () => {
    const withEmpty: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [
        { id: 'node_aaaaaaaaaa', parentId: null, text: '' },
        { id: 'node_bbbbbbbbbb', parentId: 'node_aaaaaaaaaa', text: '子' },
      ],
    }
    const md = logicTreeToMarkdown(withEmpty)
    expect(md).toContain('- （未定義）')
    expect(md).toContain('n1["（未定義）"]')
  })

  it('mermaid と衝突する文字をエスケープする', () => {
    const risky: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'A["B"] と C' }],
    }
    const md = logicTreeToMarkdown(risky)
    // " は実体参照へ、[ ] は全角へ逃がす（生のまま出すとラベルのパースが壊れる）
    expect(md).toContain('n1["A［&quot;B&quot;］ と C"]')
    // 箇条書き側は Markdown なのでエスケープしない
    expect(md).toContain('- A["B"] と C')
  })

  it('ノードが1つでも図と箇条書きの両方を出す', () => {
    const single: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: 'ひとつだけ' }],
    }
    const md = logicTreeToMarkdown(single)
    expect(md).toContain('flowchart LR')
    expect(md).toContain('n1["ひとつだけ"]')
    expect(md).toContain('- ひとつだけ')
  })

  it('改行を含む文言は図では空白に畳み、箇条書きでは残す', () => {
    const multiline: LogicTreeSchemaVersion1 = {
      ...TREE,
      nodes: [{ id: 'node_aaaaaaaaaa', parentId: null, text: '上\n下' }],
    }
    const md = logicTreeToMarkdown(multiline)
    // mermaid のラベルは1行でないと壊れる
    expect(md).toContain('n1["上 下"]')
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/modules/logic-tree/markdown.test.ts
```

Expected: FAIL（`Failed to resolve import "./markdown"`）

- [ ] **Step 3: 実装する**

`src/modules/logic-tree/markdown.ts`:

```ts
import { buildTree, type FlatTreeNode } from '@/core/canvas/flat-tree'
import { documentHeading } from '@/core/markdown-table'
import type { LogicTreeSchemaVersion1 } from '@/types/logic-tree'

/**
 * ロジックツリーの Markdown 出力（モジュール規約5。logic-tree M2）。
 *
 * **プロファイルは1本で、図と箇条書きを縦に並べる。** rev 6章のプロファイルは
 * 「読み手による出し分け」の軸であり、形式（図／箇条書き）の軸を混ぜると、後から
 * 読み手の軸が要るときに掛け算になる（シーケンスの決着と同じ）。
 *
 * - **h1 は使わない**（NotePM のページタイトルと階層が衝突する）。`title` が h2
 * - 図は `flowchart LR`。**`mindmap` 記法は Mermaid 10 以降でしか描けない**ので使わない
 * - ノード ID は `n1`, `n2` … の連番。`node_xxx` は長すぎて図が読めなくなる
 * - 空文言は `（未定義）`。**仕様書に貼った瞬間に未定義が見えなくなるのは
 *   文章仕様書の悪癖の再生産である**（rev 5章。用語集・シーケンスと同じ規約）
 */

const UNDEFINED_TEXT = '（未定義）'

/** 箇条書き側の文言。空なら（未定義） */
function bulletLabel(text: string): string {
  return text === '' ? UNDEFINED_TEXT : text
}

/**
 * mermaid のラベル。`"` は実体参照へ、`[` `]` は全角へ逃がし、改行は空白に畳む。
 * **ラベルが複数行になると mermaid のパースが壊れる**ので、ここだけは改行を残せない
 */
function mermaidLabel(text: string): string {
  if (text === '') return UNDEFINED_TEXT
  return text
    .replace(/"/g, '&quot;')
    .replace(/\[/g, '［')
    .replace(/\]/g, '］')
    .replace(/\r?\n/g, ' ')
}

export function logicTreeToMarkdown(data: LogicTreeSchemaVersion1): string {
  const built = buildTree(data.nodes)

  // 図と箇条書きで同じ順に走るよう、行きがけ順の一覧を先に作る
  const ordered: { index: number; depth: number; parentOrder: number | null }[] = []
  const walk = (flat: FlatTreeNode, depth: number, parentOrder: number | null): void => {
    const order = ordered.length
    ordered.push({ index: flat.index, depth, parentOrder })
    for (const child of flat.children) walk(child, depth + 1, order)
  }
  for (const root of built.roots) walk(root, 0, null)

  // mermaid の識別子は 1 始まりの連番（n1, n2, …）
  const nodeRef = (order: number): string =>
    `n${order + 1}["${mermaidLabel(data.nodes[ordered[order].index].text)}"]`

  const lines: string[] = ['```mermaid', 'flowchart LR']
  if (ordered.length === 1) {
    // 辺が1本も無いとき、ノードだけの行を出さないと図が空になる
    lines.push(`  ${nodeRef(0)}`)
  }
  ordered.forEach((entry, order) => {
    if (entry.parentOrder === null) return
    lines.push(`  ${nodeRef(entry.parentOrder)} --> ${nodeRef(order)}`)
  })
  lines.push('```', '')

  for (const entry of ordered) {
    const indent = '  '.repeat(entry.depth)
    lines.push(`${indent}- ${bulletLabel(data.nodes[entry.index].text)}`)
  }

  return `${documentHeading(data.title)}\n\n${lines.join('\n')}\n`
}
```

**`documentHeading` が何を返すか確認してから使うこと。** 用語集は `documentHeading(data.title)` で h2 を得ている（`src/core/markdown-table.ts:58`）。**末尾に改行が含まれるかで、上の連結の `\n\n` を1つ減らす必要がある。**

- [ ] **Step 4: 通ることを確認する**

```bash
npx vitest run src/modules/logic-tree/markdown.test.ts
```

Expected: PASS（7件）

- [ ] **Step 5: `module.ts` に登録する**

`src/modules/logic-tree/module.ts`:

```ts
import { logicTreeToMarkdown } from './markdown'
```

`outputs: []` を置き換える:

```ts
  // 規約5: M1 で 0 本だった出力を M2 で1本にした。
  // **図と箇条書きを1本にまとめる**——形式の軸でプロファイルを割らない（rev 6章）
  outputs: [
    { id: 'default', label: 'Markdown', fileSuffix: '', toMarkdown: logicTreeToMarkdown },
  ],
```

`module.test.ts` の「outputs は0本」を確かめているテストがあれば、1本に直す。

- [ ] **Step 6: 全体が緑であることを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src/modules/logic-tree/markdown.ts src/modules/logic-tree/markdown.test.ts src/modules/logic-tree/module.ts src/modules/logic-tree/module.test.ts
git commit -m "$(cat <<'EOF'
feat(logic-tree): Markdown 出力を足す（M1 からの宿題）

プロファイル1本に mermaid の図と入れ子の箇条書きを縦に並べる。形式の軸で
プロファイルを割らない（シーケンスと同じ決着）。

flowchart LR を使う。mindmap 記法は Mermaid 10 以降でしか描けないため。
空文言は（未定義）と書く——貼った瞬間に未定義が見えなくなるのは
文章仕様書の悪癖の再生産である。

これで額縁の「Markdown をコピー / 書き出す」がロジックツリーでも押せるようになる。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 6: クリップボードの読み書き（Rust ＋ fs 層）

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/capabilities/default.json`
- Modify: `src/fs/clipboard.ts`
- Modify: `src/fs/clipboard.test.ts`

**Interfaces:**
- Produces:
  - `readClipboardHtml(): Promise<string>`（`src/fs/clipboard.ts`）
  - `copyHtmlToClipboard(html: string, text: string): Promise<void>`（同）

- [ ] **Step 1: `arboard` を直接依存に足す**

`src-tauri/Cargo.toml` の `[dependencies]` に:

```toml
# クリップボードの HTML 読み取り（logic-tree M2）。
# tauri-plugin-clipboard-manager が内部で使っているが JS へ公開していないので、
# 自前コマンドで通す。**推移依存に頼らない**——プラグインの更新で黙って消えるため
arboard = "3.6"
```

```bash
cd src-tauri && cargo check
```

Expected: エラーなし（既に依存グラフにあるのでダウンロードは走らないはず）

- [ ] **Step 2: Rust のコマンドを足す**

`src-tauri/src/lib.rs` に:

```rust
/// クリップボードの HTML を読む（logic-tree M2）。
///
/// `tauri-plugin-clipboard-manager` は **HTML の読み取り API を持たない**
/// （型定義に「we can read html data only as a string so there's just readText(),
/// no readHtml()」と明記されている）。内部で使っている arboard は `Get::html()` を
/// 持ち Windows 実装も入っているので、公開されていないだけのそれをここで通す。
///
/// **判断もロジックも持たない**（rev 12章）。復号もパースも木の組み立ても TypeScript 側。
#[tauri::command]
fn read_clipboard_html() -> Result<String, String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.get().html())
        .map_err(|err| err.to_string())
}
```

`invoke_handler` の `generate_handler![...]` に `read_clipboard_html` を足す。

```bash
cd src-tauri && cargo check && cargo test
```

Expected: エラーなし

- [ ] **Step 3: capabilities に HTML 書き込みを足す**

`src-tauri/capabilities/default.json` の `permissions` の `clipboard-manager:allow-write-text` の隣に:

```json
    "clipboard-manager:allow-write-html",
```

同ファイルの `description` の該当箇所を書き直す。既存の文:

> `clipboard-manager:allow-write-text` は Markdown 出力のコピーのため（M6。読み取りは許可しない）。

を、こう置き換える:

> `clipboard-manager:allow-write-text` は Markdown 出力のコピーのため（M6）、`clipboard-manager:allow-write-html` は Miro のマインドマップとしてのコピーのため（logic-tree M2）。**プラグインの読み取り権限は与えない**——HTML の読み取りはプラグインに API が無く、自前コマンド `read_clipboard_html`（arboard）を通すため。

- [ ] **Step 4: `src/fs/clipboard.ts` を書く**

```ts
import { invoke } from '@tauri-apps/api/core'
import { writeHtml, writeText } from '@tauri-apps/plugin-clipboard-manager'

/**
 * クリップボードへ書く（Markdown 出力の「会議直後に議事録へ貼る」最短動線。rev 8章）。
 * コアは Tauri を知らないので、額縁がこの関数を `AppIo.copyText` として注入する。
 *
 * `navigator.clipboard` を使わないのは、動かないときに黙って失敗する経路になりうるため。
 * プラグイン側なら `clipboard-manager:allow-write-text` の欠落が capabilities で確認できる。
 */
export async function copyToClipboard(text: string): Promise<void> {
  await writeText(text)
}

/**
 * HTML としてクリップボードへ書く（Miro のマインドマップ。logic-tree M2）。
 *
 * `altText` を渡すのは、**HTML だけを載せると他アプリに貼れなくなる**ため。
 * Miro 自身も両方を載せている
 */
export async function copyHtmlToClipboard(html: string, altText: string): Promise<void> {
  await writeHtml(html, altText)
}

/**
 * クリップボードの HTML を読む（logic-tree M2）。
 *
 * **プラグインには読み取り API が無い**ので、Rust の自前コマンドを通す
 *（`src-tauri/src/lib.rs` の `read_clipboard_html`）。HTML が載っていないときは
 * Rust 側がエラーを返すので、**空文字に潰して呼び出し側を単純にする**——
 * 「HTML が無い」は異常ではなく日常的な状態である
 */
export async function readClipboardHtml(): Promise<string> {
  try {
    return await invoke<string>('read_clipboard_html')
  } catch {
    return ''
  }
}
```

- [ ] **Step 5: `src/fs/clipboard.test.ts` を書く**

既存ファイルの先頭（モックの宣言）を、`writeHtml` と `invoke` を足した形に置き換える:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const writeText = vi.fn<(text: string) => Promise<void>>()
const writeHtml = vi.fn<(html: string, altText?: string) => Promise<void>>()
vi.mock('@tauri-apps/plugin-clipboard-manager', () => ({ writeText, writeHtml }))

const invoke = vi.fn<(cmd: string) => Promise<unknown>>()
vi.mock('@tauri-apps/api/core', () => ({ invoke }))

const { copyToClipboard, copyHtmlToClipboard, readClipboardHtml } = await import('./clipboard')
```

**既存の2つの `describe` はそのまま残す**（`beforeEach` の `writeText.mockReset()` も）。末尾に足す:

```ts
describe('copyHtmlToClipboard', () => {
  beforeEach(() => {
    writeHtml.mockReset()
    writeHtml.mockResolvedValue(undefined)
  })

  it('HTML と altText の両方を渡す', async () => {
    await copyHtmlToClipboard('<span data-meta="x"></span>', '親\n子')
    expect(writeHtml).toHaveBeenCalledWith('<span data-meta="x"></span>', '親\n子')
  })

  it('失敗はそのまま投げる（呼び出し側がバナーを出す）', async () => {
    writeHtml.mockRejectedValue(new Error('denied'))
    await expect(copyHtmlToClipboard('<p>x</p>', 'x')).rejects.toThrow('denied')
  })
})

describe('readClipboardHtml', () => {
  beforeEach(() => {
    invoke.mockReset()
  })

  it('自前コマンドの結果をそのまま返す', async () => {
    invoke.mockResolvedValue('<html>…</html>')
    await expect(readClipboardHtml()).resolves.toBe('<html>…</html>')
    expect(invoke).toHaveBeenCalledWith('read_clipboard_html')
  })

  it('HTML が載っていなければ空文字（投げない）', async () => {
    // arboard は HTML が無いときエラーを返す。**それは異常ではなく日常的な状態**
    invoke.mockRejectedValue(new Error('ClipboardNotSupported'))
    await expect(readClipboardHtml()).resolves.toBe('')
  })
})
```

- [ ] **Step 6: 通ることを確認する**

```bash
npm test
npx tsc -b
cd src-tauri && cargo test && cd ..
```

Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/src/lib.rs src-tauri/capabilities/default.json src/fs/clipboard.ts src/fs/clipboard.test.ts
git commit -m "$(cat <<'EOF'
feat(core): クリップボードの HTML を読み書きできるようにする

読み取りは自前コマンド read_clipboard_html（arboard）。プラグインは HTML の
読み取り API を持たない（型定義に明記されている）が、内部で使っている arboard は
Get::html() を持ち Windows 実装も入っている。公開されていないだけなので通す。

判断もロジックも持たないネイティブ API の提供層なので、rev 12章の「Rust は薄く」の
範囲内（allow_skill_dir / allow_project_dir と同じ性格）。

書き込みは既存プラグインの writeHtml。capabilities に allow-write-html を足した。
**プラグインの読み取り権限は与えない。**

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 7: `ChoiceDialog` にキャンセルを足す

**Files:**
- Modify: `src/components/ChoiceDialog.tsx`
- Modify: `src/components/ChoiceDialog.dom.test.tsx`
- Modify: `src/core/modal-queue.ts`
- Modify: `src/core/modal-queue.test.ts`

**Interfaces:**
- Produces:
  - `ChoiceDialogProps.onCancel?: () => void` と `ChoiceDialogProps.cancelLabel?: string`
  - `ModalRequest`（`kind: 'choice'`）に `cancelLabel?: string`

**キャンセルに副作用は持たせない。** `ModalRequest` に足すのは `cancelLabel?` **だけ**で、`onCancel` は持たせない。キャンセルは「キューから外す」以上のことをせず、それは額縁（`App.tsx`）の `setModals(shiftModal)` が既にやっている。コントローラに空の `onCancel` を書くと、**何もしない関数を経路に増やすだけ**になる。

- [ ] **Step 1: 失敗するテストを書く**

`src/components/ChoiceDialog.dom.test.tsx` に追記:

```ts
  it('onCancel を渡すとキャンセルのボタンが出て、Esc でも閉じる', async () => {
    const onCancel = vi.fn()
    render(
      <ChoiceDialog
        open
        title="取り込む"
        description="どちらに取り込みますか。"
        primaryLabel="上書き"
        secondaryLabel="新規"
        cancelLabel="やめる"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
        onCancel={onCancel}
      />,
    )
    await userEvent.click(screen.getByRole('button', { name: 'やめる' }))
    expect(onCancel).toHaveBeenCalledTimes(1)
  })

  it('onCancel を渡さなければキャンセルは出ず、Esc も効かない（既存の挙動）', async () => {
    render(
      <ChoiceDialog
        open
        title="外部変更"
        description="どちらを残しますか。"
        primaryLabel="取り込む"
        secondaryLabel="上書き"
        onPrimary={vi.fn()}
        onSecondary={vi.fn()}
      />,
    )
    expect(screen.queryByRole('button', { name: 'やめる' })).toBe(null)
  })
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/components/ChoiceDialog.dom.test.tsx
```

Expected: FAIL（`cancelLabel` が型エラー、またはボタンが見つからない）

- [ ] **Step 3: 実装する**

`ChoiceDialogProps` に足す:

```ts
  /**
   * **任意。** 渡したときだけキャンセルのボタンが出て、Esc も効くようになる。
   *
   * 既定（渡さない）が「キャンセルも Esc も無い」なのは、外部変更の衝突では
   * どちらの選択にも副作用があり、決めないまま閉じると宙ぶらりんが残るため
   * （JSDoc の上の段落を参照）。**取り込みのように「やめる」が正しい選択に
   * なりうる場面でだけ渡す**（logic-tree M2）
   */
  onCancel?: () => void
  /** キャンセルのボタンの文言。onCancel を渡すときだけ意味がある */
  cancelLabel?: string
```

`AlertDialogContent` の `onEscapeKeyDown` を、`onCancel` があるときは通すように変える:

```tsx
      <AlertDialogContent
        onEscapeKeyDown={(event) => {
          // onCancel を持たないダイアログは「決めるまで閉じない」（既存の挙動）
          if (props.onCancel === undefined) {
            event.preventDefault()
            return
          }
          event.preventDefault()
          props.onCancel()
        }}
      >
```

`AlertDialogFooter` の先頭にキャンセルのボタンを足す:

```tsx
        {props.onCancel !== undefined && (
          <AlertDialogAction
            variant="ghost"
            onClick={(event) => {
              event.preventDefault()
              props.onCancel?.()
            }}
          >
            {props.cancelLabel ?? 'やめる'}
          </AlertDialogAction>
        )}
```

**`variant="ghost"` が使えなければ、既存のボタンが使っている variant に合わせること**（`outline` でよい）。

- [ ] **Step 4: `ModalRequest` にラベルだけ足す**

`src/core/modal-queue.ts` の `kind: 'choice'` の枝に1行:

```ts
      /**
       * **任意。** 渡すとキャンセルのボタンが出る（logic-tree M2）。
       * `onCancel` は持たせない——キャンセルは「キューから外す」以上のことをせず、
       * それは額縁の `shiftModal` が既にやっている
       */
      cancelLabel?: string
```

`modal-queue.test.ts` は型の追加だけなので変更不要。**既存のテストが落ちないことだけ確かめる。**

- [ ] **Step 5: 通ることを確認する**

```bash
npx vitest run src/components/ChoiceDialog.dom.test.tsx src/core/modal-queue.test.ts
npm test
```

Expected: すべて緑（**既存の外部変更のテストが落ちないこと**を必ず確かめる）

- [ ] **Step 6: コミット**

```bash
git add src/components/ChoiceDialog.tsx src/components/ChoiceDialog.dom.test.tsx src/core/modal-queue.ts
git commit -m "$(cat <<'EOF'
feat(core): ChoiceDialog に任意のキャンセルを足す

渡したときだけキャンセルのボタンが出て Esc も効く。既定は従来どおり
「決めるまで閉じない」——外部変更の衝突ではどちらの選択にも副作用があり、
決めないまま閉じると宙ぶらりんが残るため。

Miro の取り込みは「やめる」が正しい選択になりうるので、そこでだけ渡す。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 8: コントローラに取り込み・書き出しの手順を足す

**Files:**
- Modify: `src/core/app-controller.ts`
- Modify: `src/core/app-controller.test.ts`

**Interfaces:**
- Consumes: `ClipboardExchange`、`AppIo`、`AppHost`
- Produces（`AppController` に追加）:
  - `copyToExternal(exchange: ClipboardExchange<unknown>): Promise<void>`
  - `importFromExternal(exchange: ClipboardExchange<unknown>): Promise<void>`
- `AppIo` に追加: `readClipboardHtml: () => Promise<string>` / `copyHtml: (html: string, text: string) => Promise<void>`

- [ ] **Step 1: 失敗するテストを書く**

`src/core/app-controller.test.ts` に追記（既存のテストのモックの組み方をそのまま使うこと）:

```ts
describe('クリップボード交換（logic-tree M2）', () => {
  it('copyToExternal は exchange の html と text をそのまま書き込む', async () => {
    // ロジックツリーのファイルを開いた状態を作り
    await controller.copyToExternal(exchange)
    expect(io.copyHtml).toHaveBeenCalledWith('<html-of-exchange>', '<text-of-exchange>')
  })

  it('copyToExternal は成功をトーストで知らせる', async () => {
    await controller.copyToExternal(exchange)
    expect(host.showToast).toHaveBeenCalled()
  })

  it('importFromExternal は取り込めないときバナーに理由を出し、ダイアログを出さない', async () => {
    io.readClipboardHtml.mockResolvedValue('<p>ちがう</p>')
    await controller.importFromExternal(exchange)
    expect(host.showModal).not.toHaveBeenCalled()
    expect(host.setBanner).toHaveBeenCalledWith('io', expect.stringContaining('読めませんでした'))
  })

  it('importFromExternal は取り込めるとき三択のダイアログを出す', async () => {
    io.readClipboardHtml.mockResolvedValue('<miro-html>')
    await controller.importFromExternal(exchange)
    expect(host.showModal).toHaveBeenCalled()
  })

  it('「上書き」を選ぶと applyEdit を1回だけ通る（Ctrl+Z で戻せる）', async () => {
    io.readClipboardHtml.mockResolvedValue('<miro-html>')
    await controller.importFromExternal(exchange)
    // showModal に渡された request の primary を呼ぶ
    modalRequest.onPrimary()
    expect(host.setDocument).toHaveBeenCalledTimes(1)
  })

  it('「新しいファイルに作る」を選ぶとファイルを作ってから中身を差し替える', async () => {
    io.readClipboardHtml.mockResolvedValue('<miro-html>')
    await controller.importFromExternal(exchange)
    await modalRequest.onSecondary()
    expect(io.write).toHaveBeenCalled() // createFile が通った
  })

  it('押した時点でクリップボードを読み直す（活性状態を信用しない）', async () => {
    io.readClipboardHtml.mockResolvedValue('<miro-html>')
    await controller.importFromExternal(exchange)
    expect(io.readClipboardHtml).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/core/app-controller.test.ts
```

Expected: FAIL（`controller.copyToExternal is not a function`）

- [ ] **Step 3: `AppIo` を広げる**

```ts
  copyText: (text: string) => Promise<void>
  /** HTML としてコピーする。altText は他アプリに貼るための平文（logic-tree M2） */
  copyHtml: (html: string, altText: string) => Promise<void>
  /** クリップボードの HTML。載っていなければ空文字（logic-tree M2） */
  readClipboardHtml: () => Promise<string>
```

- [ ] **Step 4: コントローラに手順を足す**

`AppController` に2つ足し、`createAppController` の中で実装する:

```ts
  /**
   * 選択中のデータを外部ツールの形式でクリップボードへ（logic-tree M2）。
   * **判断はモジュールが持ち、ここは順序だけ**を持つ
   */
  const copyToExternal = async (exchange: ClipboardExchange<unknown>): Promise<void> => {
    const data = host.getEditingData()
    if (data === null) return
    const { html, text } = exchange.toClipboard(data)
    try {
      await io.copyHtml(html, text)
      host.showToast({ kind: 'info', message: `${exchange.label}としてコピーしました。` })
    } catch (err) {
      host.setBanner('io', `コピーできませんでした: ${describeError(err)}`)
    }
  }

  /**
   * クリップボードから取り込む（logic-tree M2）。
   *
   * **押された時点で読み直す。** ボタンの活性はウィンドウがアクティブになった時点の
   * スナップショットで、その後ユーザーが別のものをコピーしている可能性がある。
   * 「活性なのに押したら何もない」を防ぐ
   */
  const importFromExternal = async (exchange: ClipboardExchange<unknown>): Promise<void> => {
    const path = selectedPath
    const module = path === null ? null : moduleOf(path)
    if (path === null || module === null) return

    const html = await io.readClipboardHtml()
    // 取り込み先の title は「上書きなら今の title、新規なら額縁が決めた名前」なので、
    // ここでは今の title を仮に渡し、新規側で作られたファイルの title で上書きする
    const current = host.getEditingData() as { title?: string } | null
    const result = exchange.fromClipboard(html, current?.title ?? '')
    if (!result.ok) {
      host.setBanner('io', result.reason)
      return
    }

    const count = (result.data as { nodes?: unknown[] }).nodes?.length ?? 0
    host.showModal({
      kind: 'choice',
      key: 'clipboard-import',
      title: `${exchange.label}を取り込む`,
      description: `ノード ${count} 個のマインドマップが見つかりました。どちらに取り込みますか。`,
      primaryLabel: 'このツリーを上書き',
      secondaryLabel: '新しいファイルに作る',
      // キャンセルは額縁が shiftModal するだけ。ここに onCancel は要らない
      cancelLabel: 'やめる',
      onPrimary: () => {
        // **1回の applyEdit で置き換える**（独立した履歴）。
        // Ctrl+Z 一発で戻せるので、二段階の確認は要らない
        applyEdit(path, module, result.data)
      },
      onSecondary: async () => {
        await createNewFile(module)
        // createNewFile は作ったファイルを選択済み。その path と名前を使う
        const created = selectedPath
        if (created === null) return
        const createdName = files.find((f) => f.path === created)?.name ?? ''
        // 拡張子を落として title にする（新規作成が「ファイル名＝title」で作るのと揃える）
        const title = createdName.replace(/\.json$/i, '')
        // createEmpty の雛形（ルート1件）は捨てられる。それでよい
        applyEdit(created, module, { ...(result.data as object), title })
      },
    })
  }
```

**Step 4 の注意**:
- `applyEdit` / `createNewFile` は同ファイル内の既存関数。`selectedPath` / `files` はクロージャ変数（コントローラが所有する状態）。**`host` 側の値を読み返さないこと**——表示の複製を判断材料にするのは M5 で実際に障害を起こした構造である
- `moduleOf` に相当するものが無ければ、既存コードが `selectedPath` からモジュールを引いている箇所（`copyMarkdown` 付近）と同じやり方を使う
- `showToast` の引数の形は既存の呼び出しに合わせる（`kind` の値が違う可能性がある）

- [ ] **Step 5: 通ることを確認する**

```bash
npm test
npx tsc -b
```

Expected: すべて緑

- [ ] **Step 6: コミット**

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "$(cat <<'EOF'
feat(core): クリップボード交換の取り込み・書き出しの順序をコントローラに置く

判断はモジュール（ClipboardExchange）が持ち、ここは順序だけを持つ。

押された時点でクリップボードを読み直す。ボタンの活性はウィンドウが
アクティブになった時点のスナップショットで、その後ユーザーが別のものを
コピーしている可能性がある——「活性なのに押したら何もない」を防ぐ。

上書きは applyEdit 1回（独立した履歴）。Ctrl+Z 一発で戻せるので、
二段階の確認は要らない。取り返しがつく操作に確認を重ねると、確認を
読まなくなる方が害が大きい。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 9: 額縁の配線（ボタンとフォーカス検知）

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/App.dom.test.tsx`
- Modify: `src/components/ExportMenu.tsx`（または新規に `ClipboardExchangeButtons.tsx`）

- [ ] **Step 1: 失敗するテストを書く**

`src/App.dom.test.tsx` に追記:

```ts
  it('Miro のボタンは常に出ていて、ロジックツリー以外では押せない', async () => {
    // 用語集を開いた状態で
    expect(screen.getByRole('button', { name: 'Miro へコピー' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Miro から取り込む' })).toBeDisabled()
  })

  it('ロジックツリーを開くと「Miro へコピー」が押せる', async () => {
    // ロジックツリーを選んだ状態で
    expect(screen.getByRole('button', { name: 'Miro へコピー' })).toBeEnabled()
  })

  it('「Miro から取り込む」はクリップボードに Miro のデータがあるときだけ押せる', async () => {
    // readClipboardHtml が Miro のデータを返すようモックし、window に focus を送る
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Miro から取り込む' })).toBeEnabled(),
    )
  })

  it('クリップボードが Miro のデータでなければ取り込みは押せないまま', async () => {
    // readClipboardHtml が '<p>ちがう</p>' を返すようモックし focus を送る
    window.dispatchEvent(new Event('focus'))
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Miro から取り込む' })).toBeDisabled(),
    )
  })
```

- [ ] **Step 2: 落ちることを確認する**

```bash
npx vitest run src/App.dom.test.tsx
```

Expected: FAIL（ボタンが見つからない）

- [ ] **Step 3: フォーカス検知を書く**

`src/App.tsx` に、選択中モジュールの `clipboardExchanges` を見る状態と、`focus` の購読を足す:

```tsx
  const exchange = selectedModule?.clipboardExchanges?.[0]
  const [clipboardHasImport, setClipboardHasImport] = useState(false)

  /**
   * ウィンドウがアクティブになったらクリップボードを1回だけ見る（logic-tree M2）。
   *
   * **ポーリングはしない。** Miro のデータが載る瞬間は「Miro でコピーして facet に
   * 戻ってくる瞬間」なので、フォーカスを得たときに読めば足りる。常時ポーリングは
   * CPU を食うわりに得るものがない。
   *
   * Tauri の window イベントではなく DOM の focus を使うのは、**コアを Tauri に
   * 近づけないため**と、DOM のテストでそのまま発火させられるため
   */
  useEffect(() => {
    if (exchange === undefined) {
      setClipboardHasImport(false)
      return
    }
    let alive = true
    const check = (): void => {
      void readClipboardHtml().then((html) => {
        if (alive) setClipboardHasImport(exchange.canImport(html))
      })
    }
    check()
    window.addEventListener('focus', check)
    return () => {
      alive = false
      window.removeEventListener('focus', check)
    }
  }, [exchange])
```

**`readClipboardHtml` を2箇所から呼ぶことになるが、重複ではない。**

- **ここ（額縁）** は `src/fs/clipboard.ts` の関数を直接呼ぶ。**ボタンの活性を決めるためだけ**の読み取りで、コントローラの判断には関わらない。額縁は元々 `AppIo` を組み立てる側なので fs を知っている
- **コントローラ（Task 8）** は `io.readClipboardHtml` を呼ぶ。**押された時点で読み直す**ためで、テストで差し替えられる必要がある

役割が違うので、片方に寄せない。

- [ ] **Step 4: ボタンを置く**

`ExportMenu` の隣に2つ:

```tsx
          <Button
            variant="outline"
            disabled={!canExport || exchange === undefined}
            onClick={() => exchange !== undefined && void controller.copyToExternal(exchange)}
          >
            Miro へコピー
          </Button>
          <Button
            variant="outline"
            disabled={exchange === undefined || !clipboardHasImport}
            onClick={() => exchange !== undefined && void controller.importFromExternal(exchange)}
          >
            Miro から取り込む
          </Button>
```

**ボタンの文言に「Miro」と書いてよいが、活性の判断に `'logicTree'` を使わないこと。** 判断はすべて `exchange` の有無で行う。（文言をモジュール由来にしたければ `exchange.label` を使ってもよいが、`disabled` のときに文言が消えると「消えたり出たりしない」原則に反するので、**固定文言のままでよい**。）

- [ ] **Step 5: `ChoiceDialog` に `cancelLabel` / `onCancel` を渡す配線**

`App.tsx` の末尾（`<ChoiceDialog … />`）に2つ足す。既存の `onPrimary` / `onSecondary` と同じ形にする:

```tsx
        cancelLabel={head?.kind === 'choice' ? head.cancelLabel : undefined}
        onCancel={
          head?.kind === 'choice' && head.cancelLabel !== undefined
            ? () => setModals((prev) => shiftModal(prev))
            : undefined
        }
```

**`onCancel` を渡すのは `cancelLabel` を持つ要求のときだけ。** 常に渡すと、外部変更の二択（`cancelLabel` を持たない）でも Esc が効くようになってしまい、「決めるまで閉じない」という M5 の決着が壊れる。

**`modalOpen` を `KeyContext` へ渡す既存の配線（3箇所）は触らない。**

- [ ] **Step 6: 通ることを確認する**

```bash
npm test
npx tsc -b
npm run lint
```

Expected: すべて緑

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/App.dom.test.tsx src/components/ExportMenu.tsx
git commit -m "$(cat <<'EOF'
feat(core): 額縁に Miro のコピー・取り込みボタンを置く

4ボタンとも常に出ていて消えたり出たりしない（ExportMenu の既存原則）。
活性はモジュールが宣言した clipboardExchanges の有無で決めるので、額縁は
ツールを名指ししない。

取り込みの活性は、ウィンドウがアクティブになったときにクリップボードを
1回読んで決める。ポーリングはしない——Miro のデータが載る瞬間は
「Miro でコピーして facet に戻ってくる瞬間」だけである。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## Task 10: 実機確認

**Files:** なし（確認のみ。結果は Task 11 の申し送りに書く）

自動テストでは**絶対に確かめられないこと**がある。Miro が実際に受け入れるかどうかである。

- [ ] **Step 1: アプリを起動する**

```bash
npm run tauri dev
```

- [ ] **Step 2: 書き出しを確認する**

1. `sample-project/` を開き、ロジックツリーのファイルを選ぶ
2. 枝を3本以上、階層を2段以上、**長い文言のノードを1つ**含むように編集する
3. 「Miro へコピー」を押す
4. Miro のボードで `Ctrl+V`

**確認すること**:

- [ ] マインドマップとして貼れる（バラバラの付箋と線ではなく、枝を掴むと子がついてくる）
- [ ] 木の形が facet の画面と一致する
- [ ] 兄弟の順序が facet の画面と**上から同じ順**
- [ ] 角あり枠・黒
- [ ] **長い文言のノードで折り返しが起きていない**（起きていたら `miro-export.ts` の `EM_WIDTH` / `EN_WIDTH` / `PADDING_X` を上げる）
- [ ] 同じ深さのノードの幅が揃っている
- [ ] **`boardId = "ZmFjZXQtdHI="` で貼れる**（spec で「実装時に1回確認する」としていた項目）

- [ ] **Step 3: 取り込みを確認する**

1. Miro でマインドマップを選んでコピーする
2. facet に戻る（**ウィンドウをクリックしてアクティブにする**）
3. 「Miro から取り込む」が**押せる状態になる**
4. 押して「新しいファイルに作る」

**確認すること**:

- [ ] ボタンがフォーカスで活性になる
- [ ] 新しいファイルができて、木が Miro と同じ形・同じ兄弟順で入る
- [ ] 「このツリーを上書き」でも入り、**`Ctrl+Z` で元に戻る**
- [ ] 「やめる」で何も起きない
- [ ] Miro で**枝だけ**を選んでコピーすると、その枝が1本の木として取り込める
- [ ] Miro で**兄弟を2つ**選んでコピーすると「木が 2 本あります」と断られる
- [ ] マインドマップ以外（付箋など）だけを選んでコピーすると「マインドマップが見つかりません」と断られる
- [ ] Miro 以外（ブラウザの文章など）をコピーすると、ボタンが押せないままである

- [ ] **Step 4: 往復を確認する**

facet → Miro → facet と往復させ、木の形と文言が保たれることを見る。**装飾は失われる**（仕様どおり）。

- [ ] **Step 5: 実機確認の痕跡を捨てる**

```bash
git checkout -- sample-project/ && git clean -fdx sample-project/
git status --short          # 空になること
```

---

## Task 11: 文書の更新（マイルストーン完了の3箇所）

**Files:**
- Create: `docs/history/logic-tree-m2-miro-clipboard.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/overview-rev.md`

CLAUDE.md の「マイルストーン完了時に触る3箇所」に従う。**rev への反映を申し送りの TODO に残さないこと**（M4 の教訓）。

- [ ] **Step 1: 申し送りを書く**

`docs/history/logic-tree-m2-miro-clipboard.md` に、そのとき何が起きたかを書く。以後変えない。含めるもの:

- Miro のクリップボード形式（設計文書の付録を指す。**転記して二重に持たない**）
- 実験11回の記録（設計文書にある。同上）
- **実装で確定した事項**（幅の係数を実機で調整したならその値と理由）
- **Task 10 の実機確認の結果**（チェックリストを結果込みで写す）
- 見つかった欠陥

- [ ] **Step 2: `docs/open-issues.md` を更新する**

- **消す**: ロジックツリーの出力が0本である旨の項があれば消す（Task 5 で解消）
- **足す**: 新たに見つけた残件。少なくとも次は候補になる
  - **Miro の形式は非公開であり、Miro 側の変更で壊れうる**。壊れたときは `miro-codec.test.ts` の原本照合が最初に落ちる
  - **ノード幅は概算であり、フォントが変われば折り返す**
  - **課題ツリーも木構造だが Miro 交換を持たない**（今回は対象外とした）

**消し忘れると残件が幽霊として残り、足し忘れると静かに消える。**

- [ ] **Step 3: `docs/overview-rev.md` に反映する**

必ず直すのは**2箇所**:

1. **12章のクリップボードの記述**。現在「読み取り権限は与えない」と書かれている。**自前コマンド `read_clipboard_html` で読むようになった**こと、**プラグインの読み取り権限は依然として与えていない**ことを書く
2. **6章のモジュール規約**。規約7（任意）として `clipboardExchanges` を足したことを書く。「宣言しないツールの点数は増えない」ことも

7章（`outputs`）の「ロジックツリーは0本」に触れている箇所があれば、1本になったことを反映する。

- [ ] **Step 4: 全体が緑であることを確認する**

```bash
npm test && npx tsc -b && npm run lint
cd src-tauri && cargo test && cd ..
```

- [ ] **Step 5: コミット**

```bash
git add docs/
git commit -m "$(cat <<'EOF'
docs(logic-tree): M2 の申し送りを書き、残件と rev を更新する

rev 12章のクリップボードの記述（読み取り権限は与えない）を、自前コマンドで
読むようになった実態に合わせた。プラグインの読み取り権限は依然として与えない。
rev 6章に規約7（任意の clipboardExchanges）を足した。

Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>
EOF
)"
```

---

## 完了の条件

- [ ] `npm test` / `npx tsc -b` / `npm run lint` / `cargo test` がすべて緑
- [ ] **`miro-codec.test.ts` の原本バイト照合が通っている**
- [ ] Task 10 の実機確認がすべて済み、結果が申し送りに書かれている
- [ ] `git status --short` が空（`sample-project/` の痕跡を捨てた）
- [ ] `docs/open-issues.md` の増減が申し送りに書かれている
- [ ] rev 12章と6章が更新されている
