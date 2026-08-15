# M16「テストの宿題」実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `docs/open-issues.md`「テストが無い箇所」から繰り越されてきた4件——app-controller の interleaving 3分岐・`currentDocument()` の未選択分岐・指摘バナーと額縁の配線・sequence `schema.test.ts` の変異耐性の穴——にテストを入れ、載っていなかったガードを固定する。

**Architecture:** 実装コードの変更は原則ゼロ（テストの追加のみ）。唯一の例外は Task 5——interleaving テストを書くと `closeCurrentFile` の潜在クラッシュ（`await saver.flush()` の間に `handleSelectedGone` が `saver` を null にすると、復帰後の `saver.dispose()` が TypeError で落ちる）を必ず踏むことが計画時のコード読解で分かっているため、そのタスクだけ TDD でテスト→最小修正の順に進む。コントローラのテストは既存の `createHarness`（I/O 注入）に手動 Promise を挟む形、DOM テストは既存の `disk` モック＋「フォルダを開いてファイルを選ぶ」手順（M13 が確立）をそのまま使う。

**Tech Stack:** Vitest / Testing Library（jsdom）/ 既存のテストハーネス。新しい依存は増やさない。

**Spec:** `docs/open-issues.md` の「テストが無い箇所」節の次の4項目（この計画のスコープはこの4件だけ。同節の残り3件——`FLUSH_MAX_ROUNDS`・`fileExists`・`ChoiceDialog`——は**触らない**）:

1. interleaving を要する3分岐（`src/core/app-controller.ts`）`[M6]`
2. `currentDocument()` の「未選択」分岐（`src/core/app-controller.ts`）`[M6]`
3. 指摘バナーと額縁の配線（`src/App.dom.test.tsx`）`[M14]`
4. `schema.test.ts` の変異耐性の穴（`src/modules/sequence/schema.test.ts`）`[sequence-m1]`

## Global Constraints

- **テスト名・コメントは日本語**（リポジトリ全体の慣習。既存テストファイルの文体に合わせる）
- **実装コードを触ってよいのは Task 5 の `closeCurrentFile` だけ。** 他のタスクで「実装を変えないとテストが書けない」状況になったら、辻褄を合わせず「計画の矛盾」として報告して止まること
- **計画の指示が矛盾していたら報告する。ただし既存実装と一致すべき値（エラーメッセージの文言・ラベル・ID 形式）は実物が正**——本計画の文言はすべて実物ソースからの逐語コピーで、各所に引用元パスを書いてある。食い違いを見つけたら実物に合わせ、その旨を報告する
- **新しく足すテストは、対応する実装（またはスキーマ）を一時的に壊して赤くなることを確認してから戻す**（`docs/lessons-for-planning.md`「順序を固定するテストを書いたら〜」）。壊す→該当ファイルだけ実行→赤を確認→`git checkout -- <壊したファイル>`→再実行→緑、の順。壊した状態でコミットしないこと
- **期待するテスト結果は「そのファイルの `it` がすべて緑」**（件数は書かない——M4・M5 で2回数え間違えた教訓）
- 各タスクの最後に `npm test` を**全量**回してからコミットする（対象を絞らない——M6 の教訓）
- DOM テストは role とアクセシブル名で要素を引く。クラス名・レイアウトに依存させない

---

## File Structure

| ファイル | 変更 | 責務 |
| --- | --- | --- |
| `src/modules/sequence/schema.test.ts` | テスト追記 | Task 1: 入れ子の未知キー・enum・const・pattern の拒否 |
| `src/core/app-controller.test.ts` | テスト追記 | Task 2〜5: 出力の未選択ガード＋interleaving 3分岐 |
| `src/core/app-controller.ts` | **Task 5 のみ**修正 | `closeCurrentFile` の flush 待ち中の saver 差し替え耐性 |
| `src/App.dom.test.tsx` | テスト追記 | Task 6: 指摘バナーと額縁の配線 |
| `docs/history/m16-test-homework.md` | 新規 | Task 7: 申し送り |
| `docs/open-issues.md` | 編集 | Task 7: 解消4件を消す |
| `docs/README.md` | 編集 | Task 7: 履歴表に M16 の行を足す |

---

### Task 1: sequence スキーマの変異耐性の穴を塞ぐ

**Files:**
- Test: `src/modules/sequence/schema.test.ts`（追記のみ）
- （red 確認のための一時変異: `schemas/sequence.schema.json`。**必ず戻す**）

**Interfaces:**
- Consumes: 既存の `valid()` ヘルパと `validate`（同ファイル冒頭に定義済み）
- Produces: なし（テストのみ）

open-issues が列挙する穴: 入れ子の項目レベル（`actors`・`steps`・`answerSlot`・`unknownSlot`）の未知キー拒否、`unknownSlot` の `decision` enum の不正値、`const`（`schemaVersion` / `type`）、`from`-`to` のパターン。

- [ ] **Step 1: テストを追記する**

`src/modules/sequence/schema.test.ts` の `describe('sequence スキーマ（レベル1）', ...)` の末尾（`'handled なのに text が空文字だと拒否する'` の後）に追記:

```typescript
  // ---- 変異耐性の宿題（sequence M1 の最終レビューが「実害小」と判断して繰り越した分。M16）----
  // 未知キーの拒否はトップレベルと failures マップだけ検査済みだった。
  // 入れ子の additionalProperties: false を1段ずつ固定する

  it('actors の項目の未知キーを拒否する', () => {
    const d = valid()
    ;(d.actors[0] as Record<string, unknown>).color = 'red'
    expect(validate(d).ok).toBe(false)
  })

  it('steps の項目の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0] as Record<string, unknown>).note = 'x'
    expect(validate(d).ok).toBe(false)
  })

  it('answerSlot の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).failed = {
      decision: 'handled',
      text: 'x',
      reason: 'y',
    }
    expect(validate(d).ok).toBe(false)
  })

  it('unknownSlot の未知キーを拒否する', () => {
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = {
      decision: 'handled',
      text: 'x',
      retries: 3,
    }
    expect(validate(d).ok).toBe(false)
  })

  it('unknownSlot の decision の未知値を拒否する', () => {
    // answerSlot は decision が const の oneOf、unknownSlot だけが enum。
    // enum を広げる変異はここでしか捕まらない
    const d = valid()
    ;(d.steps[0].failures as Record<string, unknown>).unknown = { decision: 'maybe', text: 'x' }
    expect(validate(d).ok).toBe(false)
  })

  it('schemaVersion の const 違反を拒否する', () => {
    const d = valid()
    ;(d as Record<string, unknown>).schemaVersion = 2
    expect(validate(d).ok).toBe(false)
  })

  it('type の const 違反を拒否する', () => {
    const d = valid()
    ;(d as Record<string, unknown>).type = 'glossary'
    expect(validate(d).ok).toBe(false)
  })

  it('from のパターン違反を拒否する（actor_ 以外のプレフィクス）', () => {
    const d = valid()
    d.steps[0].from = 'step_Aaaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })

  it('to のパターン違反を拒否する（10文字に満たない）', () => {
    // steps は3種の形の union に推論され、self には to が無いのでキャストして代入する
    //（既存テストの delete (d.steps[0] as Record<string, unknown>).to と同じ理由）
    const d = valid()
    ;(d.steps[0] as Record<string, unknown>).to = 'actor_Aaaaaaaa1'
    expect(validate(d).ok).toBe(false)
  })
```

- [ ] **Step 2: 実行して全部緑であることを確認する**

Run: `npx vitest run src/modules/sequence/schema.test.ts`
Expected: PASS（スキーマは既にこれらを拒否しているはず。**もし赤があれば、それはスキーマの実欠陥なので、直さずに報告する**）

- [ ] **Step 3: スキーマを一時的に壊して、各系統のテストが赤くなることを確認する**

`schemas/sequence.schema.json` に対して、系統ごとに1つずつ・**1回に1変異だけ**入れて `npx vitest run src/modules/sequence/schema.test.ts` を回し、対応するテストだけが赤くなることを見る。終わるたびに `git checkout -- schemas/sequence.schema.json` で戻す:

1. 未知キー系: `$defs.sequenceActor` の `"additionalProperties": false` の行を削る → 「actors の項目の未知キーを拒否する」が赤
2. enum 系: `$defs.unknownSlot` の `"decision": { "enum": ["handled", "notApplicable"] }` に `"maybe"` を足す → 「unknownSlot の decision の未知値を拒否する」が赤
3. const 系: トップレベル `schemaVersion` の `"const": 1` を `"type": "number"` に替える → 「schemaVersion の const 違反を拒否する」が赤
4. pattern 系: `$defs.sequenceStep` の `from` の `"pattern"` を `"^.*$"` に替える → 「from のパターン違反を拒否する」が赤

- [ ] **Step 4: スキーマが戻っていることを確認して全量を回す**

Run: `git status --short`（`schemas/` に差分が無いこと）→ `npm test`
Expected: すべて緑

- [ ] **Step 5: コミット**

```bash
git add src/modules/sequence/schema.test.ts
git commit -m "test(sequence): schema.test の変異耐性の穴を塞ぐ——入れ子の未知キー・enum・const・pattern"
```

---

### Task 2: `currentDocument()` の「未選択」分岐

**Files:**
- Test: `src/core/app-controller.test.ts`（追記のみ）

**Interfaces:**
- Consumes: 既存の `createHarness` / `note()` / `p()` / `firstOutput()`（すべて同ファイル内に定義済み。`firstOutput` は関数宣言なのでファイル内のどこからでも呼べる）
- Produces: なし（テストのみ）

- [ ] **Step 1: テストを追記する**

`src/core/app-controller.test.ts` の末尾（`describe('出力: 整合性エラーが無いファイル', ...)` の後）に追記:

```typescript
describe('出力: ファイル未選択', () => {
  it('未選択では何もしない（コピーも保存ダイアログもモーダルも起きない）', async () => {
    const copyText = vi.fn<(text: string) => Promise<void>>().mockResolvedValue(undefined)
    const askSavePath = vi.fn<(defaultPath: string) => Promise<string | null>>().mockResolvedValue(null)
    const h = createHarness({ [p('a.json')]: note('A', '本文') }, { copyText, askSavePath })
    await h.controller.openFolder(DIR)
    // 「編集中データなし」分岐と観測を分ける（open-issues が記録していた重なり）——
    // 編集中データはあるのに選択が無い状況を作る。これで出力が止まる理由は
    // 選択が無いことの側に限定される。
    // なお currentDocument の `selectedPath === null` の early return 自体は、
    // その直後の `files.find` が selectedPath: null で必ず外れるため、行を消しても
    // 観測差が出ない（black-box では変異を検知できない）。このテストが固定するのは
    // 「未選択で出力操作を呼んでも無害」という挙動であって、特定の行ではない
    h.setDocument({ schemaVersion: 1, type: 'note', title: 'A', body: '編集中' })
    await h.controller.copyMarkdown(firstOutput(h))
    await h.controller.exportMarkdown(firstOutput(h))
    expect(copyText).not.toHaveBeenCalled()
    expect(askSavePath).not.toHaveBeenCalled()
    expect(h.modals()).toHaveLength(0)
    expect(h.banners().io).toBeNull()
  })
})
```

- [ ] **Step 2: 実行して緑を確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: このファイルの `it` がすべて緑。`copyMarkdown` / `exportMarkdown` は `await` しているので、途中で例外が飛べば `not.toHaveBeenCalled()` が偽の緑になる前にテスト自体が落ちる（`expect(fn).not.toHaveBeenCalled()` の教訓への対処はこの形で足りている）

- [ ] **Step 3: 変異確認**

`src/core/app-controller.ts` の `doCopyMarkdown` 内 `if (doc === null) return` を一時的にコメントアウト → 上のテストが赤くなることを確認 → `git checkout -- src/core/app-controller.ts` → 再実行で緑。赤くなる機構: `doc.data` 参照の TypeError は `try/catch` に捕まってバナー「クリップボードにコピーできませんでした」になるので、`expect(h.banners().io).toBeNull()` が落ちる（クラッシュではなくバナーで検知される）。

なお `currentDocument` の `if (selectedPath === null) return null` の行そのものは、上のコメントに書いたとおり消しても緑のまま（`files.find` が遮蔽している）。**これは想定どおりであり、直すべき欠陥ではない**——確認したら先へ進む。

- [ ] **Step 4: 全量を回してコミット**

Run: `npm test` → すべて緑

```bash
git add src/core/app-controller.test.ts
git commit -m "test(core): currentDocument の未選択分岐——出力操作が未選択で無害であることを固定する"
```

---

### Task 3: rescan の `switchingFolder > 0` ガード

**Files:**
- Test: `src/core/app-controller.test.ts`（追記のみ）

**Interfaces:**
- Consumes: `createHarness` / `note()` / `p()`。`h.io.scan` の差し替えパターンは既存テスト「スキャン中に別の openFolder が割り込んだら〜」と同じ形
- Produces: `describe('interleaving（走査・選択の直列化ガード）', ...)` ブロック（Task 4・5 が同じ describe に追記する）

- [ ] **Step 1: テストを追記する**

`src/core/app-controller.test.ts` の末尾（Task 2 で足した describe の後）に追記:

```typescript
describe('interleaving（走査・選択の直列化ガード）', () => {
  const DIR2 = 'C:\\proj2'
  const p2 = (name: string) => `${DIR2}\\${name}`

  /**
   * io.scan の呼び出しを1回だけ手動 Promise で止める差し込み。
   * capture: true は「呼ばれた時点のディスク」を即座に読んでおく（古い
   * スナップショットとして後から着地させるため）。false は release 時に読む
   */
  function deferNextScan(h: Harness, capture: boolean) {
    const realScan = h.io.scan
    const release: { current: (() => void) | null } = { current: null }
    const calls = { count: 0 }
    h.io.scan = (dir) => {
      calls.count++
      if (calls.count === 1) {
        // capture 時は呼ばれた瞬間に読む——release 時に読み直すと最新と同じ
        // 内容になり、「古い結果を捨てた」ことと区別できなくなる
        //（教訓「区別したい2つの実装が同じ答えを返す入力を選ばない」）
        const snapshot = capture ? realScan(dir) : null
        return new Promise((resolve) => {
          release.current = () => resolve(snapshot ?? realScan(dir))
        })
      }
      return realScan(dir)
    }
    return { release, calls }
  }

  it('フォルダ切替中に届いた監視イベントでは再走査しない（旧フォルダの通知や一覧上書きを出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p2('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    const { release, calls } = deferNextScan(h, false)
    // 新フォルダの走査が止まったまま＝切替中
    const opening = h.controller.openFolder(DIR2)
    // その間に旧フォルダで外部変更が起きて監視イベントが届く
    h.disk.files.set(p('c.json'), note('C'))
    const from = h.log.length
    await h.controller.externalChange()
    // 再走査ごと捨てる: io.scan は呼ばれず、一覧も通知も動かない。
    // ここを通すと、旧フォルダの「ファイルが増えました」が切替の最中に出たり、
    // 旧フォルダの内容が新しい一覧を上書きしたりする
    expect(calls.count).toBe(1)
    expect(h.log.slice(from)).not.toContain('setFiles')
    expect(h.log.slice(from)).not.toContain('toast')
    release.current?.()
    await expect(opening).resolves.toBe(true)
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
  })
})
```

`Harness` インターフェースは同ファイルに定義済み（`deferNextScan` の引数型に使う）。

- [ ] **Step 2: 実行して緑を確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: すべて緑

- [ ] **Step 3: 変異確認**

`src/core/app-controller.ts` の `rescan` 先頭 `if (switchingFolder > 0) return { kind: 'skipped' }` を一時的にコメントアウト → このテストが赤（`calls.count` が 2 になり、旧フォルダのトーストが出る）→ `git checkout -- src/core/app-controller.ts` → 緑。

- [ ] **Step 4: 全量を回してコミット**

Run: `npm test` → すべて緑

```bash
git add src/core/app-controller.test.ts
git commit -m "test(core): rescan の switchingFolder ガード——切替中の旧フォルダイベントを捨てる"
```

---

### Task 4: rescan の `token !== scanSeq || projectDir !== dir` ガード

**Files:**
- Test: `src/core/app-controller.test.ts`（Task 3 の describe に追記）

**Interfaces:**
- Consumes: Task 3 が定義した `deferNextScan(h, capture)` / `DIR2` / `p2`
- Produces: なし（テストのみ）

- [ ] **Step 1: テストを2本追記する**

Task 3 の `describe('interleaving（走査・選択の直列化ガード）', ...)` の中に追記:

```typescript
  it('遅れて着地した古い走査結果は捨てる（後続の再走査が作った新しい一覧を上書きしない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    const { release } = deferNextScan(h, true)
    // 古い走査（c.json をまだ知らないスナップショット）が止まっている
    const first = h.controller.externalChange()
    h.disk.files.set(p('c.json'), note('C'))
    // 新しい走査が先に着地して c.json を一覧へ足す
    await h.controller.externalChange()
    expect(h.files().map((f) => f.name)).toContain('c.json')
    const from = h.log.length
    release.current?.()
    await first
    // 古い結果が着地しても、c.json を「外部で削除された」ことにしない
    expect(h.files().map((f) => f.name)).toContain('c.json')
    expect(h.log.slice(from)).not.toContain('setFiles')
    expect(h.toasts().every((t) => !t.message.includes('削除されました'))).toBe(true)
  })

  it('旧フォルダの遅い走査結果が、切替後の新フォルダの一覧を上書きしない', async () => {
    const h = createHarness({ [p('a.json')]: note('A'), [p2('b.json')]: note('B') })
    await h.controller.openFolder(DIR)
    const { release } = deferNextScan(h, true)
    // 旧フォルダ A の走査が止まっている間に、B への切替が先に完了する
    const first = h.controller.externalChange()
    await h.controller.openFolder(DIR2)
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
    release.current?.()
    await first
    // A の走査結果（a.json）が B の一覧に混ざらない
    expect(h.files().map((f) => f.name)).toEqual(['b.json'])
    expect(h.toasts().every((t) => !t.message.includes('ファイルが増えました'))).toBe(true)
  })
```

**書けない側の記録**: ガードの `projectDir !== dir` 節だけを単独で赤くする入力は存在しない——`openFolder` も後続の `rescan` も必ず `scanSeq` を進めるので、dir が変わるときは常に token 節が先に捕まえる。dir 節は防御的な二重化であり、black-box では変異を検知できない。この事実を2本目のテストのコメントとして書き添えること（教訓「書かない判断をしたら、なぜ書けないかを記録する」）。

- [ ] **Step 2: 実行して緑を確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: すべて緑

- [ ] **Step 3: 変異確認（2段階）**

1. `rescan` の `if (token !== scanSeq || projectDir !== dir) return { kind: 'skipped' }` の行を丸ごとコメントアウト → **両方**のテストが赤 → 戻す
2. 同じ行を `if (projectDir !== dir) return { kind: 'skipped' }`（token 節だけ削る）に替える → 1本目（再走査どうし）だけが赤くなることを確認 → `git checkout -- src/core/app-controller.ts` → 緑。この2段階で「token 節が実際に仕事をしている」ことまで確かめる

- [ ] **Step 4: 全量を回してコミット**

Run: `npm test` → すべて緑

```bash
git add src/core/app-controller.test.ts
git commit -m "test(core): rescan の直列化トークン——古い走査結果の遅延着地を捨てる"
```

---

### Task 5: `handleSelectedGone` の `selectSeq++` ガード（＋`closeCurrentFile` の潜在クラッシュ修正）

**Files:**
- Test: `src/core/app-controller.test.ts`（Task 3 の describe に追記）
- Modify: `src/core/app-controller.ts` の `closeCurrentFile`（204〜219行付近）

**Interfaces:**
- Consumes: `createHarness` / `note()` / `p()`。saver の flush を止める口は `h.savers.current()`（`FakeSaver` は `flush` を単純代入で差し替えられる）
- Produces: なし（テストのみ＋内部関数の修正。公開 API は不変）

**計画時のコード読解で分かっている前提（実装者への申し送り）:** このテストは現行実装では **TypeError で落ちる**。`closeCurrentFile` は

```typescript
if (saver !== null) {
  if (!(await saver.flush())) return false
  saver.dispose()   // ← await の間に handleSelectedGone が saver = null にしていると、ここで null.dispose()
  saver = null
}
```

とクロージャ変数 `saver` を await の後に読み直しており、flush を待っている間に `handleSelectedGone`（や `deleteFile`）が `saver` を null に差し替えるとクラッシュする。これは「`ref` で過去の値を保持しない／判断に使う値は関数の中で引いて凍結する」（M5 の教訓）と同型の欠陥である。**Step 2 で赤（TypeError による reject）を確認してから Step 3 の最小修正を入れる。** もし Step 2 で TypeError にならず別の壊れ方をしたら、計画の読み違いなので直さずに報告する。

- [ ] **Step 1: 失敗するテストを書く**

Task 3 の describe の中に追記:

```typescript
  it('開いていたファイルが外部で消えたら、進行中の selectFile を捨てる（選び直さず、読み込みエラーも出さない）', async () => {
    const h = createHarness({ [p('a.json')]: note('A') })
    await h.controller.openFolder(DIR)
    await h.controller.selectFile(p('a.json'))
    // 2度目の selectFile を closeCurrentFile の flush で止める。selectFile が
    // selectedPath を持ったまま await しているのはこの窓だけ（read 待ちの間は
    // closeCurrentFile が先に選択を null にしている）ので、「進行中の selectFile が
    // ある状態で gone が着地する」interleaving はここでしか作れない
    const saver = h.savers.current()
    const releaseFlush: { current: (() => void) | null } = { current: null }
    saver.flush = () =>
      new Promise((resolve) => {
        releaseFlush.current = () => resolve(true)
      })
    const second = h.controller.selectFile(p('a.json'))
    // flush を待っている間に、外部で a.json が消えて検知が着地する
    h.disk.files.delete(p('a.json'))
    await h.controller.externalChange()
    expect(h.toasts().at(-1)?.message).toContain('外部で削除されました')
    expect(h.selectedPath()).toBeNull()
    releaseFlush.current?.()
    // ここが reject したら、closeCurrentFile が gone の後始末（saver = null）と
    // 衝突している（本タスクの修正対象）
    await second
    // selectSeq++ の仕事: 着地した selectFile は何もしない——消えたファイルを
    // 読みに行った失敗を「ファイルの読み込みに失敗しました」としてユーザーに出さない
    expect(h.selectedPath()).toBeNull()
    expect(h.document()).toBeNull()
    expect(h.banners().io).toBeNull()
  })
```

- [ ] **Step 2: 実行して失敗を確認する**

Run: `npx vitest run src/core/app-controller.test.ts -t '進行中の selectFile を捨てる'`
Expected: FAIL——`await second` が `TypeError: Cannot read properties of null (reading 'dispose')` で reject する

- [ ] **Step 3: `closeCurrentFile` を最小修正する**

`src/core/app-controller.ts` の `closeCurrentFile` を次に置き換える（JSDoc は既存のまま）:

```typescript
  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    // flush を待っている間に handleSelectedGone / deleteFile が saver を
    // 差し替える（null にする）ことがある。判断に使う値は関数の中で引いて
    // 凍結する（M5 の教訓）——自分が掴んだ saver の後始末だけを行い、
    // 差し替え後の値には触らない
    const current = saver
    if (current !== null) {
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!(await current.flush())) return false
      current.dispose()
      if (saver === current) saver = null
    }
    setSelected(null)
    host.setDocument(null)
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    // （クリア条件の由来は docs/history/m2-core-validation-layer.md の
    //  「saveError のクリア条件」。過去に取りこぼした障害の手がかりなので消さない）
    host.setBanner('save', null)
    return true
  }
```

`current.dispose()` が二重 dispose になる経路（gone 側が先に dispose 済み）は安全——`createAutoSaver` の `dispose` は `clearTimer()` と `pending = null` だけで冪等（`src/core/autosave.ts`）。`FakeSaver` も同様。

- [ ] **Step 4: 実行して緑を確認する**

Run: `npx vitest run src/core/app-controller.test.ts`
Expected: 追加分を含め、このファイルの `it` がすべて緑（既存の削除順序テスト・flush 失敗テストが緑のままであること＝修正が意味論を変えていない証拠）

- [ ] **Step 5: `selectSeq++` の変異確認**

`handleSelectedGone` 先頭の `selectSeq++` を一時的にコメントアウト → このテストが赤（`h.banners().io` に「ファイルの読み込みに失敗しました」が入る）→ `git checkout -- src/core/app-controller.ts` **は使えない**（Step 3 の修正まで消える）ので、コメントアウトを手で戻す → 緑。

- [ ] **Step 6: 全量を回してコミット**

Run: `npm test && npx tsc -b` → すべて緑

```bash
git add src/core/app-controller.ts src/core/app-controller.test.ts
git commit -m "fix(core): closeCurrentFile が flush 待ち中の saver 差し替えで落ちるのを直し、gone の selectSeq ガードを固定する"
```

---

### Task 6: 指摘バナーと額縁の配線（App の DOM テスト）

**Files:**
- Test: `src/App.dom.test.tsx`（追記のみ）

**Interfaces:**
- Consumes: 同ファイルの `disk`（vi.hoisted のモックディスク。`afterEach` が `disk.clear()` 済み）と、「名前の帯（M13）」describe が確立した「フォルダを開く→行を開く」手順
- Produces: なし（テストのみ）

見送りの前提（`listJsonFiles` が空配列固定）は M13 で消えている——`disk` にファイルを置けば選んだ状態を作れる。指摘の文言は `src/modules/glossary/consistency.ts` の `duplicate-name` ルールからの逐語コピー: `` `名称が重複しています: ${indices.map((i) => `「${terms[i].name}」`).join(' と ')}` `` → 同名2件なら `名称が重複しています: 「受注」 と 「受注」`。

- [ ] **Step 1: テストを追記する**

`src/App.dom.test.tsx` の末尾（`describe('額縁の帯', ...)` の後）に追記:

```tsx
/**
 * 指摘バナーと額縁の配線（M14 で各エディタから額縁へ寄せた分。M16）。
 * IssueBanner 単体・「各エディタが一覧を出さない」は別ファイルが押さえて
 * いるので、ここで固定するのは**両者を繋ぐ配線**だけ——App が selected.issues を
 * IssueBanner へ渡し、エディタの上（縦フレックスの前の兄弟）に置いていること
 */
describe('指摘バナーと額縁の配線（M14）', () => {
  const GLOSSARY_PATH = '/proj/用語集.json'
  const DUP_MESSAGE = '名称が重複しています: 「受注」 と 「受注」'
  const term = (id: string, name: string) => ({
    id,
    name,
    kind: 'undecided',
    definition: '',
    aliases: [],
    notes: '',
  })
  const putDuplicated = () => {
    disk.set(
      GLOSSARY_PATH,
      JSON.stringify({
        schemaVersion: 1,
        type: 'glossary',
        title: '重複あり',
        terms: [term('term_Aaaaaaaaa1', '受注'), term('term_Aaaaaaaaa2', '受注')],
      }),
    )
  }
  async function openDuplicated() {
    putDuplicated()
    render(<App />)
    fireEvent.click(screen.getByRole('button', { name: 'フォルダを開く' }))
    fireEvent.click(await screen.findByRole('button', { name: '重複あり（用語集.json） を開く' }))
    // エディタ（用語テーブル）の描画まで待つ
    return await screen.findByRole('table')
  }

  it('編集可能なファイルの指摘が額縁のバナーに1回だけ出る', async () => {
    await openDuplicated()
    // 編集可能なファイルであること（rejected の別パネルが出しているのではない）
    const band = screen.getByRole('textbox', { name: 'ファイルの名前' })
    expect(band.hasAttribute('readonly')).toBe(false)
    // 1回だけ＝エディタ側が同じ一覧を二重に出していない
    expect(screen.getAllByText(DUP_MESSAGE)).toHaveLength(1)
  })

  it('バナーはエディタより上にある', async () => {
    const table = await openDuplicated()
    const item = screen.getByText(DUP_MESSAGE)
    // 「縦フレックスの兄弟として上に出る」は jsdom ではレイアウトとして観測
    // できないので、その投影である DOM 順（バナー → エディタ）を固定する。
    // これが崩れる壊れ方＝バナーをエディタ内・エディタ下へ移す配線ミス
    expect(item.compareDocumentPosition(table) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })
})
```

- [ ] **Step 2: 実行して緑を確認する**

Run: `npx vitest run src/App.dom.test.tsx`
Expected: このファイルの `it` がすべて緑（既存テストが `disk` の後片付けに依存しているので、全部緑であることまで見る）

- [ ] **Step 3: 変異確認**

`src/App.tsx` の `<IssueBanner key={selected.path} issues={selected.issues} className="shrink-0" />` の行（749行付近）を一時的にコメントアウト → 両テストが赤 → `git checkout -- src/App.tsx` → 緑。

- [ ] **Step 4: 全量を回してコミット**

Run: `npm test` → すべて緑

```bash
git add src/App.dom.test.tsx
git commit -m "test(core): 指摘バナーと額縁の配線——editable なファイルで額縁が1回だけ出し、エディタの上に置く"
```

---

### Task 7: ドキュメントの完了処理

**Files:**
- Create: `docs/history/m16-test-homework.md`
- Modify: `docs/open-issues.md`
- Modify: `docs/README.md`（履歴表に M16 の行）
- （`docs/overview-rev.md` は**触らない**——本マイルストーンに設計判断の変更は無い。Task 5 の修正は既存設計「判断に使う値を凍結する」への追従であり、新しい決定ではない）

- [ ] **Step 1: `docs/history/m16-test-homework.md` を書く**

既存の history（例: `docs/history/m15-skill-hygiene.md`）の体裁に合わせ、次を含める:

- スコープ: open-issues「テストが無い箇所」の4件（残した3件——`FLUSH_MAX_ROUNDS`・`fileExists`・`ChoiceDialog`——は理由ごと据え置き）
- **見つかった欠陥**: `closeCurrentFile` が flush 待ち中の `saver` 差し替え（`handleSelectedGone` / `deleteFile`）で `null.dispose()` の TypeError になる潜在クラッシュ。テストを書く過程で計画段階のコード読解が予告し、実測で確認・修正した（Task 5）
- **書かなかったテストの記録**: `currentDocument` の `selectedPath === null` 行は `files.find` に遮蔽されて black-box では変異検知不能（挙動としては固定済み）／rescan ガードの `projectDir !== dir` 節は token 節に常に先取りされ単独では赤くできない（防御的二重化として存置）
- 実機確認: 本マイルストーンは全て自動テストで観測できる範囲であり、GUI の実機確認項目は無し（M15 の未実施分とは別件であることを明記）

- [ ] **Step 2: `docs/open-issues.md` を編集する**

- 「テストが無い箇所」から次の4項目を**削除**: `schema.test.ts` の変異耐性／interleaving 3分岐／`currentDocument()` の未選択分岐／指摘バナーと額縁の配線
- 「次に手を付ける候補」の 2.（app-controller の interleaving 3分岐）を削除し、残る候補の番号を詰める
- 新たに見つけた欠陥（`closeCurrentFile`）は**このマイルストーンで修正済みなので open-issues には足さない**（history に記録する）

- [ ] **Step 3: `docs/README.md` の履歴表に M16 の行を足す**

既存行の体裁に合わせて1行（M15 の次）。

- [ ] **Step 4: 検証してコミット**

Run: `npm test && npx tsc -b && npm run lint` → すべて緑

```bash
git add docs/history/m16-test-homework.md docs/open-issues.md docs/README.md
git commit -m "docs(m16): 申し送りを書き、open-issues と履歴表へ反映する"
```

---

## 完了後（人間側の作業を含む・CLAUDE.md「マージ後の後片付け」参照）

1. `sample-project/` に痕跡があれば捨てる（今回は触れない想定だが確認する: `git status --short` が空であること）
2. PR → マージ
3. 主チェックアウトで `git pull` → `npm install` → `npm test && npx tsc -b && npm run lint`
4. worktree の削除と残骸掃除（CLAUDE.md の手順どおり）
