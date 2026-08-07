# M5: 外部変更検知 実装計画

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** プロジェクトフォルダを監視し、外部（AI・エディタ・Git）がファイルを書き換え／追加／削除したときにアプリの表示とディスクを一致させる。未保存編集がなければ再読込＋トースト（「取り込み前に戻す」付き）、あれば二択ダイアログ。あわせて、走査時スナップショットに依存した新規作成のデータ喪失経路と、`flush()` が進行中の書き込みを取りこぼす穴を塞ぐ。

**Architecture:** 監視は Tauri の fs プラグインの `watch` を**フォルダ単位・非再帰**で張り、**イベントの種類は一切見ない**。何か起きたらフォルダを再走査し、「ディスクの生テキスト ≠ 台帳（アプリが最後に読み書きした内容）」の突き合わせだけで外部変更を判定する——これが自己書き込みの**構造的**除外になる（時間窓もフラグも使わないので、取りこぼしも誤検知もしない）。判定は純関数 `planExternalChange`（コア）に閉じ、`src/App.tsx` は「再走査 → 判断を貰う → 適用」の配線だけを持つ。取り込みは M1 で確定した `selectFile`（必ずディスクから読み直す）経路に合流させ、履歴を作り直すことが Undo 履歴の破棄そのものになる。

**Tech Stack:** Tauri 2（`tauri-plugin-fs` の `watch` feature）/ React 19 / TypeScript / Tailwind CSS v4 / shadcn|ui（Radix ベース）/ Vitest（＋jsdom）

## Global Constraints

これらは全タスクの要件に暗黙で含まれる。

- **正規形は1文字もずらさない**: キー順＝JSON Schema の properties 記載順から実行時導出（ハードコード禁止）／インデント＝スペース2／改行＝LF／末尾改行あり／BOM なし／非ASCII エスケープなし。書き込みは必ず `src/core/canonical.ts` の `serialize(value, schema)` を通す。**例外は「取り込み前に戻す」だけ**で、そこは退避した生バイトをそのまま書く（理由は後述の設計決定5）。
- **型定義は書かない**: `src/types/glossary.ts` はスキーマからの生成物（`.gitignore` 済み、`pretest` 等で自動再生成）。手書きの型と二重管理しない。
- **色値の直書き禁止**: 役割トークン（`ink` / `ink-muted` / `warning` / `warning-fg` / `ok` / `canvas` / `surface` / `rule`）だけを使う。値の確定は M7。
- **キー判定は `src/core/keyboard/keymap.ts` の `resolveCommand` ただ1箇所**。`e.key` をコア以外で直接見ない（Radix が内部で取る Esc は別）。修飾キーの表示名は `src/core/keyboard/platform.ts` を通す。
- **コアは Tauri を知らない**: `@tauri-apps/*` の import は `src/fs/**` にだけ置く。`src/core/**` は関数注入で受け取る。
- **モーダルを出す間は `KeyContext.modalOpen` を true にする**。配線点は3箇所（`src/App.tsx` の `globalKeyContext(modalOpenRef.current)`／`GlossaryEditor` の `onCellKeyDown`／`AliasCell`）。**`modalOpen` は ref 経由で読む**（keydown リスナーは依存配列 `[]` で1回しか張らないため。state 直読みに「簡潔化」しないこと）。
- **ファイル名は識別子ではない**（rev 5章）。判別は必ず中身の `type` で行う。
- **DOM テストは対象ファイル先頭の `// @vitest-environment jsdom` で切り替える**。グローバルの `test.environment` は `node` のまま。Vitest の `globals` は無効なので `afterEach(cleanup)` を明示する。要素は **role とアクセシブル名で引き**、クラス名やレイアウトに依存させない。
- **テストの追加先は `tsconfig.test.json`** が拾う（`src/**/*.test.ts` / `*.test.tsx`）。型チェックは `npx tsc -b tsconfig.test.json`。
- **lint 警告ゼロを維持する**（`npm run lint`）。`src/components/ui/**` と `src/types/**` は対象外・手で整形しない。
- **新しい Tauri の JS API を使うときは `src-tauri/capabilities/default.json` を必ず確認する**（M2 で `core:window:allow-destroy`、M5 で `fs:allow-watch` / `fs:allow-exists` を踏む）。**自前の `#[tauri::command]` は ACL 対象外**なので capabilities への追記は不要。
- **実機確認（`npm run tauri dev` の GUI 操作）は実装者が実行しない。** フォルダ選択ダイアログ・外部エディタでの保存・OS ゴミ箱・ウィンドウの × は自動化できないため、人間が全タスク完了後にまとめて行う（Task 11）。該当ステップは「未実施（人間が後で確認）」と報告し、代わりに `npm test` / `npx tsc -b tsconfig.test.json` / `npm run lint` / `npm run build` を必ず通しきること。
- **worktree で `npm run tauri dev` する前に、別チェックアウトの dev サーバーがポート5173を掴んでいないか確認する**（`Get-NetTCPConnection -LocalPort 5173`）。掴まれていると古いコードのアプリが表示される。
- **計画のコードは検証済みの正ではなく、レビューを通す前提の下書きである**（9節・10節の教訓）。矛盾・誤りを見つけたら「計画の矛盾」として報告し、辻褄合わせでテストを増やさないこと。

## M5 のスコープ（実装スコープ定義書 4節 / 8〜10節の申し送りより）

| 項目 | 出典 | 担当タスク |
| --- | --- | --- |
| フォルダ単位での監視（外部リネームも検知） | 4節 M5 / rev 3章 | Task 7・8 |
| 自己書き込みの除外（検知ループの構造的排除） | 4節 M5 / rev 3章 | Task 3（台帳）・Task 4（判定）・Task 8 |
| 未保存編集なし → 再読込＋トースト／Undo 履歴は破棄 | 4節 M5 / 9節 | Task 5・8 |
| 取り込み前の内容を退避し「取り込み前に戻す」を出す | 4節 M5 / rev 3章 | Task 5・8 |
| 未保存編集あり → 二択ダイアログ（マージ UI は作らない） | 4節 M5 / rev 3章 | Task 6・8 |
| 取り込み経路も `computeIssues` を通す（6本目） | 8節・10節 | Task 8 |
| 自己書き込み除外は autosave の現構造を前提に設計する | 8節 | Task 1・3 |
| **【データ喪失】新規作成が走査後に外部で増えたファイルを上書きする** | 10節 | Task 2 |
| 削除・新規作成も自己書き込み除外の対象 | 10節 | Task 3（台帳への記録）・Task 4 |
| 「外部で消えたファイル」の後始末（flush せずに閉じる） | 10節 | Task 8 |
| `flush()` が chain の静止を保証しない（close ゲートが write を残す） | 10節 | Task 1 |
| 削除確定後もそのファイルへの入力が止まっていない | 10節（①と②の両方） | Task 1（②）・Task 9（①） |
| `saveError` のクリア条件 ／ `ioError`・トーストの役割整理 | 8節・9節・10節 | Task 9 |
| `confirm` スロットが1つしかない（M5 が3人目の生産者） | 10節 | Task 6 |
| 別名パネルが外部変更に追随すること | 9節 | Task 10 |
| `forceClose()` の失敗が無音 ／ `destroy()` を固定するテストが無い | 10節「残件」 | Task 9 |
| `addCreatedFile` が同一パスを二重に足しうる | 10節「残件」 | Task 8 |

**M5 で扱わないもの**: Markdown 出力（M6）／デザイントークンの確定（M7。トースト・二択ダイアログの見た目も既存の役割トークンの流用で仮置き）／`move_to_trash` の同期実行によるウィンドウ固まり（10節「残件」。Cargo.toml は Task 7 で触るが、`async fn` 化は M5 の要件と無関係なので持ち込まない）／`checkConsistency` の全ファイル再実行（同）／`file-naming.ts` の Windows 予約デバイス名（ユーザー入力が届く経路が M5 でも増えないため。同）／`App.tsx` のテストハーネス（→ 設計決定11で方針だけ確定させる）。

## 完了条件

| # | 条件 | 検証経路 |
| --- | --- | --- |
| 1 | 外部で書き換えられた選択中ファイルが、未保存編集なしなら再読込され、トーストが出る（`git restore` で戻した内容が画面に反映される。9節の実害） | Task 4 のテスト（判断）＋ Task 11（実機） |
| 2 | 取り込み後は Undo 履歴が破棄されている（Ctrl+Z が外部の変更を巻き戻さない） | Task 8 の実装（`selectFile` 経由で `createHistory`）＋ Task 11 |
| 3 | トーストの「取り込み前に戻す」で、取り込み前の**バイト列**がディスクに戻る（`git diff` が空になる） | Task 5 のテスト（操作の発火）＋ Task 11 |
| 4 | 未保存編集がある状態の外部変更で二択ダイアログが出て、「自分の編集で上書き」で自分の内容が残り、「外部変更を取り込む」で外部の内容が表示される | Task 4・Task 6 のテスト ＋ Task 11（読み取り専用属性を使う手順） |
| 5 | アプリ自身の自動保存・新規作成・削除では外部変更として検知されない | Task 4 のテスト（台帳一致で差分ゼロ）＋ Task 11 |
| 6 | 開いているファイルが外部で消えたら選択が外れ、**書き戻されない** | Task 8 の実装（flush せず dispose）＋ Task 11 |
| 7 | 外部でファイルが増えたら一覧に出て、単一性違反の赤バッジが再計算される | Task 4 のテスト ＋ Task 11 |
| 8 | 走査後に外部で増えたファイルを新規作成が上書きしない | Task 2 のテスト（`exists` で連番回避） |
| 9 | 空フォルダを開いた後に Skill が用語集を書いた状態で「用語集を作る」を押しても、2つ目を作らずその用語集を開く | Task 8 の実装（押下時に再走査）＋ Task 11 |
| 10 | `flush()` が進行中の write を残したまま true を返さない | Task 1 のテスト |
| 11 | 削除を確定した後、そのファイルへの入力が saver に届かない | Task 9 の実装（trash の前に切り離す） |

## 設計上の決定（計画時に確定。実装者が再導出しなくて済むように）

1. **自己書き込みの除外は「台帳との内容比較」で行う。** 台帳＝`KnownDisk`（`src/core/known-disk.ts`）は「アプリが最後に読み書きしたディスクの内容」をパスごとに保持する。走査で読んだ生テキストが台帳と1バイトも違わなければ、それは自分の書き込みである。**時間窓（「書いてから N ms は無視」）やフラグは使わない**——遅れて届くイベントで誤検知し、速く届くイベントを取りこぼす。台帳は React の state ではなく **ref に置く**：書き込み成功の記録が再レンダリングを待つと、その隙に走った再走査が自分の書き込みを外部変更と誤検知する。
2. **監視イベントの種類・パスは見ない。** notify のイベント表現は OS ごとに違い、リネームは2イベントに割れる。「何か起きた」だけを受けてフォルダを再走査する。判定は 1 の突き合わせが全部やる。**アプリの書き込み経路は必ず台帳へ同時記録する**（`writeAndRecord`）ことがこの設計の唯一の前提条件。
3. **外部変更を検知した時点で、選択中ファイルの自動保存を止める**（`dispose()`）。取り込むか上書きするかを決める前にディスクが動くと判断の前提が壊れる。二択ダイアログは Radix のフォーカストラップの中なので、その間ユーザーは編集できない。再開は選択の確定時（取り込み＝`selectFile` が張り直す／上書き＝新しい baseline で張り直す）。
4. **取り込みは `selectFile` に合流させる。**——**申し送り9節は「取り込みは `applyEdit` の4本目の経路になる」と予告していたが、そのままでは成立しない。** `applyEdit` は「自動保存へ渡す」＋「履歴に record」だが、取り込みはディスクを正として**履歴を作り直す**（破棄する）操作であり、自動保存へ押し戻す必要もない。M1 で確定した「ファイル選択時は必ずディスクから読み直す」経路（`selectFile`）が、読み直し・`computeIssues`・saver の張り直し・`createHistory` を1本で揃える。**`applyEdit` を通るのは二択ダイアログの「自分の編集で上書き」側**（これが4本目）。
5. **退避（「取り込み前に戻す」）は生バイトをそのまま書き戻す。** 編集データを再シリアライズすると、非正規形のまま開いていたファイルで全行 diff が出て「変更履歴を仕様の変更履歴として読める」（rev 5章）が壊れる。生バイトなら `git diff` が空に戻る。取り込み後にファイルが `rejected` になった場合（外部変更がスキーマを壊した場合）でも同じ経路で戻せるのも生バイト方式の利点。
6. **`flush()` は「pending が空かつ chain が静止する」まで繰り返す（上限5回）。削除経路には `settle()` を新設する。** 10節が挙げた2つの直し方のうち②を採る。①（削除確定時に入力を切る）も Task 9 で入れる——②だけでは「待っている間に打鍵できる」構造自体は残るため。**`trashFile` の待ちは `flush()` から `settle()` へ移す**：ループ化した `flush()` は、失敗して復元された pending を書き直してしまい、「消したファイルを書き戻さない」という `trashFile` の保証を壊す。`settle()` は「進行中の write の完了を待つが、何も書かない」。
7. **バナーとトーストの役割を分ける。** バナー（`ioError` / `saveError`）は**いま続いている状態**（「このファイルはディスクに書けていない」「フォルダを読めていない」）。トーストは**起きた出来事**（外部変更を読み込んだ・戻した・ファイルが増えた／消えた）。この基準により `saveError` は「開いているファイルを離れたら消す」——`closeCurrentFile` の成功時・`openFolder`・削除・外部消滅でクリアする（8節から続く未決事項の決着）。
8. **二択ダイアログは Esc でもオーバーレイでも閉じない。** どちらの選択にも副作用があり、決めないまま閉じると「自分の編集も保存されず、外部変更も取り込まれない」宙ぶらりんが残る（3 により自動保存は止まっている）。Esc を「上書き」に割り当てると外部変更の破棄が最も押しやすいキーになるので、明示的な選択だけを受ける。
9. **モーダルはキューにする。** 生産者が3人（削除確認・破棄して閉じる・外部変更の二択）になるため。`key` を持つ要求は同じ `key` の先行要求を**置き換える**（同じファイルの外部変更が連続しても積み上がらない／閉じる操作の再試行が積み上がらない）。`modalOpen = キューが空でない`。
10. **トーストは shadcn の `sonner` を使わない。** `npx shadcn@latest add sonner` の生成物は `next-themes` を import する（Next.js 前提）ため、`src/components/ui/**` を手で書き換えるか新しい依存を足すかになる。リポジトリの規約は「生成物は手で整形しない」なので、どちらも規約と衝突する。rev 211 は「トーストのような汎用 UI に shadcn を使ってよい」と言っているだけで `sonner` を要求していない。自前の `ToastStack`（約60行、依存ゼロ、役割トークンのみ）で足りる。
11. **`App.tsx` のテストハーネスは作らず、コアへの切り出しを進める**（10節の残件が求めた判断）。M5 の判断ロジックは全部 `planExternalChange`（純関数）に出し、App には「呼んで適用する」だけを残す。App のテストが無いことは残件として据え置く（次に App の配線が増えるときに再判断）。
12. **限界の明示（実装者もレビュアーも直そうとしないこと）**: 取り込みと in-flight write の競合は残る。外部が書いた直後・監視イベントが届く前にアプリの write が着地すると、外部変更はその時点で既に上書きされており、再走査は自分の内容を読む（＝差分ゼロで何も起きない）。アプリ側に**ファイルロックが無い**以上これは避けられず、二択ダイアログの「自分の編集で上書き」と同じ結末なので、失われるのは「どちらを残すか選ぶ機会」だけである。窓を狭めるための追加機構（ロック・世代番号）は M5 では作らない。

---

### Task 1: autosave の意味論を固める（`flush` の静止保証 / `settle` / `hasUnsaved`）

M5 の全部がこのファイルの意味論に乗る。**外部変更の二択判定（未保存編集があるか）はここが答える**し、close のゲートが write を残したまま通る穴（10節）もここにある。先に固めないと、後続タスクが誤った前提の上に乗る。

**Files:**
- Modify: `src/core/autosave.ts`
- Modify: `src/core/autosave.test.ts`（末尾に4件追加）
- Modify: `src/core/file-ops.ts:64-79`（`trashFile` の待ちを `flush` から `settle` へ）
- Modify: `src/core/file-ops.test.ts:81-99`（順序の期待値）

**Interfaces:**
- Consumes: なし（このファイルは React も Tauri も知らない純ロジック）
- Produces:
  - `AutoSaver.flush(): Promise<boolean>` — 意味論を変更。「pending が空かつ chain が静止する」まで最大 `FLUSH_MAX_ROUNDS` 回繰り返す。true＝書き残しなし
  - `AutoSaver.settle(): Promise<void>` — 新設。進行中の write の完了だけを待つ（**何も書かない**）
  - `AutoSaver.hasUnsaved(): boolean` — 新設。`latest !== lastSaved`（デバウンス中・in-flight・失敗して再試行待ちのいずれも true）
  - `trashFile(opts: { path, saver: { dispose(): void; settle(): Promise<void> } | null, trash })` — `saver` の要求メソッドが `flush` から `settle` に変わる

---

- [ ] **Step 1: 失敗するテストを書く**

Modify `src/core/autosave.test.ts` — ファイル末尾の `})`（`describe` の閉じ）の**直前**に追加する。あわせて、`describe` の先頭（`afterEach` の後）に共通ヘルパを追加する:

```ts
  /** 呼び出しごとに独立した deferred を返す write（in-flight を外から解決するため） */
  function deferredWrites() {
    const calls: string[] = []
    const settlers: { resolve: () => void; reject: (err: unknown) => void }[] = []
    const write = vi.fn((text: string) => {
      calls.push(text)
      return new Promise<void>((resolve, reject) => {
        settlers.push({ resolve, reject })
      })
    })
    return { write, calls, settlers }
  }
```

追加するテスト:

```ts
  it('flush は await 中にタイマー発火で積まれた write も待つ（chain の静止保証）', async () => {
    const io = deferredWrites()
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write: io.write })
    saver.update('B')
    await vi.advanceTimersByTimeAsync(500)
    expect(io.calls).toEqual(['B']) // write('B') が in-flight

    let flushed: boolean | null = null
    const flushing = saver.flush().then((ok) => {
      flushed = ok
    })
    // flush が write('B') を待っている間に、次の編集のデバウンスが発火する
    saver.update('C')
    await vi.advanceTimersByTimeAsync(500)
    io.settlers[0].resolve() // write('B') 完了 → write('C') が飛ぶ
    await vi.advanceTimersByTimeAsync(0)
    expect(io.calls).toEqual(['B', 'C'])
    // 修正前はここで true を返して終わっていた（write('C') を残したまま
    // ウィンドウを destroy しうる経路。申し送り10節）
    expect(flushed).toBeNull()

    io.settlers[1].resolve()
    await flushing
    expect(flushed).toBe(true)
  })

  it('settle は進行中の write の完了を待つが、保留中の内容は書かない', async () => {
    const io = deferredWrites()
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write: io.write })
    saver.update('B')
    await vi.advanceTimersByTimeAsync(500)
    saver.update('C') // pending に入る（タイマーは 500ms 後）
    let settled = false
    const settling = saver.settle().then(() => {
      settled = true
    })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false) // write('B') が着地するまで返らない
    io.settlers[0].resolve()
    await settling
    expect(settled).toBe(true)
    expect(io.calls).toEqual(['B']) // settle は書かないので 'C' は飛んでいない
  })

  it('hasUnsaved はディスクに書けていない編集の有無を返す（外部変更の二択判定に使う）', async () => {
    const write = vi.fn(() => Promise.resolve())
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    expect(saver.hasUnsaved()).toBe(false)
    saver.update('B')
    expect(saver.hasUnsaved()).toBe(true) // デバウンス中
    await vi.runAllTimersAsync()
    expect(saver.hasUnsaved()).toBe(false) // 書けたら false
  })

  it('write が失敗している間は hasUnsaved が true のまま', async () => {
    const write = vi.fn(() => Promise.reject(new Error('disk full')))
    const saver = createAutoSaver({ delayMs: 500, baseline: 'A', write })
    saver.update('B')
    await saver.flush()
    expect(saver.hasUnsaved()).toBe(true)
  })
```

- [ ] **Step 2: テストを走らせて落ちることを確認する**

Run: `npm test -- src/core/autosave.test.ts`
Expected: FAIL。`saver.settle is not a function` / `saver.hasUnsaved is not a function`、および「flush は await 中に…」が `expect(flushed).toBeNull()` で `true` を受けて落ちる（これが修正対象の穴そのもの）。

- [ ] **Step 3: `autosave.ts` を実装する**

Modify `src/core/autosave.ts` — `AutoSaver` インターフェースを差し替える:

```ts
export interface AutoSaver {
  update(text: string): void
  /**
   * 保留中の書き込みを即時実行し、**書き込みが静止するまで**待つ。
   * true＝書き残しなし（成功または書くものが無い）。
   * 単に「その時点の chain」を await するだけでは足りない——await 中に
   * デバウンスタイマーが発火すると commit() が chain を再代入し、古いリンクで
   * 解決してしまう（進行中の write を残したまま close のゲートを通る。申し送り10節）
   */
  flush(): Promise<boolean>
  /**
   * 進行中の書き込みの完了だけを待つ。**保留中の内容は書かない。**
   * 削除経路（file-ops の trashFile）が「消すファイルへ書かせずに、
   * 既に飛んだ write の着地を待つ」ために使う
   */
  settle(): Promise<void>
  /** ディスクに書けていない編集があるか（デバウンス中・in-flight・失敗して再試行待ち） */
  hasUnsaved(): boolean
  dispose(): void
}
```

`createAutoSaver` の中身に追加・変更する。`const clearTimer` の上に定数を置く:

```ts
/**
 * flush / settle の打ち切り回数。write 失敗時は catch が pending を復元して
 * 再試行するため、無条件に「静止するまで」回すと恒久的な書き込み不能（権限・
 * ロック）で無限ループになる。commit() はタイマーを待たず即時に書くので、
 * 人間の打鍵速度で5回を使い切ることは実質ない
 */
const FLUSH_MAX_ROUNDS = 5
```

`return { ... }` の `flush` を置き換え、`settle` と `hasUnsaved` を足す:

```ts
    async flush() {
      for (let round = 0; round < FLUSH_MAX_ROUNDS; round++) {
        const target = commit()
        await target
        // await 中にタイマーが発火していれば chain は別物に差し替わっている。
        // write が失敗していれば catch が pending を復元している（＝再試行）
        if (pending === null && chain === target) return true
      }
      // 打ち切り。書き残しの有無が確定しないので false を返す——close のゲートは
      // 閉じない側に倒すのが安全（脱出口は App 側の「破棄して閉じる」）
      return false
    },
    async settle() {
      for (let round = 0; round < FLUSH_MAX_ROUNDS; round++) {
        const target = chain
        await target
        if (chain === target) return
      }
    },
    hasUnsaved() {
      // lastSaved はディスク確定値、latest は直近に要求された内容
      return latest !== lastSaved
    },
```

- [ ] **Step 4: テストが通ることを確認する**

Run: `npm test -- src/core/autosave.test.ts`
Expected: PASS（既存の16件＋追加の4件）。特に「write が失敗し続けたら flush は false を返す」が引き続き通ること——ループ化で write の呼び出し回数は増えるが、そのテストは回数を見ていない。

- [ ] **Step 5: `trashFile` の待ちを `settle` に移す**

Modify `src/core/file-ops.ts` — `trashFile` の JSDoc の 2 と 3 の項、および実装を差し替える。手順は `dispose()` → `await settle()` → `dispose()` → `await trash()`:

```ts
/**
 * ファイルを OS のゴミ箱へ移す。
 *
 * 開いているファイルなら、自動保存を止めてからゴミ箱へ移す。手順は
 * `dispose()` → `await settle()` → `dispose()` → `await trash()` で、3つの
 * 事故をこの順序でしか塞げない。
 *
 * 1. **書き戻しによる復活を防ぐ**: 先に `dispose()` して `pending` を空にする。
 *    以降このファイルへ書くものは存在しない。
 * 2. **着地済みの write を待つ**: `dispose()` はタイマーと `pending` しか消さず、
 *    既に飛んだ write（autosave 内部の `chain`）には触れない。デバウンスは 500ms で、
 *    確認ダイアログを開いて押す人間の所要時間はそれより長いので、削除確定時は
 *    **ほぼ常に write が in-flight**。待たずに `trash()` すると、ゴミ箱移動の後に
 *    write が着地してファイルを作り直す——UI の一覧からは消えているので、
 *    次のフォルダ走査まで見えない孤児になる。`settle()` がその待ちで、
 *    **書かずに待つ**のが要点。M4 までは「pending を空にした flush()」で
 *    同じことをしていたが、M5 で flush() が「静止するまで繰り返す」意味論に
 *    なったため、失敗して復元された pending を書き直してしまう。
 *    **ここを flush() に戻さないこと。**
 * 3. **失敗した write の復元を捨てる**: in-flight の write が失敗すると autosave の
 *    catch が内容を `pending` へ戻す（再試行のための仕組み）。消すファイルには
 *    不要なので `dispose()` をもう一度呼んで捨てる。
 *
 * 順序も逆にできない——先にゴミ箱へ移すと、その直後にデバウンスタイマーが
 * 発火して同じことが起きる。
 *
 * この結果、ゴミ箱への移動が失敗した場合はデバウンス窓（500ms）内の編集が失われる。
 * 「このファイルを消す」という明示的な操作の副作用としては許容する
 */
export async function trashFile(opts: {
  path: string
  /** 対象が現在開いているファイルのときだけ渡す（実体は AutoSaver） */
  saver: { dispose(): void; settle(): Promise<void> } | null
  trash: (path: string) => Promise<void>
}): Promise<void> {
  const saver = opts.saver
  if (saver !== null) {
    saver.dispose()
    // 進行中の write の完了待ち（書かずに待つ）
    await saver.settle()
    // 失敗した write が復元した pending を捨てる
    saver.dispose()
  }
  await opts.trash(opts.path)
}
```

- [ ] **Step 6: `trashFile` のテストを合わせる**

Modify `src/core/file-ops.test.ts` — 1件目のテスト（`自動保存を破棄してからゴミ箱へ移す`）を差し替える:

```ts
  it('自動保存を破棄してからゴミ箱へ移す（dispose が先なので settle は何も書かない）', async () => {
    const order: string[] = []
    const saver = {
      settle: vi.fn(async () => {
        order.push('settle')
      }),
      dispose: vi.fn(() => order.push('dispose')),
    }
    const trash = vi.fn(async () => {
      order.push('trash')
    })
    await trashFile({ path: 'C:\\proj\\用語集.json', saver, trash })
    // dispose が先。pending を消してから待つので「書き戻して復活」は起きない。
    // settle は進行中の write の完了を待つためだけに呼ぶ（書くためではない）。
    // 2度目の dispose は、失敗した write が catch で復元した pending を捨てるため。
    // ゴミ箱へ移すのは常に最後（先に移すと直後のデバウンス発火で同じことが起きる）
    expect(order).toEqual(['dispose', 'settle', 'dispose', 'trash'])
  })
```

残りの2件（`実物の AutoSaver と合成` / `失敗しても復元された pending を書き残さない`）は実物の `createAutoSaver` を使っているので**変更不要**。3件目のコメントにある「後続の flush が…」は `settle` に読み替えられるので、文言だけ `flush` → `settle` に直す。

- [ ] **Step 7: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint`
Expected: すべて PASS／警告ゼロ。`src/App.tsx` は `AutoSaver` を渡しているだけなので変更不要（`settle` が増えても構造的部分型として通る）。

- [ ] **Step 8: コミット**

```bash
git add src/core/autosave.ts src/core/autosave.test.ts src/core/file-ops.ts src/core/file-ops.test.ts
git commit -m "M5: flush を chain の静止まで待たせ、削除経路に settle を新設"
```

---

### Task 2: `exists` による名前解決（走査後に増えたファイルを上書きしない）

**申し送り10節が「データ喪失。M5 で必ず塞ぐ」と指定した項目。** 現状 `createFile` は衝突回避の名前を走査時スナップショット（`existingNames`）だけから決めるが、`writeTextFile` は既存ファイルを切り詰めて書く。踏む手順は本プロジェクト自身のワークフローそのもの（空フォルダを開く → Skill が `用語集.json` を書く → アプリの空状態から「用語集を作る」→ Skill の用語集が空の用語集に置き換わる）。確認もエラーも出ない。

監視（Task 7・8）が入れば窓は縮むが**それだけでは塞がらない**——監視は取りこぼしうるし、走査直後の作成でも競合する。ディスクへの問い合わせは監視とは別に要る。

**Files:**
- Modify: `src/core/file-naming.ts`
- Modify: `src/core/file-naming.test.ts`（全面書き換え）
- Modify: `src/core/new-file.ts`（`buildNewFile` が解決済みの名前を受け取る形に）
- Modify: `src/core/new-file.test.ts`
- Modify: `src/core/file-ops.ts`（`FileIo` に `exists`、`createFile` の名前解決）
- Modify: `src/core/file-ops.test.ts`
- Modify: `src/fs/project-fs.ts`（`fileExists`）
- Modify: `src/fs/project-fs.test.ts`（モックに `exists` を追加）
- Modify: `src-tauri/capabilities/default.json`（`fs:allow-exists`）
- Modify: `src/App.tsx`（`createFile` / `ensureFileOfType` の呼び出しに `exists` を渡す）

**Interfaces:**
- Consumes: `serialize(value, schema)`（`src/core/canonical.ts`）、`AnyToolModule`
- Produces:
  - `fileNameCandidate(baseName: string, n: number): string`
  - `resolveAvailableFileName(baseName: string, isTaken: (name: string) => boolean | Promise<boolean>): Promise<string>`
  - `MAX_NAME_CANDIDATES: number`
  - `buildNewFile(module: AnyToolModule, name: string): NewFile` — **第2引数が `existingNames` から解決済み `name` に変わる**
  - `FileIo.exists: (path: string) => Promise<boolean>`
  - `fileExists(path: string): Promise<boolean>`（`src/fs/project-fs.ts`）
  - `resolveNewFileName` は**削除**（同期版は誰も呼ばなくなる。残すと「スナップショットだけで決める」入口が残る）

---

- [ ] **Step 1: 失敗するテストを書く（名前解決）**

Replace `src/core/file-naming.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { fileNameCandidate, MAX_NAME_CANDIDATES, resolveAvailableFileName } from './file-naming'

describe('fileNameCandidate', () => {
  it('1件目は連番を付けない', () => {
    expect(fileNameCandidate('用語集', 1)).toBe('用語集.json')
  })

  it('2件目以降は連番を足す', () => {
    expect(fileNameCandidate('用語集', 2)).toBe('用語集-2.json')
    expect(fileNameCandidate('用語集', 10)).toBe('用語集-10.json')
  })

  it('ファイル名に使えない文字を落とす', () => {
    expect(fileNameCandidate('用語:集/一覧', 1)).toBe('用語_集_一覧.json')
  })
})

describe('resolveAvailableFileName', () => {
  it('空いていれば連番なしの名前を返す', async () => {
    await expect(resolveAvailableFileName('用語集', () => false)).resolves.toBe('用語集.json')
  })

  it('使われている名前を飛ばして連番を進める', async () => {
    const taken = new Set(['用語集.json', '用語集-2.json'])
    await expect(resolveAvailableFileName('用語集', (n) => taken.has(n))).resolves.toBe(
      '用語集-3.json',
    )
  })

  it('isTaken が Promise を返してもよい（ディスクへの問い合わせを渡すため）', async () => {
    const isTaken = vi.fn(async (name: string) => name === '用語集.json')
    await expect(resolveAvailableFileName('用語集', isTaken)).resolves.toBe('用語集-2.json')
    expect(isTaken).toHaveBeenCalledTimes(2)
  })

  it('候補を使い切ったら投げる（無限ループにしない）', async () => {
    const isTaken = vi.fn(() => true)
    await expect(resolveAvailableFileName('用語集', isTaken)).rejects.toThrow(
      /ファイル名の候補が尽きました/,
    )
    expect(isTaken).toHaveBeenCalledTimes(MAX_NAME_CANDIDATES)
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/file-naming.test.ts`
Expected: FAIL（`fileNameCandidate` / `resolveAvailableFileName` が export されていない）

- [ ] **Step 3: `file-naming.ts` を実装する**

Replace `src/core/file-naming.ts`:

```ts
/**
 * 新規ファイルの名前解決（コア・純ロジック）。
 * ファイル名は識別子ではない（rev 5章。判別は中身の type で行う）ため、
 * ここでの目的は「意味を持たせること」ではなく「既存と衝突しないこと」だけ。
 * 人間が後からエクスプローラで自由にリネームしてよい。
 */

/** Windows で使えない文字。macOS/Linux でも避けて構わないので一律で落とす */
const ILLEGAL = /[\\/:*?"<>|]/g

/** 打ち切り回数。ディスクへの問い合わせを含むので無限には試さない */
export const MAX_NAME_CANDIDATES = 100

/** n 番目の候補名（1件目は連番なし）。連番の付け方をここ1箇所に閉じる */
export function fileNameCandidate(baseName: string, n: number): string {
  const base = baseName.replace(ILLEGAL, '_')
  return n === 1 ? `${base}.json` : `${base}-${n}.json`
}

/**
 * 空いているファイル名を1つ返す。
 *
 * **`isTaken` にはディスクへの問い合わせを含めること。** 走査時のスナップショット
 * だけで決めると、走査後に外部で増えたファイル（Skill が書いた用語集など）を
 * 黙って上書きする——確認もエラーも出さずに他人のファイルを消す経路になる
 * （申し送り10節のデータ喪失）。判定が非同期なので、この関数自体も非同期
 */
export async function resolveAvailableFileName(
  baseName: string,
  isTaken: (name: string) => boolean | Promise<boolean>,
): Promise<string> {
  for (let n = 1; n <= MAX_NAME_CANDIDATES; n++) {
    const name = fileNameCandidate(baseName, n)
    if (!(await isTaken(name))) return name
  }
  throw new Error(
    `ファイル名の候補が尽きました（${MAX_NAME_CANDIDATES} 件試行）: ${baseName}`,
  )
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/file-naming.test.ts`
Expected: PASS（9件）

- [ ] **Step 5: `buildNewFile` を解決済みの名前を受け取る形にする**

Modify `src/core/new-file.ts` — `resolveNewFileName` の import を消し、シグネチャを変える:

```ts
import { serialize } from './canonical'
import type { AnyToolModule } from './registry'

export interface NewFile {
  /** 拡張子込みのファイル名（プロジェクトフォルダ直下） */
  name: string
  /** 書き込むテキスト。必ず正規形（スコープ定義書3節） */
  text: string
  /** text と同じ内容のデータ。一覧へ即反映するために返す */
  data: unknown
}

/**
 * 新規ファイルの中身を組み立てる（コア・純関数。ファイルには触らない）。
 * 名前は**解決済みのものを受け取る**——空いている名前の判定はディスクへの
 * 問い合わせを含む非同期処理（file-ops の createFile）に移した。
 * 正規形での書き出しは新規作成にも例外なく適用する——非正規形で作ると、
 * 作った直後の最初の1文字の編集で全行 diff が出る
 */
export function buildNewFile(module: AnyToolModule, name: string): NewFile {
  const title = name.replace(/\.json$/i, '')
  const data = module.createEmpty(title)
  return { name, text: serialize(data, module.schema), data }
}
```

Replace `src/core/new-file.test.ts`（連番の検証は `resolveAvailableFileName` 側へ移ったので落とし、正規形とスキーマ適合の検証はそのまま残す）:

```ts
import { describe, expect, it } from 'vitest'
import { serialize } from './canonical'
import { buildNewFile } from './new-file'
import { createSchemaValidator } from './schema-validation'
import { glossaryModule } from '@/modules/glossary/module'

describe('buildNewFile', () => {
  it('渡されたファイル名をそのまま使う', () => {
    expect(buildNewFile(glossaryModule, '用語集.json').name).toBe('用語集.json')
  })

  it('title は拡張子を除いたファイル名と一致する', () => {
    const file = buildNewFile(glossaryModule, '用語集-2.json')
    expect((file.data as { title: string }).title).toBe('用語集-2')
  })

  it('作ったテキストはスキーマ検証を通る（＝作った直後に開ける）', () => {
    const file = buildNewFile(glossaryModule, '用語集.json')
    const validate = createSchemaValidator(glossaryModule.schema)
    expect(validate(JSON.parse(file.text))).toEqual({ ok: true, errors: [] })
  })

  it('作ったテキストは正規形（読み直して書き直してもバイト一致）', () => {
    const file = buildNewFile(glossaryModule, '用語集.json')
    expect(serialize(JSON.parse(file.text), glossaryModule.schema)).toBe(file.text)
  })

  it('キー順はスキーマの properties 記載順・インデント2・末尾改行あり', () => {
    expect(buildNewFile(glossaryModule, '用語集.json').text).toBe(
      '{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "用語集",\n  "terms": []\n}\n',
    )
  })
})
```

- [ ] **Step 6: `createFile` の名前解決をディスクに問い合わせる**

Modify `src/core/file-ops.ts` — import と `FileIo` と `createFile` を差し替える:

```ts
import { resolveAvailableFileName } from './file-naming'
import { buildNewFile, type NewFile } from './new-file'
import type { AnyToolModule } from './registry'

/** ファイル入出力の注入口。コアは Tauri を知らない（実体は src/fs/project-fs.ts） */
export interface FileIo {
  join: (dir: string, name: string) => Promise<string>
  write: (path: string, text: string) => Promise<void>
  /**
   * そのパスにファイルがあるか。**名前解決をディスクに問い合わせるために要る**——
   * 走査時のスナップショットだけで決めると、走査後に外部で増えたファイルを
   * 黙って上書きする（申し送り10節のデータ喪失）
   */
  exists: (path: string) => Promise<boolean>
}
```

```ts
/**
 * 新規ファイルを作る（額縁の新規作成。rev 6章）。
 * 失敗は投げる——呼び出し側が「一覧に足す」前に止まる必要があるため
 *（書けていないファイルを一覧に出すと、選んだ瞬間に読み込み失敗になる）。
 *
 * 名前は**走査スナップショットとディスクの両方**に問い合わせて決める。
 * スナップショット（existingNames）だけでは走査後に外部で増えたファイルを
 * 上書きし、ディスクだけでは「一覧にあるが読めなかったファイル」を見落とす
 */
export async function createFile(
  opts: FileIo & {
    dir: string
    module: AnyToolModule
    /** フォルダ直下の既存ファイル名（走査時点）。衝突回避にだけ使う */
    existingNames: readonly string[]
  },
): Promise<CreatedFile> {
  // Windows のファイル名は大文字小文字を区別しないので、比較も区別しない
  const taken = new Set(opts.existingNames.map((n) => n.toLowerCase()))
  const name = await resolveAvailableFileName(opts.module.displayName, async (candidate) => {
    if (taken.has(candidate.toLowerCase())) return true
    return opts.exists(await opts.join(opts.dir, candidate))
  })
  const file = buildNewFile(opts.module, name)
  const path = await opts.join(opts.dir, name)
  await opts.write(path, file.text)
  return { ...file, path }
}
```

`ensureFileOfType` は `FileIo` を継承しているので `exists` がそのまま通る。JSDoc に1行足す:

```ts
 * **呼び出し側は「再走査した直後の一覧」を渡すこと**（M5 の handleExternalChange）。
 * 古いスナップショットを渡すと、外部で増えた用語集を見落として2つ目を作る
 *（データ喪失にはならない——名前解決はディスクを見るので上書きはしない——が、
 *   単一性違反を1件増やす）
```

- [ ] **Step 7: `createFile` のテストに「上書きしない」回帰テストを足す**

Modify `src/core/file-ops.test.ts` — `const join = ...` の下にヘルパを足し、`describe('createFile')` を差し替える:

```ts
const join = async (dir: string, name: string) => `${dir}\\${name}`
/** ディスク上に存在するパスの集合から exists を作る */
const existsIn = (paths: readonly string[]) => async (path: string) => paths.includes(path)

describe('createFile', () => {
  it('正規形のテキストを衝突しないパスへ書く', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: ['用語集.json'],
      join,
      write,
      exists: existsIn([]),
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(created.name).toBe('用語集-2.json')
    expect(write).toHaveBeenCalledWith('C:\\proj\\用語集-2.json', created.text)
    expect(created.text.endsWith('\n')).toBe(true)
  })

  it('走査後に外部で増えたファイルを上書きしない（申し送り10節のデータ喪失）', async () => {
    const write = vi.fn().mockResolvedValue(undefined)
    // 一覧は空（走査時点のスナップショット）だが、ディスクには Skill が書いた
    // 用語集がある。existingNames だけで決めると、これを切り詰めて書き潰す
    const created = await createFile({
      dir: 'C:\\proj',
      module: glossaryModule,
      existingNames: [],
      join,
      write,
      exists: existsIn(['C:\\proj\\用語集.json']),
    })
    expect(created.path).toBe('C:\\proj\\用語集-2.json')
    expect(write).not.toHaveBeenCalledWith('C:\\proj\\用語集.json', expect.anything())
  })

  it('書き込みが失敗したら例外を投げる（呼び出し側が一覧に足さないため）', async () => {
    const write = vi.fn().mockRejectedValue(new Error('書けません'))
    await expect(
      createFile({
        dir: 'C:\\proj',
        module: glossaryModule,
        existingNames: [],
        join,
        write,
        exists: existsIn([]),
      }),
    ).rejects.toThrow('書けません')
  })
})
```

`describe('ensureFileOfType')` の各呼び出しにも `exists: existsIn([])`（既存ファイルを持つケースでは対応するパス）を足す。**型エラーが出た箇所すべてに機械的に足すこと**（`exists` は必須プロパティ）。

- [ ] **Step 8: fs 層に `fileExists` を足す**

Modify `src/fs/project-fs.ts` — import に `exists` を足し、関数を追加する:

```ts
import { exists, readDir, readTextFile, writeTextFile } from '@tauri-apps/plugin-fs'
```

```ts
/**
 * そのパスにファイル（またはフォルダ）があるか。
 * 新規作成の名前解決をディスクに問い合わせるために使う（コアの FileIo.exists）。
 * `fs:default` に `exists` は入っていないので capabilities に
 * `fs:allow-exists` の追記が要る
 */
export async function fileExists(path: string): Promise<boolean> {
  return exists(path)
}
```

Modify `src/fs/project-fs.test.ts` — `vi.mock('@tauri-apps/plugin-fs', ...)` に `exists: vi.fn()` を足す（**モックに無い import があると読み込み時に落ちる**。M4 の計画で踏んだ誤り1と同じ罠）。

- [ ] **Step 9: capabilities に `fs:allow-exists` を足す**

Modify `src-tauri/capabilities/default.json` — `permissions` の `fs:allow-write-text-file` の後に `"fs:allow-exists"` を追加し、`description` を更新する:

```json
  "description": "既定の権限。fs はコマンド許可のみで、パスの scope はダイアログで選んだフォルダ（recursive）に実行時付与される。core:window:allow-destroy は close 横取り（onCloseRequested → preventDefault → flush → destroy）に必要。fs:allow-exists は新規作成の名前解決をディスクに問い合わせるため（M5）",
```

- [ ] **Step 10: App の呼び出しに `exists` を渡す**

Modify `src/App.tsx`:
- import に `fileExists` を足す（`@/fs/project-fs` から）
- `createNewFile` の `createFile({ ... })` に `exists: fileExists,` を足す
- `ensureGlossary` の `ensureFileOfType({ ... })` に `exists: fileExists,` を足す

- [ ] **Step 11: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint; npm run build`
Expected: すべて PASS／警告ゼロ。

- [ ] **Step 12: コミット**

```bash
git add src/core/file-naming.ts src/core/file-naming.test.ts src/core/new-file.ts src/core/new-file.test.ts src/core/file-ops.ts src/core/file-ops.test.ts src/fs/project-fs.ts src/fs/project-fs.test.ts src-tauri/capabilities/default.json src/App.tsx
git commit -m "M5: 新規ファイルの名前解決をディスクに問い合わせる（走査後に増えたファイルを上書きしない）"
```

---

### Task 3: 走査の1本化（`scanFolder`）と「ディスクの既知内容」台帳（`KnownDisk`）

外部変更の判定に必要な2つの土台を置く。**このタスクの後もアプリの見た目と挙動は変わらない**（監視はまだ張らない）。`openFolder` が走査ロジックを手放し、アプリの全書き込み経路が台帳を更新するようになるだけ。

台帳を React の state でなく **ref に置く**のがこのタスクの核心。書き込み成功の記録が再レンダリングを待つと、その隙に走った再走査が自分の書き込みを外部変更と誤検知する。

**Files:**
- Create: `src/core/scan.ts`
- Create: `src/core/scan.test.ts`
- Create: `src/core/known-disk.ts`
- Create: `src/core/known-disk.test.ts`
- Modify: `src/App.tsx`（`openFolder` / `selectFile` / `addCreatedFile` / `deleteFile` / saver の生成を差し替え）

**Interfaces:**
- Consumes: `classifyFile(text, registry)`（`src/core/load.ts`）、`fileName(path)` と `ProjectFile`（`src/core/project-file.ts`）、`ModuleRegistry`
- Produces:
  - `interface ScanEntry { path: string; name: string; text: string; result: LoadResult }`
  - `interface ScanResult { entries: ScanEntry[]; unreadable: string[] }`
  - `interface ScanIo { list: (dir: string) => Promise<string[]>; read: (path: string) => Promise<string> }`
  - `scanFolder(dir: string, io: ScanIo, registry: ModuleRegistry): Promise<ScanResult>`
  - `toProjectFile(entry: ScanEntry): ProjectFile`
  - `interface KnownDisk { get(path): string | undefined; set(path, text): void; delete(path): void; retain(paths: Iterable<string>): void; clear(): void }`
  - `createKnownDisk(): KnownDisk`
  - App 内の `writeAndRecord(path, text): Promise<void>` と `attachSaver(path, baseline)`（App 内部の関数。他ファイルからは使わない）

---

- [ ] **Step 1: `scanFolder` の失敗するテストを書く**

Create `src/core/scan.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { appRegistry } from '@/modules'
import { scanFolder, toProjectFile } from './scan'

const glossaryText = `{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "用語集",\n  "terms": []\n}\n`

describe('scanFolder', () => {
  it('直下の JSON を読んで分類し、生テキストを持ち帰る', async () => {
    const io = {
      list: vi.fn(async () => ['C:\\proj\\用語集.json']),
      read: vi.fn(async () => glossaryText),
    }
    const scan = await scanFolder('C:\\proj', io, appRegistry)
    expect(scan.unreadable).toEqual([])
    expect(scan.entries).toHaveLength(1)
    expect(scan.entries[0].name).toBe('用語集.json')
    // 外部変更の判定はこの生テキストの一致で行うので、正規化してはいけない
    expect(scan.entries[0].text).toBe(glossaryText)
    expect(scan.entries[0].result.status).toBe('editable')
  })

  it('読めなかったファイルは unreadable に入り、entries には入らない', async () => {
    const io = {
      list: vi.fn(async () => ['C:\\proj\\a.json', 'C:\\proj\\b.json']),
      read: vi.fn(async (path: string) => {
        if (path.endsWith('b.json')) throw new Error('ロックされています')
        return glossaryText
      }),
    }
    const scan = await scanFolder('C:\\proj', io, appRegistry)
    expect(scan.entries.map((e) => e.path)).toEqual(['C:\\proj\\a.json'])
    expect(scan.unreadable).toEqual(['C:\\proj\\b.json'])
  })

  it('一覧の取得に失敗したら投げる（フォルダごと読めない状態は呼び出し側が扱う）', async () => {
    const io = {
      list: vi.fn(async () => {
        throw new Error('フォルダがありません')
      }),
      read: vi.fn(async () => glossaryText),
    }
    await expect(scanFolder('C:\\proj', io, appRegistry)).rejects.toThrow('フォルダがありません')
  })
})

describe('toProjectFile', () => {
  it('一覧の1件へ変換する（issues は computeIssues が埋める）', () => {
    const entry = {
      path: 'C:\\proj\\用語集.json',
      name: '用語集.json',
      text: glossaryText,
      result: { status: 'editable' as const, type: 'glossary', title: '用語集', data: {} },
    }
    expect(toProjectFile(entry)).toEqual({
      path: 'C:\\proj\\用語集.json',
      name: '用語集.json',
      result: entry.result,
      issues: [],
    })
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/scan.test.ts`
Expected: FAIL（`Failed to resolve import "./scan"`）

- [ ] **Step 3: `scan.ts` を実装する**

Create `src/core/scan.ts`:

```ts
import { classifyFile, type LoadResult } from './load'
import { fileName, type ProjectFile } from './project-file'
import type { ModuleRegistry } from './registry'

/** 走査で読んだファイル1件（コア。Tauri を知らない） */
export interface ScanEntry {
  path: string
  name: string
  /**
   * 読み込んだ生テキスト（BOM も含む素のバイト列のまま）。
   * 外部変更の判定は「この生テキスト ≠ 台帳の内容」で行うので、
   * 正規化やパースを通した値で置き換えてはいけない
   */
  text: string
  result: LoadResult
}

export interface ScanResult {
  entries: ScanEntry[]
  /**
   * 読めなかったパス。**「消えた」と混ぜてはいけない**——読み取り失敗を
   * 外部削除として扱うと、一時的なロック（他プロセスが開いている等）で
   * 開いているファイルを勝手に閉じてしまう
   */
  unreadable: string[]
}

/** 走査の I/O 注入口（実体は src/fs/project-fs.ts の listJsonFiles / readProjectFile） */
export interface ScanIo {
  list: (dir: string) => Promise<string[]>
  read: (path: string) => Promise<string>
}

/**
 * フォルダ直下の JSON を全部読んで分類する。
 * 「フォルダを開いたとき」と「外部変更の検知後の再走査」が同じ経路を通るための1本化
 * （issues は付けない。呼び出し側が computeIssues を通す）
 */
export async function scanFolder(
  dir: string,
  io: ScanIo,
  registry: ModuleRegistry,
): Promise<ScanResult> {
  const paths = await io.list(dir)
  const entries: ScanEntry[] = []
  const unreadable: string[] = []
  for (const path of paths) {
    let text: string
    try {
      text = await io.read(path)
    } catch {
      // 一覧取得と読み取りの間に消えた／ロックされている。次のイベントで拾い直す
      unreadable.push(path)
      continue
    }
    entries.push({ path, name: fileName(path), text, result: classifyFile(text, registry) })
  }
  return { entries, unreadable }
}

/** 走査結果を一覧の1件へ。issues は computeIssues が埋める */
export function toProjectFile(entry: ScanEntry): ProjectFile {
  return { path: entry.path, name: entry.name, result: entry.result, issues: [] }
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/scan.test.ts`
Expected: PASS（4件）

- [ ] **Step 5: `KnownDisk` の失敗するテストを書く**

Create `src/core/known-disk.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { createKnownDisk } from './known-disk'

describe('createKnownDisk', () => {
  it('記録した内容を引ける', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', '{}\n')
    expect(known.get('C:\\proj\\a.json')).toBe('{}\n')
    expect(known.get('C:\\proj\\b.json')).toBeUndefined()
  })

  it('delete で1件落とせる', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', '{}\n')
    known.delete('C:\\proj\\a.json')
    expect(known.get('C:\\proj\\a.json')).toBeUndefined()
  })

  it('retain は渡されたパス以外を落とす（走査結果に合わせる）', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', 'A')
    known.set('C:\\proj\\b.json', 'B')
    known.retain(['C:\\proj\\a.json'])
    expect(known.get('C:\\proj\\a.json')).toBe('A')
    expect(known.get('C:\\proj\\b.json')).toBeUndefined()
  })

  it('clear は全部落とす（フォルダを切り替えたとき）', () => {
    const known = createKnownDisk()
    known.set('C:\\proj\\a.json', 'A')
    known.clear()
    expect(known.get('C:\\proj\\a.json')).toBeUndefined()
  })
})
```

- [ ] **Step 6: 落ちることを確認する**

Run: `npm test -- src/core/known-disk.test.ts`
Expected: FAIL（`Failed to resolve import "./known-disk"`）

- [ ] **Step 7: `known-disk.ts` を実装する**

Create `src/core/known-disk.ts`:

```ts
/**
 * 「アプリが最後に読み書きしたディスクの内容」の台帳（コア・純ロジック）。
 *
 * 外部変更の判定は、走査で読んだ生テキストとこの台帳の突き合わせで行う。
 * 1バイトも違わなければそれは**自分の書き込み**である——これが
 * 自己書き込みの構造的除外（rev 3章）で、時間窓もフラグも使わないので
 * 遅れて届くイベントでも取りこぼしも誤検知もしない。
 *
 * **React の state に置かないこと。** 書き込み成功の記録が再レンダリングを
 * 待つと、その隙に走った再走査が自分の書き込みを外部変更と誤検知する。
 * App では `useRef(createKnownDisk())` で持ち、書き込みと同じタイミングで
 * 同期的に更新する
 */
export interface KnownDisk {
  get(path: string): string | undefined
  set(path: string, text: string): void
  delete(path: string): void
  /** 渡したパス以外を落とす（走査結果へ合わせる。外部削除の後始末を兼ねる） */
  retain(paths: Iterable<string>): void
  /** 全部落とす（フォルダを切り替えたとき。別フォルダの内容を持ち越さない） */
  clear(): void
}

export function createKnownDisk(): KnownDisk {
  const byPath = new Map<string, string>()
  return {
    get(path) {
      return byPath.get(path)
    },
    set(path, text) {
      byPath.set(path, text)
    },
    delete(path) {
      byPath.delete(path)
    },
    retain(paths) {
      const keep = new Set(paths)
      for (const path of [...byPath.keys()]) {
        if (!keep.has(path)) byPath.delete(path)
      }
    },
    clear() {
      byPath.clear()
    },
  }
}
```

- [ ] **Step 8: 通ることを確認する**

Run: `npm test -- src/core/known-disk.test.ts`
Expected: PASS（4件）

- [ ] **Step 9: App を台帳と `scanFolder` に載せ替える**

Modify `src/App.tsx`。

(9-1) import を足す:

```ts
import { createKnownDisk } from '@/core/known-disk'
import { scanFolder, toProjectFile, type ScanResult } from '@/core/scan'
```

(9-2) `const AUTOSAVE_DELAY_MS = 500` の下に走査 I/O を置く:

```ts
/** 走査に渡す I/O。フォルダを開くときと再走査（M5）で同じ経路を通す */
const scanIo = { list: listJsonFiles, read: readProjectFile }
```

(9-3) `const selectSeq = useRef(0)` の下に台帳と ref を足す:

```ts
  /**
   * ディスクの既知内容の台帳（自己書き込み除外の要）。**state にしないこと**——
   * 記録が再レンダリングを待つと、その隙の再走査が自分の書き込みを
   * 外部変更と誤検知する
   */
  const knownDisk = useRef(createKnownDisk())
```

(9-4) `applyEdit` の直下（コンポーネント外）は触らず、コンポーネント内に共通の書き込み口と saver 生成を追加する。`closeCurrentFile` の**上**に置く:

```ts
  /**
   * アプリからの書き込みは必ずここを通す。**書けた内容を即座に台帳へ記録する**
   * ことが自己書き込み除外の唯一の前提条件で、記録が遅れると自分の書き込みを
   * 外部変更として検知してしまう。失敗時は記録しない（ディスクは変わっていない）
   */
  const writeAndRecord = async (path: string, text: string): Promise<void> => {
    await writeProjectFile(path, text)
    knownDisk.current.set(path, text)
  }

  /**
   * 自動保存を張る。baseline は「そのファイルをアプリが正とみなす内容の正規形」で、
   * 無編集ならバイト一致で書き込みが起きない（非正規ファイルを開いただけでは
   * 書き戻さない。rev 5章）。外部変更の上書き（M5）では baseline に
   * 取り込んだディスクの内容を渡して張り直す
   */
  const attachSaver = (path: string, baseline: string) => {
    saverRef.current = createAutoSaver({
      delayMs: AUTOSAVE_DELAY_MS,
      baseline,
      write: (text) => writeAndRecord(path, text),
      onError: (err) =>
        setSaveError(
          `自動保存に失敗しました（編集を続けるか、もう一度閉じる操作で再試行されます）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        ),
      onSuccess: () => setSaveError(null),
    })
  }
```

(9-5) `openFolder` を差し替える:

```ts
  const openFolder = async () => {
    const dir = await pickProjectFolder()
    if (dir === null) return
    const token = ++selectSeq.current
    // 先に現在のファイルを閉じる（flush 後の内容で走査するため）。
    // flush が失敗したらフォルダ切替を中断する（書けていない編集を捨てない）
    if (!(await closeCurrentFile())) return
    try {
      const scan = await scanFolder(dir, scanIo, appRegistry)
      // 後続の openFolder / selectFile が始まっていたら、この結果は破棄する
      if (token !== selectSeq.current) return
      // 一部でも読めなければ入れ替えない（途中失敗で新旧が混ざった状態を作らない。M1 で確定）
      if (scan.unreadable.length > 0) {
        setIoError(
          `読み込めないファイルがあるため開けませんでした: ${scan.unreadable.join(' / ')}`,
        )
        return
      }
      setProjectDir(dir)
      setFiles(computeIssues(scan.entries.map(toProjectFile), appRegistry))
      // 台帳は別フォルダの分を持ち越さない
      knownDisk.current.clear()
      for (const entry of scan.entries) knownDisk.current.set(entry.path, entry.text)
      setIoError(null)
    } catch (err) {
      if (token !== selectSeq.current) return
      // 旧フォルダの一覧はそのまま残す。選択は closeCurrentFile 済みなので選び直せる
      setIoError(
        `フォルダの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

(9-6) `selectFile` を「パスを受け取る」形に差し替える（外部変更の取り込みが同じ経路を通れるようにするため。呼び出し側は `file.path` を渡す）:

```ts
  const selectFile = async (path: string) => {
    const token = ++selectSeq.current
    if (!(await closeCurrentFile())) return
    try {
      // 選択時に必ずディスクから読み直す（走査時キャッシュを編集の起点にすると、
      // 直前の自動保存分を古い内容で上書きするデータ喪失経路になる。M1 で確定）
      const text = await readProjectFile(path)
      if (token !== selectSeq.current) return // 後続の選択が始まっていたら破棄
      // 読んだ内容は「アプリが知っているディスクの内容」
      knownDisk.current.set(path, text)
      const result = classifyFile(text, appRegistry)
      setFiles((prev) =>
        computeIssues(
          prev.map((f) => (f.path === path ? { ...f, result } : f)),
          appRegistry,
        ),
      )
      setSelectedPath(path)
      setIoError(null)
      if (result.status !== 'editable') return
      const module = appRegistry.get(result.type)
      if (!module) return
      attachSaver(path, serialize(result.data, module.schema))
      setHistory(createHistory(result.data))
    } catch (err) {
      if (token !== selectSeq.current) return
      setIoError(
        `ファイルの読み込みに失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

(9-7) 呼び出し側を直す:
- `addCreatedFile` の末尾 `await selectFile(entry)` → `await selectFile(created.path)`
- `ensureGlossary` の「既にあった」分岐を `await selectFile(path)` に簡約する（`files.find` は不要になる）
- `<FileList ... onSelect={(file) => void selectFile(file)} />` → `onSelect={(file) => void selectFile(file.path)}`

(9-8) 全ての書き込みを `writeAndRecord` に通す:
- `createNewFile` の `createFile({ ..., write: writeProjectFile })` → `write: writeAndRecord`
- `ensureGlossary` の `ensureFileOfType({ ..., write: writeProjectFile })` → `write: writeAndRecord`

(9-9) `deleteFile` の成功時に台帳から落とす（`setFiles(...)` の直前）:

```ts
      knownDisk.current.delete(file.path)
```

- [ ] **Step 10: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint; npm run build`
Expected: すべて PASS／警告ゼロ。**挙動は M4 と同じ**（台帳はまだ誰も読まない）。`writeProjectFile` の直接呼び出しが App から消えたことを確認する（`attachSaver` 経由の `writeAndRecord` だけになる）。

- [ ] **Step 11: コミット**

```bash
git add src/core/scan.ts src/core/scan.test.ts src/core/known-disk.ts src/core/known-disk.test.ts src/App.tsx
git commit -m "M5: 走査を scanFolder に1本化し、ディスクの既知内容の台帳を持つ"
```

---

### Task 4: 外部変更の判断（純関数 `planExternalChange`）

M5 の判断ロジック全部をここに閉じる。App は「呼んで適用する」だけになるので、**M5 の仕様の大半はこのファイルのテストで固定される**（設計決定11）。

**Files:**
- Create: `src/core/external-change.ts`
- Create: `src/core/external-change.test.ts`

**Interfaces:**
- Consumes: `ProjectFile`（`src/core/project-file.ts`）、`ScanEntry` / `ScanResult` / `toProjectFile`（`src/core/scan.ts`）
- Produces:
  - `type SelectedAction = { kind: 'none' } | { kind: 'reload'; path; name; stashText: string | undefined } | { kind: 'ask'; path; name; diskText: string } | { kind: 'gone'; path; name }`
  - `interface ExternalChangePlan { hasChanges: boolean; next: ProjectFile[]; selected: SelectedAction; notices: string[] }`
  - `planExternalChange(args: { prev: readonly ProjectFile[]; scan: ScanResult; knownText: (path: string) => string | undefined; selectedPath: string | null; hasUnsavedEdits: boolean }): ExternalChangePlan`

---

- [ ] **Step 1: 失敗するテストを書く**

Create `src/core/external-change.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { appRegistry } from '@/modules'
import { planExternalChange } from './external-change'
import { classifyFile } from './load'
import type { ProjectFile } from './project-file'
import type { ScanEntry, ScanResult } from './scan'

function glossaryText(title: string): string {
  return `{\n  "schemaVersion": 1,\n  "type": "glossary",\n  "title": "${title}",\n  "terms": []\n}\n`
}

function entry(name: string, text: string): ScanEntry {
  return {
    path: `C:\\proj\\${name}`,
    name,
    text,
    result: classifyFile(text, appRegistry),
  }
}

function listed(e: ScanEntry): ProjectFile {
  return { path: e.path, name: e.name, result: e.result, issues: [] }
}

function scan(entries: ScanEntry[], unreadable: string[] = []): ScanResult {
  return { entries, unreadable }
}

/** 台帳の引き当て（記録された内容 = アプリが最後に読み書きした内容） */
function ledger(pairs: Record<string, string>) {
  return (path: string) => pairs[path]
}

const A = entry('用語集.json', glossaryText('用語集'))
const A2 = entry('用語集.json', glossaryText('用語集（外部で変更）'))
const B = entry('メモ.json', glossaryText('メモ'))

describe('planExternalChange', () => {
  it('台帳と同じ内容なら変更なし（自己書き込みの構造的除外）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(false)
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.notices).toEqual([])
  })

  it('選択中ファイルが変わり未保存編集が無ければ再読込（退避テキスト付き）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A2]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(true)
    expect(plan.selected).toEqual({
      kind: 'reload',
      path: A.path,
      name: '用語集.json',
      // 退避は「取り込み前にディスクにあったバイト列」。再シリアライズではない
      stashText: A.text,
    })
    // 選択中ファイルの通知は呼び出し側が操作付きトーストとして出すので、ここには出さない
    expect(plan.notices).toEqual([])
    expect(plan.next[0].result).toEqual(A2.result)
  })

  it('選択中ファイルが変わり未保存編集があれば二択（ディスクの内容を渡す）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A2]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: A.path,
      hasUnsavedEdits: true,
    })
    expect(plan.selected).toEqual({
      kind: 'ask',
      path: A.path,
      name: '用語集.json',
      // 上書き側が新しい baseline に使う（古い baseline のままだと
      // 「同じ内容だから書かない」に落ちて外部変更が残る）
      diskText: A2.text,
    })
  })

  it('選択中以外の変更は通知だけ（一覧の result は差し替える）', () => {
    const B2 = entry('メモ.json', glossaryText('メモ（外部で変更）'))
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A, B2]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.notices).toEqual(['外部の変更を読み込みました: メモ.json'])
    expect(plan.next[1].result).toEqual(B2.result)
  })

  it('増えたファイルは末尾に足して通知する（既存の並びを崩さない）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([B, A]),
      knownText: ledger({ [A.path]: A.text }),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json', 'メモ.json'])
    expect(plan.notices).toEqual(['ファイルが増えました: メモ.json'])
  })

  it('選択中ファイルが消えたら gone', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([B]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'gone', path: A.path, name: '用語集.json' })
    expect(plan.next.map((f) => f.name)).toEqual(['メモ.json'])
    expect(plan.notices).toEqual([])
  })

  it('選択中以外が消えたら一覧から落として通知する', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: A.path,
      hasUnsavedEdits: false,
    })
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json'])
    expect(plan.notices).toEqual(['ファイルが外部で削除されました: メモ.json'])
  })

  it('読めなかったファイルは消えた扱いにしない（一時的なロックで閉じない）', () => {
    const plan = planExternalChange({
      prev: [listed(A), listed(B)],
      scan: scan([A], [B.path]),
      knownText: ledger({ [A.path]: A.text, [B.path]: B.text }),
      selectedPath: B.path,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(false)
    expect(plan.selected).toEqual({ kind: 'none' })
    expect(plan.next.map((f) => f.name)).toEqual(['用語集.json', 'メモ.json'])
    expect(plan.notices).toEqual([])
  })

  it('台帳に記録の無い既知ファイルは変更として扱う（不変を証明できないものは拾う）', () => {
    const plan = planExternalChange({
      prev: [listed(A)],
      scan: scan([A]),
      knownText: ledger({}),
      selectedPath: null,
      hasUnsavedEdits: false,
    })
    expect(plan.hasChanges).toBe(true)
    expect(plan.notices).toEqual(['外部の変更を読み込みました: 用語集.json'])
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/external-change.test.ts`
Expected: FAIL（`Failed to resolve import "./external-change"`）

- [ ] **Step 3: `external-change.ts` を実装する**

Create `src/core/external-change.ts`:

```ts
import type { ProjectFile } from './project-file'
import { toProjectFile, type ScanEntry, type ScanResult } from './scan'

/**
 * 選択中ファイルに対して額縁が取る行動。
 * 「マージ UI は作らない」（rev 3章）ので、選択肢はこの4つに閉じる
 */
export type SelectedAction =
  | { kind: 'none' }
  /** 未保存編集なし → 再読込。stashText は取り込み前のバイト列（退避用） */
  | { kind: 'reload'; path: string; name: string; stashText: string | undefined }
  /** 未保存編集あり → 二択ダイアログ。diskText は上書き時の新しい baseline */
  | { kind: 'ask'; path: string; name: string; diskText: string }
  /** 外部で消えた → 選択を落として後始末（**書き戻さない**） */
  | { kind: 'gone'; path: string; name: string }

export interface ExternalChangePlan {
  /** 何も変わっていない（＝自己書き込みだけだった）なら false。適用を丸ごと省ける */
  hasChanges: boolean
  /** 適用後の一覧。既存の並びを保ち、増えた分を末尾に足す */
  next: ProjectFile[]
  selected: SelectedAction
  /** 非モーダル通知に流す文（選択中ファイル以外の増減・変更） */
  notices: string[]
}

/**
 * 走査結果と台帳を突き合わせて、外部変更への行動を決める（コア・純関数）。
 *
 * **自己書き込みの除外はここ1箇所で成立する**——`knownText(path)` が返すのは
 * 「アプリが最後に読み書きした内容」なので、走査で読んだ生テキストと
 * 1バイトも違わなければ自分の書き込みである。時間窓もフラグも使わないので、
 * イベントが遅れて届いても取りこぼさず、誤検知もしない（rev 3章）。
 *
 * 削除・新規作成も同じ仕組みで外れる——アプリが作ったファイルは作成時に
 * 台帳へ記録され、消したファイルは一覧と台帳の両方から落ちるので、
 * 跳ね返ってきたイベントは差分ゼロになる
 */
export function planExternalChange(args: {
  prev: readonly ProjectFile[]
  scan: ScanResult
  knownText: (path: string) => string | undefined
  selectedPath: string | null
  hasUnsavedEdits: boolean
}): ExternalChangePlan {
  const prevPaths = new Set(args.prev.map((f) => f.path))
  const scannedPaths = new Set(args.scan.entries.map((e) => e.path))
  const unreadable = new Set(args.scan.unreadable)
  const byPath = new Map(args.scan.entries.map((e) => [e.path, e]))

  const changed: ScanEntry[] = []
  const added: ScanEntry[] = []
  for (const e of args.scan.entries) {
    if (!prevPaths.has(e.path)) {
      added.push(e)
    } else if (args.knownText(e.path) !== e.text) {
      // 台帳に記録が無い（undefined）場合も変更として扱う——不変を証明できない
      changed.push(e)
    }
  }
  // 読めなかったパスは「消えた」と区別できないので消えた扱いにしない
  const removed = args.prev.filter((f) => !scannedPaths.has(f.path) && !unreadable.has(f.path))

  const kept = args.prev
    .filter((f) => scannedPaths.has(f.path) || unreadable.has(f.path))
    .map((f) => {
      const e = byPath.get(f.path)
      // 読めなかったファイルは前回の内容をそのまま残す
      return e === undefined ? f : { ...f, name: e.name, result: e.result }
    })
  const next = [...kept, ...added.map(toProjectFile)]

  const selected = ((): SelectedAction => {
    const path = args.selectedPath
    if (path === null) return { kind: 'none' }
    const gone = removed.find((f) => f.path === path)
    if (gone !== undefined) return { kind: 'gone', path, name: gone.name }
    const hit = changed.find((e) => e.path === path)
    if (hit === undefined) return { kind: 'none' }
    return args.hasUnsavedEdits
      ? { kind: 'ask', path, name: hit.name, diskText: hit.text }
      : { kind: 'reload', path, name: hit.name, stashText: args.knownText(path) }
  })()

  // 選択中ファイルの通知は呼び出し側が出す（退避の操作ボタンを載せるため）
  const notices = [
    ...changed
      .filter((e) => e.path !== args.selectedPath)
      .map((e) => `外部の変更を読み込みました: ${e.name}`),
    ...added.map((e) => `ファイルが増えました: ${e.name}`),
    ...removed
      .filter((f) => f.path !== args.selectedPath)
      .map((f) => `ファイルが外部で削除されました: ${f.name}`),
  ]

  return {
    hasChanges: changed.length > 0 || added.length > 0 || removed.length > 0,
    next,
    selected,
    notices,
  }
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/external-change.test.ts`
Expected: PASS（9件）

- [ ] **Step 5: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint`
Expected: すべて PASS／警告ゼロ

- [ ] **Step 6: コミット**

```bash
git add src/core/external-change.ts src/core/external-change.test.ts
git commit -m "M5: 外部変更の判断を純関数に切り出す（自己書き込みは台帳との内容比較で除外）"
```

---

### Task 5: 非モーダル通知（トースト）

rev 3章が要求する「トーストで知らせる」と「トーストに『取り込み前に戻す』アクションを付ける」の器。**`sonner` は使わない**（設計決定10）。このタスクでは器と純ロジックまでを作り、App への配線は Task 8（生産者と同時）で行う。

**Files:**
- Create: `src/core/toasts.ts`
- Create: `src/core/toasts.test.ts`
- Create: `src/components/Toast.tsx`
- Create: `src/components/Toast.dom.test.tsx`

**Interfaces:**
- Consumes: なし
- Produces:
  - `interface ToastItem { id: number; message: string; action?: { label: string; run: () => void | Promise<void> }; key?: string }`
  - `MAX_TOASTS: number`
  - `pushToast(list: readonly ToastItem[], toast: ToastItem): ToastItem[]`
  - `dismissToast(list: readonly ToastItem[], id: number): ToastItem[]`
  - `ToastStack(props: { toasts: readonly ToastItem[]; onDismiss: (id: number) => void })`
  - `TOAST_AUTO_DISMISS_MS: number`

---

- [ ] **Step 1: 純ロジックの失敗するテストを書く**

Create `src/core/toasts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dismissToast, MAX_TOASTS, pushToast, type ToastItem } from './toasts'

function toast(id: number, over: Partial<ToastItem> = {}): ToastItem {
  return { id, message: `通知${id}`, ...over }
}

describe('pushToast', () => {
  it('末尾に足す', () => {
    const list = pushToast(pushToast([], toast(1)), toast(2))
    expect(list.map((t) => t.id)).toEqual([1, 2])
  })

  it('同じ key の通知は位置を保ったまま置き換える（連続する外部変更で積み上がらない）', () => {
    const list = [toast(1, { key: 'external:A' }), toast(2)]
    const next = pushToast(list, toast(3, { key: 'external:A', message: '新しい通知' }))
    expect(next.map((t) => t.id)).toEqual([3, 2])
    expect(next[0].message).toBe('新しい通知')
  })

  it('key が無い通知は常に足される', () => {
    const next = pushToast([toast(1)], toast(2))
    expect(next).toHaveLength(2)
  })

  it('上限を超えたら古い方から落とす', () => {
    let list: ToastItem[] = []
    for (let id = 1; id <= MAX_TOASTS + 2; id++) list = pushToast(list, toast(id))
    expect(list).toHaveLength(MAX_TOASTS)
    expect(list[0].id).toBe(3)
  })
})

describe('dismissToast', () => {
  it('id で1件落とす', () => {
    expect(dismissToast([toast(1), toast(2)], 1).map((t) => t.id)).toEqual([2])
  })

  it('無い id は何もしない', () => {
    expect(dismissToast([toast(1)], 9)).toHaveLength(1)
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/toasts.test.ts`
Expected: FAIL（`Failed to resolve import "./toasts"`）

- [ ] **Step 3: `toasts.ts` を実装する**

Create `src/core/toasts.ts`:

```ts
/**
 * 非モーダル通知の状態（コア・純ロジック。React を知らない）。
 *
 * バナー（App の `ioError` / `saveError`）は**いま続いている状態**を出す場所、
 * トーストは**起きた出来事**を流す場所。役割を混ぜない（M5 で確定）
 */
export interface ToastItem {
  /** 呼び出し側が採番する（コアはカウンタを持たない） */
  id: number
  message: string
  /**
   * 押せる操作（例: 取り込み前に戻す）。
   * **付いているトーストは自動で消さない**——Undo 履歴を破棄した後の
   * 唯一の復元手段が時間切れで消えると、退避の意味が無い（rev 3章）
   */
  action?: { label: string; run: () => void | Promise<void> }
  /**
   * 同じ key の通知は新しい方に置き換える。同じファイルへ外部変更が
   * 連続して来ても積み上がらないようにするため
   */
  key?: string
}

/** 同時に出す上限。超えたら古い方から落とす */
export const MAX_TOASTS = 3

export function pushToast(list: readonly ToastItem[], toast: ToastItem): ToastItem[] {
  const at = toast.key === undefined ? -1 : list.findIndex((t) => t.key === toast.key)
  const next = at >= 0 ? list.map((t, i) => (i === at ? toast : t)) : [...list, toast]
  return next.length <= MAX_TOASTS ? next : next.slice(next.length - MAX_TOASTS)
}

export function dismissToast(list: readonly ToastItem[], id: number): ToastItem[] {
  return list.filter((t) => t.id !== id)
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/toasts.test.ts`
Expected: PASS（6件）

- [ ] **Step 5: 表示コンポーネントの失敗するテストを書く**

Create `src/components/Toast.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ToastItem } from '@/core/toasts'
import { ToastStack, TOAST_AUTO_DISMISS_MS } from './Toast'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

function setup(toasts: ToastItem[]) {
  const onDismiss = vi.fn()
  render(<ToastStack toasts={toasts} onDismiss={onDismiss} />)
  return { onDismiss }
}

describe('ToastStack', () => {
  it('通知が無ければ何も出さない', () => {
    setup([])
    expect(screen.queryAllByRole('status')).toHaveLength(0)
  })

  it('メッセージを出す', () => {
    setup([{ id: 1, message: '外部の変更を読み込みました' }])
    expect(screen.getByRole('status').textContent).toContain('外部の変更を読み込みました')
  })

  it('操作ボタンを押すと run が呼ばれる', () => {
    const run = vi.fn()
    setup([{ id: 1, message: '取り込みました', action: { label: '取り込み前に戻す', run } }])
    fireEvent.click(screen.getByRole('button', { name: '取り込み前に戻す' }))
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('閉じるボタンで onDismiss が呼ばれる', () => {
    const { onDismiss } = setup([{ id: 7, message: '増えました' }])
    fireEvent.click(screen.getByRole('button', { name: '通知を閉じる' }))
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('操作の無い通知は一定時間で自動的に消える', () => {
    vi.useFakeTimers()
    const { onDismiss } = setup([{ id: 7, message: '増えました' }])
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS)
    expect(onDismiss).toHaveBeenCalledWith(7)
  })

  it('操作付きの通知は自動では消えない（退避の復元手段を時間切れで失わない）', () => {
    vi.useFakeTimers()
    const { onDismiss } = setup([
      { id: 7, message: '取り込みました', action: { label: '取り込み前に戻す', run: vi.fn() } },
    ])
    vi.advanceTimersByTime(TOAST_AUTO_DISMISS_MS * 3)
    expect(onDismiss).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 6: 落ちることを確認する**

Run: `npm test -- src/components/Toast.dom.test.tsx`
Expected: FAIL（`Failed to resolve import "./Toast"`）

- [ ] **Step 7: `Toast.tsx` を実装する**

Create `src/components/Toast.tsx`:

```tsx
import { useEffect } from 'react'
import type { ToastItem } from '@/core/toasts'

/** 操作の付かない通知が自動で消えるまで */
export const TOAST_AUTO_DISMISS_MS = 6000

export interface ToastStackProps {
  toasts: readonly ToastItem[]
  onDismiss: (id: number) => void
}

/**
 * 非モーダル通知（rev 3章。外部変更を読み込んだことを知らせる）。
 * shadcn の sonner は使わない——生成物が next-themes を import するため、
 * 「生成物は手で整形しない」というリポジトリの規約と衝突する（M5 で確定）。
 * 見た目は既存の役割トークンの流用で仮置き。確定は M7
 */
export function ToastStack(props: ToastStackProps) {
  if (props.toasts.length === 0) return null
  return (
    <div className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-80 flex-col gap-2">
      {props.toasts.map((toast) => (
        <ToastRow key={toast.id} toast={toast} onDismiss={props.onDismiss} />
      ))}
    </div>
  )
}

function ToastRow(props: { toast: ToastItem; onDismiss: (id: number) => void }) {
  const { toast, onDismiss } = props
  const action = toast.action
  // 操作付きは自動で消さない（rev 3章。退避の復元手段を時間切れで失わない）
  const autoDismiss = action === undefined
  useEffect(() => {
    if (!autoDismiss) return
    const timer = setTimeout(() => onDismiss(toast.id), TOAST_AUTO_DISMISS_MS)
    return () => clearTimeout(timer)
  }, [autoDismiss, onDismiss, toast.id])

  return (
    <div
      role="status"
      className="pointer-events-auto rounded-sm border border-rule bg-surface px-3 py-2 text-sm text-ink shadow-sm"
    >
      <p>{toast.message}</p>
      <div className="mt-1 flex items-center gap-3">
        {action !== undefined && (
          <button
            type="button"
            className="text-xs text-ink underline"
            onClick={() => void action.run()}
          >
            {action.label}
          </button>
        )}
        <button
          type="button"
          aria-label="通知を閉じる"
          className="ml-auto text-xs text-ink-muted hover:text-ink"
          onClick={() => onDismiss(toast.id)}
        >
          閉じる
        </button>
      </div>
    </div>
  )
}
```

- [ ] **Step 8: 通ることを確認する**

Run: `npm test -- src/components/Toast.dom.test.tsx`
Expected: PASS（6件）

- [ ] **Step 9: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint`
Expected: すべて PASS／警告ゼロ（`TOAST_AUTO_DISMISS_MS` の export は `react/only-export-components` の `allowConstantExport` で許容される）

- [ ] **Step 10: コミット**

```bash
git add src/core/toasts.ts src/core/toasts.test.ts src/components/Toast.tsx src/components/Toast.dom.test.tsx
git commit -m "M5: 非モーダル通知（トースト）の器を作る"
```

---

### Task 6: 二択ダイアログとモーダルのキュー化

申し送り10節が「M5 が3人目の生産者を連れてくるので、この時点で queue 化かスロット分離を判断すること」と指定した項目。**キューにする**（設計決定9）。このタスクは**既存の挙動を保ったままの移行**で、外部変更の生産者は Task 8 で足す。

**Files:**
- Create: `src/core/modal-queue.ts`
- Create: `src/core/modal-queue.test.ts`
- Create: `src/components/ChoiceDialog.tsx`
- Create: `src/components/ChoiceDialog.dom.test.tsx`
- Modify: `src/App.tsx`（`confirm` state → `modals` キュー）

**Interfaces:**
- Consumes: `AlertDialog*`（`src/components/ui/alert-dialog.tsx`）
- Produces:
  - `type ModalRequest = { kind: 'confirm'; key?: string; title; description; confirmLabel; onConfirm } | { kind: 'choice'; key?: string; title; description; primaryLabel; secondaryLabel; onPrimary; onSecondary }`
  - `pushModal(queue: readonly ModalRequest[], req: ModalRequest): ModalRequest[]`
  - `shiftModal(queue: readonly ModalRequest[]): ModalRequest[]`
  - `ChoiceDialog(props: { open; title; description; primaryLabel; secondaryLabel; onPrimary; onSecondary })`

---

- [ ] **Step 1: キューの失敗するテストを書く**

Create `src/core/modal-queue.test.ts`:

```ts
import { describe, expect, it, vi } from 'vitest'
import { pushModal, shiftModal, type ModalRequest } from './modal-queue'

function confirmReq(title: string, key?: string): ModalRequest {
  return {
    kind: 'confirm',
    key,
    title,
    description: '',
    confirmLabel: 'OK',
    onConfirm: vi.fn(),
  }
}

describe('pushModal', () => {
  it('空のキューへ足す', () => {
    expect(pushModal([], confirmReq('A'))).toHaveLength(1)
  })

  it('key が無い要求は積まれる（先頭は表示中なので入れ替えない）', () => {
    const queue = pushModal(pushModal([], confirmReq('A')), confirmReq('B'))
    expect(queue.map((r) => r.title)).toEqual(['A', 'B'])
  })

  it('同じ key の要求は位置を保ったまま置き換える', () => {
    const queue = [confirmReq('A', 'close'), confirmReq('B')]
    const next = pushModal(queue, confirmReq('A2', 'close'))
    expect(next.map((r) => r.title)).toEqual(['A2', 'B'])
  })
})

describe('shiftModal', () => {
  it('先頭を落とす', () => {
    const queue = [confirmReq('A'), confirmReq('B')]
    expect(shiftModal(queue).map((r) => r.title)).toEqual(['B'])
  })

  it('空のキューでも落ちない', () => {
    expect(shiftModal([])).toEqual([])
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/modal-queue.test.ts`
Expected: FAIL（`Failed to resolve import "./modal-queue"`）

- [ ] **Step 3: `modal-queue.ts` を実装する**

Create `src/core/modal-queue.ts`:

```ts
/**
 * モーダルの要求キュー（コア・純ロジック）。
 *
 * スロットが1つだと、生産者が増えた時点で要求が無言で落ちる——削除確認を
 * 出したまま OS の × を押すと「破棄して閉じる」の要求に上書きされる、など。
 * M5 で外部変更の二択が3人目の生産者になるのでキューにした（申し送り10節）
 */
export type ModalRequest =
  | {
      kind: 'confirm'
      /** 同じ key の要求は置き換える（同じ操作の再試行を積み上げない） */
      key?: string
      title: string
      description: string
      confirmLabel: string
      onConfirm: () => void | Promise<void>
    }
  | {
      kind: 'choice'
      key?: string
      title: string
      description: string
      primaryLabel: string
      secondaryLabel: string
      onPrimary: () => void | Promise<void>
      onSecondary: () => void | Promise<void>
    }

export function pushModal(
  queue: readonly ModalRequest[],
  request: ModalRequest,
): ModalRequest[] {
  const at = request.key === undefined ? -1 : queue.findIndex((r) => r.key === request.key)
  return at >= 0 ? queue.map((r, i) => (i === at ? request : r)) : [...queue, request]
}

/** 表示中（先頭）の要求を片付ける */
export function shiftModal(queue: readonly ModalRequest[]): ModalRequest[] {
  return queue.slice(1)
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/modal-queue.test.ts`
Expected: PASS（5件）

- [ ] **Step 5: 二択ダイアログの失敗するテストを書く**

Create `src/components/ChoiceDialog.dom.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { ChoiceDialog } from './ChoiceDialog'

afterEach(cleanup)

function setup(open = true) {
  const onPrimary = vi.fn()
  const onSecondary = vi.fn()
  render(
    <ChoiceDialog
      open={open}
      title="外部でファイルが変更されました"
      description="用語集.json が外部で変更されました。保存していない編集があります。"
      primaryLabel="自分の編集で上書き"
      secondaryLabel="外部変更を取り込む（自分の編集は破棄）"
      onPrimary={onPrimary}
      onSecondary={onSecondary}
    />,
  )
  return { onPrimary, onSecondary }
}

describe('ChoiceDialog', () => {
  it('open が false のときは何も出さない', () => {
    setup(false)
    expect(screen.queryByRole('heading', { name: '外部でファイルが変更されました' })).toBeNull()
  })

  it('見出しと説明を出す', () => {
    setup()
    expect(screen.getByRole('heading', { name: '外部でファイルが変更されました' })).not.toBeNull()
    expect(screen.getByText(/保存していない編集があります/)).not.toBeNull()
  })

  it('第1の選択で onPrimary だけを呼ぶ', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.click(screen.getByRole('button', { name: '自分の編集で上書き' }))
    expect(onPrimary).toHaveBeenCalledTimes(1)
    expect(onSecondary).not.toHaveBeenCalled()
  })

  it('第2の選択で onSecondary だけを呼ぶ', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.click(screen.getByRole('button', { name: '外部変更を取り込む（自分の編集は破棄）' }))
    expect(onSecondary).toHaveBeenCalledTimes(1)
    expect(onPrimary).not.toHaveBeenCalled()
  })

  it('Esc では閉じない（決めないまま閉じると宙ぶらりんになる）', () => {
    const { onPrimary, onSecondary } = setup()
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onPrimary).not.toHaveBeenCalled()
    expect(onSecondary).not.toHaveBeenCalled()
    expect(screen.getByRole('heading', { name: '外部でファイルが変更されました' })).not.toBeNull()
  })
})
```

- [ ] **Step 6: 落ちることを確認する**

Run: `npm test -- src/components/ChoiceDialog.dom.test.tsx`
Expected: FAIL（`Failed to resolve import "./ChoiceDialog"`）

- [ ] **Step 7: `ChoiceDialog.tsx` を実装する**

Create `src/components/ChoiceDialog.tsx`:

```tsx
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'

export interface ChoiceDialogProps {
  open: boolean
  title: string
  description: string
  primaryLabel: string
  secondaryLabel: string
  onPrimary: () => void
  onSecondary: () => void
}

/**
 * 二択ダイアログ（外部変更の衝突。rev 3章。マージ UI は作らない）。
 *
 * **キャンセルも Esc もオーバーレイクリックも無い。** どちらの選択にも副作用が
 * あり、決めないまま閉じると「自分の編集も保存されず、外部変更も取り込まれない」
 * 宙ぶらりんが残る（検知した時点でそのファイルの自動保存は止めてある）。
 * かといって Esc を「上書き」に割り当てると、外部変更の破棄が最も押しやすい
 * キーになってしまう。だから明示的な選択だけを受ける。
 *
 * **開いている間は呼び出し側が KeyContext.modalOpen を true にすること**
 *（配線点は3箇所。ConfirmDialog と同じ。rev 10章の境界規則）。
 *
 * 両ボタンで preventDefault してから handler を呼ぶ——Radix の
 * AlertDialogAction は内部が Dialog.Close なので、放っておくと
 * onOpenChange も発火する（M4 で踏んだ罠）。
 * 見た目は shadcn の既定トークンのままで、役割トークンへの寄せは M7
 */
export function ChoiceDialog(props: ChoiceDialogProps) {
  return (
    <AlertDialog open={props.open}>
      {/* onOpenChange を渡さない＝内部からの close 要求は全部無視される。
          Esc は Radix が独自に拾うので明示的に止める */}
      <AlertDialogContent onEscapeKeyDown={(event) => event.preventDefault()}>
        <AlertDialogHeader>
          <AlertDialogTitle>{props.title}</AlertDialogTitle>
          <AlertDialogDescription>{props.description}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogAction
            variant="outline"
            onClick={(event) => {
              event.preventDefault()
              props.onSecondary()
            }}
          >
            {props.secondaryLabel}
          </AlertDialogAction>
          <AlertDialogAction
            onClick={(event) => {
              event.preventDefault()
              props.onPrimary()
            }}
          >
            {props.primaryLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
```

- [ ] **Step 8: 通ることを確認する**

Run: `npm test -- src/components/ChoiceDialog.dom.test.tsx`
Expected: PASS（5件）

> ここで落ちる可能性がある点: `AlertDialogTitle` は h2 として描画されるので `getByRole('heading')` で引ける（`ConfirmDialog.dom.test.tsx` は `getByText` で引いており、申し送り10節が「小さな負債」として挙げている形）。もし role で引けなければ**ライブラリの実装を読んで確認し、テスト側を実態に合わせる**（計画の記述より実装が正）。

- [ ] **Step 9: App の `confirm` state をキューへ移行する**

Modify `src/App.tsx`。

(9-1) import を足す:

```ts
import { ChoiceDialog } from '@/components/ChoiceDialog'
import { pushModal, shiftModal, type ModalRequest } from '@/core/modal-queue'
```

(9-2) `confirm` state のブロック（`const [confirm, setConfirm] = useState<{...}>(null)` 〜 `modalOpenRef.current = modalOpen`）を差し替える:

```ts
  // モーダルの要求キュー。生産者は「ファイル削除の確認」「破棄して閉じる」
  //「外部変更の二択」の3つ（申し送り10節。スロット1つでは要求が無言で落ちる）。
  // 開いている間は操作言語を止める（rev 10章の境界規則）
  const [modals, setModals] = useState<ModalRequest[]>([])
  const head = modals[0] ?? null
  const modalOpen = modals.length > 0
  // window リスナーはマウント時の1回しか張らないので、最新値は ref から読む
  //（**state 直読みに「簡潔化」しないこと**。常に初期値 false になる）
  const modalOpenRef = useRef(modalOpen)
  modalOpenRef.current = modalOpen
  const showModal = (request: ModalRequest) => setModals((prev) => pushModal(prev, request))
  const closeModal = () => setModals((prev) => shiftModal(prev))
```

(9-3) `setConfirm({...})` の呼び出し2箇所を `showModal({ kind: 'confirm', ... })` に置き換える。**`key` を付ける**のがキュー化の効き所:

close 横取り（`interceptClose` の中）:

```ts
      showModal({
        kind: 'confirm',
        // 閉じる操作を繰り返しても要求が積み上がらないように置き換える
        key: 'close',
        title: '保存できないため閉じられません',
        description:
          '保存していない編集があります。もう一度閉じる操作をすると保存を再試行します。破棄して閉じると、この編集は失われます（ファイルの内容は最後に保存できた状態のままです）。',
        confirmLabel: '破棄して閉じる',
        onConfirm: async () => {
          saverRef.current?.dispose()
          await forceClose()
        },
      })
```

`requestDelete`:

```ts
  /** 削除は Undo で戻せないので確認を挟む（用語の削除に確認を挟まないのとは別。rev 5章） */
  const requestDelete = (file: ProjectFile) => {
    showModal({
      kind: 'confirm',
      key: `delete:${file.path}`,
      title: 'ファイルを削除しますか？',
      description: `${file.name} を OS のゴミ箱へ移動します。完全には削除しないので、ゴミ箱から戻せます。`,
      confirmLabel: 'ゴミ箱へ移動',
      onConfirm: () => deleteFile(file),
    })
  }
```

(9-4) 末尾の `<ConfirmDialog ... />` を差し替え、`<ChoiceDialog />` を足す:

```tsx
      <ConfirmDialog
        open={head?.kind === 'confirm'}
        title={head?.kind === 'confirm' ? head.title : ''}
        description={head?.kind === 'confirm' ? head.description : ''}
        confirmLabel={head?.kind === 'confirm' ? head.confirmLabel : ''}
        onConfirm={() => {
          // 表示中の要求を先に片付けてから起動する（M4 で確定した形）
          const request = head
          closeModal()
          if (request?.kind === 'confirm') void request.onConfirm()
        }}
        onCancel={closeModal}
      />
      <ChoiceDialog
        open={head?.kind === 'choice'}
        title={head?.kind === 'choice' ? head.title : ''}
        description={head?.kind === 'choice' ? head.description : ''}
        primaryLabel={head?.kind === 'choice' ? head.primaryLabel : ''}
        secondaryLabel={head?.kind === 'choice' ? head.secondaryLabel : ''}
        onPrimary={() => {
          const request = head
          closeModal()
          if (request?.kind === 'choice') void request.onPrimary()
        }}
        onSecondary={() => {
          const request = head
          closeModal()
          if (request?.kind === 'choice') void request.onSecondary()
        }}
      />
```

- [ ] **Step 10: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint; npm run build`
Expected: すべて PASS／警告ゼロ。**挙動は M4 と同じ**（削除確認と「破棄して閉じる」が同じように出る）。

- [ ] **Step 11: コミット**

```bash
git add src/core/modal-queue.ts src/core/modal-queue.test.ts src/components/ChoiceDialog.tsx src/components/ChoiceDialog.dom.test.tsx src/App.tsx
git commit -m "M5: モーダルをキュー化し、二択ダイアログを追加する"
```

---

### Task 7: 監視の口（fs 層・Cargo feature・capabilities）とイベントの束ね

**このタスクは Tauri の設定を3箇所同時に触る。1つ欠けても実行時に静かに動かない**（`watch` コマンドは Cargo feature が無ければ存在せず、権限が無ければ ACL 拒否になる）。

- `tauri-plugin-fs` の `watch` コマンドは **Cargo feature `watch`** の後ろにある（`watch = ["notify", "notify-debouncer-full"]`）。現状 `features = []` なので追加が要る。
- `fs:default` に `watch` は含まれない。**`fs:allow-watch` の追記が要る**（`fs:allow-exists` は Task 2 で追加済み）。
- パスの scope は「ダイアログで選んだフォルダ」に実行時付与され、`allow_directory` はフォルダ自身のパターンも許可するので、フォルダの監視は追加の scope 設定なしで通る（`readDir` が通っている事実がその証拠）。

**Files:**
- Create: `src/core/coalesce.ts`
- Create: `src/core/coalesce.test.ts`
- Modify: `src/fs/project-fs.ts`（`watchFolder`）
- Modify: `src/fs/project-fs.test.ts`（`watch` のモックと検証）
- Modify: `src-tauri/Cargo.toml`（`tauri-plugin-fs` に `features = ["watch"]`）
- Modify: `src-tauri/capabilities/default.json`（`fs:allow-watch` / `fs:allow-unwatch`）

**Interfaces:**
- Consumes: `watch`（`@tauri-apps/plugin-fs`）
- Produces:
  - `interface Coalescer { notify(): void; dispose(): void }`
  - `createCoalescer(delayMs: number, run: () => void): Coalescer`
  - `watchFolder(dir: string, onEvent: () => void): Promise<() => void>`（戻り値は監視を止める関数）
  - `WATCH_DEBOUNCE_MS: number`（`src/fs/project-fs.ts`）

---

- [ ] **Step 1: 束ねる純ロジックの失敗するテストを書く**

Create `src/core/coalesce.test.ts`:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createCoalescer } from './coalesce'

describe('createCoalescer', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
  })

  it('立て続けの notify を1回の実行にまとめる', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    coalescer.notify()
    coalescer.notify()
    expect(run).not.toHaveBeenCalled()
    vi.advanceTimersByTime(150)
    expect(run).toHaveBeenCalledTimes(1)
  })

  it('実行後の notify はもう一度走る', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    vi.advanceTimersByTime(150)
    coalescer.notify()
    vi.advanceTimersByTime(150)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it('dispose 後は走らない（監視を止めた後に再走査が飛ばないため）', () => {
    const run = vi.fn()
    const coalescer = createCoalescer(150, run)
    coalescer.notify()
    coalescer.dispose()
    vi.advanceTimersByTime(150)
    expect(run).not.toHaveBeenCalled()
  })
})
```

- [ ] **Step 2: 落ちることを確認する**

Run: `npm test -- src/core/coalesce.test.ts`
Expected: FAIL（`Failed to resolve import "./coalesce"`）

- [ ] **Step 3: `coalesce.ts` を実装する**

Create `src/core/coalesce.ts`:

```ts
/**
 * 立て続けに来る通知を1回の実行に束ねる（末尾で1回だけ走らせる。コア・純ロジック）。
 *
 * fs プラグインの watch は既にデバウンスしているが、**1回のファイル保存でも
 * 複数のイベント（作成・内容変更・メタデータ変更）を個別に送ってくる**ため、
 * 再走査を1回にまとめる層がもう1枚要る。
 * 自動保存のデバウンス（autosave.ts）とは別物——あちらは「書く内容」を
 * まとめるもので、こちらは「読み直す回数」をまとめるもの
 */
export interface Coalescer {
  notify(): void
  dispose(): void
}

export function createCoalescer(delayMs: number, run: () => void): Coalescer {
  let timer: ReturnType<typeof setTimeout> | null = null
  const clear = () => {
    if (timer !== null) {
      clearTimeout(timer)
      timer = null
    }
  }
  return {
    notify() {
      clear()
      timer = setTimeout(() => {
        timer = null
        run()
      }, delayMs)
    },
    dispose() {
      clear()
    },
  }
}
```

- [ ] **Step 4: 通ることを確認する**

Run: `npm test -- src/core/coalesce.test.ts`
Expected: PASS（3件）

- [ ] **Step 5: `watchFolder` の失敗するテストを書く**

Modify `src/fs/project-fs.test.ts` — `vi.mock('@tauri-apps/plugin-fs', ...)` に `watch` を足し（`exists` は Task 2 で追加済み）、動的 import を増やし、テストを追加する:

```ts
const watch = vi.fn()
vi.mock('@tauri-apps/plugin-fs', () => ({
  exists: vi.fn(),
  readDir: vi.fn(),
  readTextFile: vi.fn(),
  writeTextFile: vi.fn(),
  watch: (...args: unknown[]) => watch(...args),
}))
```

```ts
const { moveFileToTrash, watchFolder, WATCH_DEBOUNCE_MS } = await import('./project-fs')
```

```ts
describe('watchFolder', () => {
  it('フォルダを非再帰・デバウンス付きで監視する（rev 3章。ファイル単位では見ない）', async () => {
    const unwatch = vi.fn()
    watch.mockResolvedValue(unwatch)
    const onEvent = vi.fn()
    const stop = await watchFolder('C:\\proj', onEvent)

    expect(watch).toHaveBeenCalledTimes(1)
    const [path, , options] = watch.mock.calls[0]
    expect(path).toBe('C:\\proj')
    expect(options).toEqual({ recursive: false, delayMs: WATCH_DEBOUNCE_MS })

    // イベントの中身は見ない（「何か起きた」だけを伝える）
    const forwarded = watch.mock.calls[0][1] as (event: unknown) => void
    forwarded({ type: 'any', paths: ['C:\\proj\\用語集.json'], attrs: {} })
    expect(onEvent).toHaveBeenCalledTimes(1)
    expect(onEvent).toHaveBeenCalledWith()

    stop()
    expect(unwatch).toHaveBeenCalledTimes(1)
  })
})
```

`beforeEach` に `watch.mockReset()` を足す。

- [ ] **Step 6: 落ちることを確認する**

Run: `npm test -- src/fs/project-fs.test.ts`
Expected: FAIL（`watchFolder` が export されていない）

- [ ] **Step 7: `watchFolder` を実装する**

Modify `src/fs/project-fs.ts` — import に `watch` を足し（`import { exists, readDir, readTextFile, watch, writeTextFile } from '@tauri-apps/plugin-fs'`）、末尾に追加する:

```ts
/**
 * 監視イベントの送出間隔（fs プラグイン側のデバウンス）。
 * 既定は 2000ms で体感が鈍いため短くする。0 にはしない——
 * 1回の保存で大量のイベントが来る
 */
export const WATCH_DEBOUNCE_MS = 300

/**
 * プロジェクトフォルダを監視する。**ファイル単位ではなくフォルダ単位**
 *（rev 3章。外部リネームはファイル監視では取れないため）。
 *
 * **イベントの種類もパスも見ない。** notify のイベント表現は OS ごとに違い、
 * リネームは2イベントに割れる。「何か起きた」だけを呼び出し側へ伝え、
 * 何が変わったかは再走査と台帳の突き合わせが決める（自己書き込みの構造的除外）。
 *
 * `recursive: false`——走査（listJsonFiles）も直下だけなので範囲を合わせる。
 * 戻り値は監視を止める関数。
 *
 * **`watch` は fs プラグインの Cargo feature `watch` と `fs:allow-watch` の
 * 両方が要る**（片方でも欠けると実行時に失敗する。M2 の
 * `core:window:allow-destroy` と同じ罠）
 */
export async function watchFolder(dir: string, onEvent: () => void): Promise<() => void> {
  return watch(dir, () => onEvent(), { recursive: false, delayMs: WATCH_DEBOUNCE_MS })
}
```

- [ ] **Step 8: 通ることを確認する**

Run: `npm test -- src/fs/project-fs.test.ts`
Expected: PASS

- [ ] **Step 9: Rust 側の feature と権限を足す**

Modify `src-tauri/Cargo.toml`:

```toml
# watch feature が無いと plugin:fs|watch コマンド自体が存在しない
# （notify / notify-debouncer-full がその後ろにある）
tauri-plugin-fs = { version = "2", features = ["watch"] }
```

Modify `src-tauri/capabilities/default.json` — `permissions` に追加する:

```json
    "fs:allow-watch",
    "fs:allow-unwatch",
```

`description` を更新する:

```json
  "description": "既定の権限。fs はコマンド許可のみで、パスの scope はダイアログで選んだフォルダ（recursive）に実行時付与される。core:window:allow-destroy は close 横取り（onCloseRequested → preventDefault → flush → destroy）に必要。fs:allow-exists は新規作成の名前解決をディスクに問い合わせるため、fs:allow-watch はフォルダ単位の外部変更検知のため（M5）。監視の停止は Resource#close（core:default 内の core:resources:allow-close）を通るが、fs:allow-unwatch も明示しておく",
```

- [ ] **Step 10: Rust 側が通ることを確認する**

Run: `npm run build; cargo check --manifest-path src-tauri/Cargo.toml`
Expected: `npm run build` が dist/ を生成し、`cargo check` が `Finished` で終わる。**初回は notify 系の依存をコンパイルするので数分かかる。** 警告が出たら消す。

> `cargo check` が「`../dist` が無い」で落ちる場合は `npm run build` が先に失敗している。先に型エラーを直すこと。

- [ ] **Step 11: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint`
Expected: すべて PASS／警告ゼロ。**`watchFolder` はまだ誰も呼んでいない**（配線は Task 8）。

- [ ] **Step 12: コミット**

```bash
git add src/core/coalesce.ts src/core/coalesce.test.ts src/fs/project-fs.ts src/fs/project-fs.test.ts src-tauri/Cargo.toml src-tauri/Cargo.lock src-tauri/capabilities/default.json
git commit -m "M5: フォルダ監視の口を開ける（fs plugin の watch feature と権限を含む）"
```

---

### Task 8: App の配線（検知 → 判断 → 適用）

Task 1〜7 の部品を繋いで M5 の機能を成立させる。**App が持つのは配線だけ**——判断は `planExternalChange`、待ちは `flush`/`settle`、通知とモーダルはキュー、走査は `scanFolder` にある。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/core/project-file.ts:19-24`（`computeIssues` の経路コメントを6本に更新）

**Interfaces:**
- Consumes: `planExternalChange` / `SelectedAction`（`src/core/external-change.ts`）、`scanFolder` / `toProjectFile` / `ScanResult`（`src/core/scan.ts`）、`createCoalescer`（`src/core/coalesce.ts`）、`watchFolder`（`src/fs/project-fs.ts`）、`pushToast` / `dismissToast` / `ToastItem`（`src/core/toasts.ts`）、`ToastStack`（`src/components/Toast.tsx`）、`AutoSaver.hasUnsaved`
- Produces: App 内部の配線のみ（他ファイルからは使わない）

---

- [ ] **Step 1: import と定数を足す**

Modify `src/App.tsx`:

```ts
import { ToastStack } from '@/components/Toast'
import { createCoalescer } from '@/core/coalesce'
import { planExternalChange } from '@/core/external-change'
import { dismissToast, pushToast, type ToastItem } from '@/core/toasts'
import { watchFolder } from '@/fs/project-fs'
```

`const scanIo = ...` の下に:

```ts
/**
 * 監視イベントを束ねる窓。fs プラグイン側のデバウンス（300ms）とは別に、
 * 1回の保存が複数イベントを送ってくるのを1回の再走査にまとめる
 */
const WATCH_COALESCE_MS = 150
```

- [ ] **Step 2: state と ref を足す**

`const knownDisk = useRef(createKnownDisk())` の下に:

```ts
  // 再走査の直列化トークン（後続の再走査・フォルダ切替が始まったら先行の結果は捨てる）
  const scanSeq = useRef(0)
  // 判断の材料は「いま」の値でなければならない（監視イベントは任意のタイミングで来る）。
  // 確認ダイアログを挟む操作と同じ理由・同じ形で ref に写す（M4 で確定）
  const filesRef = useRef<ProjectFile[]>([])
  const projectDirRef = useRef<string | null>(null)
  const selectedModuleRef = useRef<AnyToolModule | undefined>(undefined)
  const [toasts, setToasts] = useState<ToastItem[]>([])
  const toastSeq = useRef(0)
```

`const editingData = ...` の直前あたりに代入を置く（`files` / `projectDir` は既に宣言済み）:

```ts
  filesRef.current = files
  projectDirRef.current = projectDir
```

`selectedModule` の計算（`const selectedModule = selected && ... : undefined`）の**直後**に:

```ts
  // 外部変更で result が rejected になるとモジュールを引けなくなるので、
  // 上書き用に「変更前の」モジュールを保持する
  selectedModuleRef.current = selectedModule
```

`showModal` / `closeModal` の下にトーストの投入口:

```ts
  const showToast = (toast: Omit<ToastItem, 'id'>) =>
    setToasts((prev) => pushToast(prev, { ...toast, id: ++toastSeq.current }))
```

- [ ] **Step 3: `openFolder` に再走査トークンの無効化を足す**

`openFolder` の `const token = ++selectSeq.current` の直後に:

```ts
    // 進行中の再走査の結果を捨てさせる（別フォルダの走査結果を新しい一覧へ混ぜない）
    scanSeq.current++
```

- [ ] **Step 4: 外部変更の適用ハンドラ群を足す**

`ensureGlossary` の**直後**に、この順序で追加する（後ろのものが前のものを呼ぶ形にして、読む順序と依存の順序を揃える）:

```ts
  /**
   * 取り込み前の内容へ戻す（rev 3章。Undo 履歴を破棄した後に残す唯一の復元手段）。
   * **退避しておいた生バイトをそのまま書く**——編集データを再シリアライズすると、
   * 非正規形のまま開いていたファイルで全行 diff が出て、「変更履歴を仕様の
   * 変更履歴として読める」（rev 5章）が壊れる。生バイトなら git diff が空に戻る。
   * 取り込みでファイルが開けなくなった（rejected）場合もこの経路で戻せる
   */
  const revertImport = async (path: string, stashText: string) => {
    try {
      // 書き戻す前に自動保存を止める（取り込み後の内容を書きに行かせない）
      saverRef.current?.dispose()
      saverRef.current = null
      await writeAndRecord(path, stashText)
      await selectFile(path)
      showToast({ key: `external:${path}`, message: '取り込み前の内容に戻しました' })
    } catch (err) {
      setIoError(
        `取り込み前の内容に戻せませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }

  /**
   * 外部変更を取り込む。ディスクを正として `selectFile` で張り直す——
   * 「必ずディスクから読み直す」「検証をやり直す」「saver を張り直す」
   * 「履歴を作り直す」が既存の1本道で揃う（M1 で確定した原則）。
   * **履歴の作り直しが Undo 履歴の破棄そのもの**である——履歴の中身は
   * 取り込み前のファイルを指しており、残すと Ctrl+Z がディスクの内容を
   * 無言で巻き戻す（rev 3章）。
   *
   * 申し送り9節は「取り込みは applyEdit の4本目の経路になる」と予告していたが、
   * applyEdit は「自動保存へ渡す」＋「履歴に record」なので取り込みには合わない
   *（ディスクから読んだ内容を書き戻すことになり、履歴も破棄でなく追加になる）。
   * **applyEdit を通るのは下の overwriteWithMine（上書き）側**
   */
  const importExternalChange = async (path: string, stashText: string | undefined) => {
    await selectFile(path)
    showToast({
      key: `external:${path}`,
      message: '外部の変更を読み込みました（元に戻す操作の履歴は破棄しました）',
      action:
        stashText === undefined
          ? undefined
          : { label: '取り込み前に戻す', run: () => revertImport(path, stashText) },
    })
  }

  /**
   * 自分の編集でディスクを上書きする（二択ダイアログの片側）。
   * **baseline は検知したディスクの内容にする**——古い baseline のままだと
   * 「同じ内容だから書かない」に落ちて、外部の内容が残ったまま画面と食い違う。
   * ここが applyEdit の4本目の経路になる
   */
  const overwriteWithMine = (path: string, diskText: string) => {
    // 確認を挟む操作なので、確定時点の状態は ref から読む（M4 で確定）。
    // 待っている間に選択が変わっていたら何もしない
    if (selectedPathRef.current !== path) return
    const history = historyRef.current
    const module = selectedModuleRef.current
    if (history === null || module === undefined) return
    attachSaver(path, diskText)
    applyEdit(setFiles, saverRef.current, path, module, history.present)
  }

  /** 未保存編集がある状態の外部変更（rev 3章。マージ UI は作らない） */
  const askExternalChange = (selected: { path: string; name: string; diskText: string }) => {
    showModal({
      kind: 'choice',
      // 同じファイルの二択が積み上がらないよう、新しい要求で置き換える
      key: `external:${selected.path}`,
      title: '外部でファイルが変更されました',
      description: `${selected.name} が別のプログラム（AI・エディタ・Git など）によって変更されました。保存していない編集があるため、どちらを残すか選んでください。両方を混ぜることはできません。`,
      primaryLabel: '自分の編集で上書き',
      secondaryLabel: '外部変更を取り込む（自分の編集は破棄）',
      onPrimary: () => overwriteWithMine(selected.path, selected.diskText),
      // 取り込み側に「取り込み前に戻す」は出さない——退避できるのは
      // 取り込み前に**ディスクにあった**内容で、破棄される未保存編集ではないため
      onSecondary: () => importExternalChange(selected.path, undefined),
    })
  }

  /**
   * 開いていたファイルが外部で消えたときの後始末（M4 の deleteFile と同じ形）。
   * **flush しない**——消えたファイルへ書き戻すと、削除されたはずのファイルが
   * 復活する（M4 の削除で踏んだ事故と同じ。申し送り10節）
   */
  const handleSelectedGone = (path: string, name: string) => {
    // 進行中の selectFile / openFolder の結果を捨てさせる
    selectSeq.current++
    saverRef.current?.dispose()
    saverRef.current = null
    setSelectedPath(null)
    setHistory(null)
    setSaveError(null)
    knownDisk.current.delete(path)
    showToast({
      key: `external:${path}`,
      message: `開いていたファイルが外部で削除されました: ${name}`,
    })
  }

  /**
   * 外部変更の取り込み口（rev 3章）。監視イベントを契機にフォルダを再走査し、
   * 「ディスクの生テキスト ≠ 台帳」だけを外部変更として扱う。
   * **自己書き込みの除外はこの突き合わせで構造的に成立する**——アプリの
   * 自動保存・新規作成は書いた内容を台帳へ同時記録し（writeAndRecord）、
   * 削除は一覧と台帳の両方から落とすので、跳ね返ってきたイベントは差分ゼロになる。
   * 戻り値は適用後の一覧（続けて使う呼び出し側のため。null＝適用しなかった）
   */
  const handleExternalChange = async (): Promise<ProjectFile[] | null> => {
    const dir = projectDirRef.current
    if (dir === null) return null
    const token = ++scanSeq.current
    let scan: ScanResult
    try {
      scan = await scanFolder(dir, scanIo, appRegistry)
    } catch (err) {
      setIoError(
        `フォルダの再走査に失敗しました: ${err instanceof Error ? err.message : String(err)}`,
      )
      return null
    }
    // 後続の再走査・フォルダ切替が始まっていたら、この結果は捨てる
    if (token !== scanSeq.current || projectDirRef.current !== dir) return null

    const plan = planExternalChange({
      prev: filesRef.current,
      scan,
      knownText: (path) => knownDisk.current.get(path),
      selectedPath: selectedPathRef.current,
      hasUnsavedEdits: saverRef.current?.hasUnsaved() ?? false,
    })
    // 台帳をディスクの現状へ合わせる。**plan を作った後**でなければ差分が消える。
    // 読めなかったパスは台帳に残す（消えた扱いにしないため）
    for (const entry of scan.entries) knownDisk.current.set(entry.path, entry.text)
    knownDisk.current.retain([...scan.entries.map((e) => e.path), ...scan.unreadable])
    if (!plan.hasChanges) return plan.next

    // 検証は「フォルダ走査時」「ファイル選択時」「編集時」「作成時」「削除時」に続く6本目の経路
    setFiles(computeIssues(plan.next, appRegistry))
    for (const message of plan.notices) showToast({ message })

    const selected = plan.selected
    if (selected.kind === 'reload' || selected.kind === 'ask') {
      // 検知した時点でこのファイルへの自動保存を止める——取り込むか上書きするかを
      // 決める前にディスクが動くと判断の前提が壊れる。再開は確定時（取り込み＝
      // selectFile が張り直す／上書き＝新しい baseline で張り直す）
      saverRef.current?.dispose()
      saverRef.current = null
    }
    switch (selected.kind) {
      case 'none':
        break
      case 'reload':
        await importExternalChange(selected.path, selected.stashText)
        break
      case 'ask':
        askExternalChange(selected)
        break
      case 'gone':
        handleSelectedGone(selected.path, selected.name)
        break
    }
    return plan.next
  }

  // 監視イベントからは常に最新の handleExternalChange を呼ぶ（購読はフォルダごとに1回）
  const handleExternalChangeRef = useRef(handleExternalChange)
  handleExternalChangeRef.current = handleExternalChange
```

- [ ] **Step 5: 監視を張る effect を足す**

グローバル層の keydown リスナーの effect の**下**に追加する:

```ts
  // フォルダ単位の監視（rev 3章。ファイル単位では外部リネームが取れない）。
  // イベントの種類は見ず、束ねて再走査する。フォルダを切り替えたら張り替える
  useEffect(() => {
    if (projectDir === null) return
    const coalescer = createCoalescer(WATCH_COALESCE_MS, () => {
      void handleExternalChangeRef.current()
    })
    let unwatch: (() => void) | null = null
    let stopped = false
    void watchFolder(projectDir, () => coalescer.notify())
      .then((fn) => {
        // effect の後片付けが先に走っていたら、掴んだ監視をその場で止める
        if (stopped) fn()
        else unwatch = fn
      })
      .catch((err: unknown) => {
        setIoError(
          `フォルダの監視を開始できませんでした（外部の変更は自動で反映されません）: ${
            err instanceof Error ? err.message : String(err)
          }`,
        )
      })
    return () => {
      stopped = true
      coalescer.dispose()
      unwatch?.()
    }
  }, [projectDir])
```

- [ ] **Step 6: 新規作成・自動生成を再走査の後に判断させる**

`ensureGlossary` の冒頭を差し替える（**申し送り10節のデータ喪失の再現手順そのものを塞ぐ**——空フォルダを開いた後に Skill が用語集を書いた状態で押されるボタンなので、押下時点のスナップショットは必ず古い）:

```ts
  const ensureGlossary = async () => {
    const module = appRegistry.get('glossary')
    if (projectDirRef.current === null || module === undefined) return
    // 走査時のスナップショットで判断すると、走査後に外部で増えた用語集
    //（Skill が書いたもの）を見落として2つ目を作る。まず再走査する
    const scanned = (await handleExternalChange()) ?? filesRef.current
    const dir = projectDirRef.current
    if (dir === null) return
    try {
      const { path, created } = await ensureFileOfType({
        dir,
        module,
        files: scanned.map((f) => ({ path: f.path, name: f.name, type: f.result.type })),
        join: joinPath,
        write: writeAndRecord,
        exists: fileExists,
      })
      if (created === null) {
        // 既にあった。開くだけ（ディスクから読み直す）
        await selectFile(path)
        return
      }
      await addCreatedFile(created)
    } catch (err) {
      setIoError(
        `用語集を作成できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

> `ensureGlossary` はここで `handleExternalChange` を呼ぶので、**定義位置は `handleExternalChange` より前でよい**（呼ばれるのはクリック時なので TDZ には当たらない）。ただし読みやすさのために、この関数の JSDoc に「押下時に再走査する」旨を1行足すこと。

`createNewFile` は再走査しない（名前解決がディスクを見るので上書きは起きず、singleton でないモジュールは2つ作れて構わない）。**代わりに `addCreatedFile` に同一パスの二重登録ガードを入れる**（申し送り10節の残件。ダブルクリックや遅い IPC で同じパスのエントリが2件でき、`key={file.path}` が重複し単一性違反バッジまで出る）:

```ts
    setFiles((prev) =>
      // ダブルクリックや遅い IPC で同じパスが2回来ても1件に保つ
      prev.some((f) => f.path === created.path) ? prev : computeIssues([...prev, entry], appRegistry),
    )
```

- [ ] **Step 7: トーストを描画する**

`</div>`（サイドバー＋エディタの `flex` を閉じる行）の**後**、`<ConfirmDialog />` の**前**に:

```tsx
      <ToastStack toasts={toasts} onDismiss={(id) => setToasts((prev) => dismissToast(prev, id))} />
```

- [ ] **Step 8: `applyEdit` と `computeIssues` のコメントを更新する**

Modify `src/App.tsx` — `applyEdit` の JSDoc:

```ts
/**
 * 編集後の共通処理: 自動保存へ渡し、整合性検証をやり直す。
 * 通る経路は編集・Undo・Redo・**外部変更の「自分の編集で上書き」**（M5）の4本。
 * 外部変更の「取り込み」はここを通らない——ディスクを正として履歴を作り直す
 * 操作なので selectFile 側に合流させている（M5 で確定）
 */
```

Modify `src/core/project-file.ts` — `computeIssues` の JSDoc:

```ts
/**
 * 全ファイルの整合性検証（レベル2）をやり直す。
 * 現在の呼び出し経路は6本——「フォルダ走査時」「ファイル選択時の読み直し」
 *「編集時」「ファイル作成時」「ファイル削除時」「外部変更の取り込み時」
 *（いずれも src/App.tsx）。必ずここを通すこと
 */
```

- [ ] **Step 9: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint; npm run build`
Expected: すべて PASS／警告ゼロ。

**特に確認すること（型と lint で機械的に拾えない配線）:**
- `writeProjectFile` を直接呼ぶ箇所が App に無い（すべて `writeAndRecord` 経由）。無いと台帳がずれて自分の書き込みを外部変更と誤検知する
- 監視の effect の依存配列が `[projectDir]` で、中身は ref 経由で最新を読んでいる（`handleExternalChange` を直接依存に入れると毎レンダで張り替わる）
- `handleExternalChange` が `knownDisk` の更新を `planExternalChange` の**後**に行っている

- [ ] **Step 10: コミット**

```bash
git add src/App.tsx src/core/project-file.ts
git commit -m "M5: 外部変更の検知・取り込み・二択・外部削除の後始末を配線する"
```

---

### Task 9: 額縁の後始末（削除確定後の入力停止・バナーの役割整理・脱出口の無音失敗）

申し送りが「M5 で決めること」として挙げた残りと、close の脱出口の負債をまとめて塞ぐ。**Task 8 とは独立にレビューできる**（どれも数行で、外部変更の機構には触らない）。

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/fs/app-window.ts`（変更不要の可能性あり。テストのみ追加）
- Create: `src/fs/app-window.test.ts`

**Interfaces:**
- Consumes: `trashFile`（`settle` を要求する形。Task 1）
- Produces: なし（App 内部の配線と回帰テスト）

---

- [ ] **Step 1: `forceClose` が `destroy()` を呼ぶことを固定するテストを書く**

申し送り10節の残件。取り違えると interceptor ループ（**閉じられなくなる**）が再発する。

Create `src/fs/app-window.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from 'vitest'

const destroy = vi.fn()
const close = vi.fn()
const onCloseRequested = vi.fn()
vi.mock('@tauri-apps/api/window', () => ({
  getCurrentWindow: () => ({ destroy, close, onCloseRequested }),
}))

const { forceClose } = await import('./app-window')

beforeEach(() => {
  destroy.mockReset()
  destroy.mockResolvedValue(undefined)
  close.mockReset()
})

describe('forceClose', () => {
  it('destroy を呼ぶ（close だと onCloseRequested が再発火して閉じられなくなる）', async () => {
    await forceClose()
    expect(destroy).toHaveBeenCalledTimes(1)
    expect(close).not.toHaveBeenCalled()
  })

  it('destroy の失敗は呼び出し側へ伝わる（脱出口が無音で失敗しないため）', async () => {
    destroy.mockRejectedValue(new Error('ACL 拒否'))
    await expect(forceClose()).rejects.toThrow('ACL 拒否')
  })
})
```

- [ ] **Step 2: テストを走らせる**

Run: `npm test -- src/fs/app-window.test.ts`
Expected: PASS（`app-window.ts` は既に `destroy()` を呼んでいるので、これは回帰テストとして通る）。**もし落ちたら実装が計画の想定と違うので、落ちた内容を報告してから直すこと。**

- [ ] **Step 3: 「破棄して閉じる」の失敗を可視化する**

申し送り10節の残件（「脱出口として最悪の失敗の仕方をする」）。`showModal` の `onConfirm` は `void` で起動されるので、`forceClose()` の reject は誰も受け取らない——ダイアログは閉じ、`dispose()` が保留編集を捨てた後なので、ユーザーには「押したのに何も起きない（そして編集は失われた）」としか見えない。

Modify `src/App.tsx` — close 横取りの `showModal({ kind: 'confirm', key: 'close', ... })` の `onConfirm` を差し替える:

```ts
        onConfirm: async () => {
          saverRef.current?.dispose()
          try {
            await forceClose()
          } catch (err) {
            // ここが無音だと「押したのに何も起きない（編集は失われている）」に見える
            setIoError(
              `ウィンドウを閉じられませんでした: ${
                err instanceof Error ? err.message : String(err)
              }`,
            )
          }
        },
```

- [ ] **Step 4: 削除の確定時点で入力経路を切る**

申し送り10節が挙げた2つの直し方の①（②は Task 1 の `flush` ループ化で入れた）。`trashFile` が in-flight の write を待つようになった結果、**待っている間もエディタは同じ saver を掴んだままマウントされている**という残余の窓がある。`trash()` の**前**に切り離す。

Modify `src/App.tsx` — `deleteFile` を差し替える:

```ts
  /**
   * ファイルを OS のゴミ箱へ移す（rev 6章。完全削除はしない）。
   * 開いているファイルなら closeCurrentFile を通さない——あれは保留編集を書き切る
   * 経路で、消したファイルを書き戻して復活させる。代わりに trashFile が
   *「書かせない（dispose）」と「進行中の write を待つ（settle）」を担う。
   *
   * **切り離しは trash の前に行う。** trashFile が write の着地を待つ間、
   * エディタが同じ saver を掴んだままだと、その間の打鍵で再武装したタイマーが
   * 生きた write を残せる（申し送り10節の残余の窓）。選択と saver を先に
   * 落としてエディタを畳めば、この窓は構造的に消える
   */
  const deleteFile = async (file: ProjectFile) => {
    // 確認ダイアログを挟むので、選択状態は「押された時点」を ref から読む
    //（このクロージャが作られた時点の selectedPath は既に古いことがある）
    const wasSelected = file.path === selectedPathRef.current
    const saver = wasSelected ? saverRef.current : null
    if (wasSelected) {
      // 進行中の selectFile / openFolder があれば、その結果を捨てさせる
      selectSeq.current++
      saverRef.current = null
      setSelectedPath(null)
      setHistory(null)
      setSaveError(null)
    }
    try {
      await trashFile({ path: file.path, saver, trash: moveFileToTrash })
      knownDisk.current.delete(file.path)
      // 単一性違反はここで解消されうるので、必ず検証をやり直す
      setFiles((prev) => computeIssues(prev.filter((f) => f.path !== file.path), appRegistry))
      setIoError(null)
    } catch (err) {
      // ゴミ箱への移動が失敗した場合、ファイルは残るが選択は外れている
      //（保留編集は trashFile が捨てている。「消す」と決めた操作の副作用として許容）
      setIoError(
        `ファイルを削除できませんでした: ${err instanceof Error ? err.message : String(err)}`,
      )
    }
  }
```

- [ ] **Step 5: `saveError` のクリア条件を決める**

8節から続く未決事項の決着（設計決定7）。**バナーは「いま続いている状態」、トーストは「起きた出来事」**。`saveError` は「いま開いているファイルがディスクに書けていない」状態なので、**そのファイルを離れたら消す**。

Modify `src/App.tsx` — `closeCurrentFile` に1行足す:

```ts
  /** 現在のファイルを閉じる。false＝保留編集を書き切れず中断（saver は生かしたまま） */
  const closeCurrentFile = async (): Promise<boolean> => {
    const saver = saverRef.current
    if (saver) {
      const ok = await saver.flush()
      // flush 失敗時に dispose すると、catch が復元した pending を破棄してしまう
      //（M1 レビューの二重失敗エッジ）。dispose せず中断する
      if (!ok) return false
      saver.dispose()
      saverRef.current = null
    }
    setSelectedPath(null)
    setHistory(null)
    // 「このファイルが書けていない」というバナーは、そのファイルを離れたら消す
    //（onSuccess でしかクリアされないと、書き込みが起きないままファイルを
    //  切り替えたときに前のファイルのバナーが残る。申し送り8節）
    setSaveError(null)
    return true
  }
```

`deleteFile`（Step 4）と `handleSelectedGone`（Task 8）は既に `setSaveError(null)` を含んでいる。`openFolder` は `closeCurrentFile` を通るので追加不要。

- [ ] **Step 6: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint; npm run build`
Expected: すべて PASS／警告ゼロ

- [ ] **Step 7: コミット**

```bash
git add src/App.tsx src/fs/app-window.test.ts
git commit -m "M5: 削除確定時に入力経路を切り、バナーの役割と脱出口の失敗表示を整える"
```

---

### Task 10: 別名パネルが外部変更に追随することを固定する

申し送り9節の「別名パネルを開いたまま外部変更が来ても表示は追随する**はず**」を、テストで「する」に変える。`AliasCell` の下書き再同期は `aliases` の**内容**比較なので追随するはずだが、外部変更は Undo/Redo と違って**データが丸ごと別物に差し替わる**経路であり、既存の回帰テスト（履歴を跨ぐ参照比較の件）とは入力が違う。エディタは `key={selected.path}` なので、同じパスへの取り込みでは**再マウントされない**——ローカル下書きが残ったまま親の値が変わる、まさに事故が起きる形。

**Files:**
- Modify: `src/modules/glossary/GlossaryEditor.dom.test.tsx`

**Interfaces:**
- Consumes: `GlossaryEditor`（`src/modules/glossary/GlossaryEditor.tsx`）
- Produces: なし（テストのみ）

---

- [ ] **Step 1: テストを書く**

Modify `src/modules/glossary/GlossaryEditor.dom.test.tsx` — `describe('GlossaryEditor: 履歴との継ぎ目')` の**後**に追加する:

```tsx
/** 外部変更の取り込みと同じ形の親：data を丸ごと別のオブジェクトに差し替える */
function ImportHarness({ initial, imported }: {
  initial: GlossarySchemaVersion1
  imported: GlossarySchemaVersion1
}) {
  const [data, setData] = useState(initial)
  return (
    <div>
      <button type="button" onClick={() => setData(imported)}>
        外部変更を取り込む
      </button>
      {/* App は key={selected.path} なので、同じパスへの取り込みでは
          エディタは再マウントされない（＝ローカル下書きが残る） */}
      <GlossaryEditor data={data} issues={[]} modalOpen={false} onChange={setData} />
    </div>
  )
}

describe('GlossaryEditor: 外部変更の取り込みとの継ぎ目', () => {
  it('別名パネルを開いたまま取り込みが来ても、パネルの表示がディスクの内容に追随する', () => {
    render(
      <ImportHarness
        initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] })])}
        imported={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['注文'] })])}
      />,
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('オーダー')

    fireEvent.click(screen.getByText('外部変更を取り込む'))
    // ここが古いまま残ると、次の打鍵で取り込んだ内容が消える
    //（参照比較の事故と同じ壊れ方。申し送り9節）
    expect((screen.getByLabelText('別名1') as HTMLInputElement).value).toBe('注文')
  })

  it('取り込みで別名が消えた場合も表示が空になる', () => {
    render(
      <ImportHarness
        initial={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: ['オーダー'] })])}
        imported={glossary([term({ id: 'term_aaaaaaaaaa', name: '受注', aliases: [] })])}
      />,
    )
    fireEvent.focus(screen.getByLabelText('別名（1行目）'))
    fireEvent.click(screen.getByText('外部変更を取り込む'))
    const inputs = screen.getAllByLabelText(/^別名\d/) as HTMLInputElement[]
    expect(inputs.map((el) => el.value)).toEqual([''])
  })
})
```

- [ ] **Step 2: テストを走らせる**

Run: `npm test -- src/modules/glossary/GlossaryEditor.dom.test.tsx`
Expected: PASS（内容比較による再同期が既に入っているため）。

> **落ちたらそれは実装のバグである**（申し送りの「追随するはず」が成り立っていない）。その場合は `AliasCell` の再同期条件を調べ、**テストを緩めずに実装を直すこと**。空配列のケース（2件目）は「下書きに1行だけ空欄を出す」実装なので、期待値が `['']` か `[]` かは実装の空状態の扱いに合わせてよい（そこは仕様ではなく表示の都合）。

- [ ] **Step 3: 全体を通す**

Run: `npm test; npx tsc -b tsconfig.test.json; npm run lint`
Expected: すべて PASS／警告ゼロ

- [ ] **Step 4: コミット**

```bash
git add src/modules/glossary/GlossaryEditor.dom.test.tsx
git commit -m "M5: 別名パネルが外部変更の取り込みに追随することを回帰テストで固定"
```

---

### Task 11: 実機確認（**人間が実行する。サブエージェントは実施しない**）

GUI 操作（フォルダ選択ダイアログ・外部エディタでの保存・エクスプローラでの削除・ウィンドウの ×）は自動化できない。M4 の教訓3（「実機確認を実装者が実行する前提で計画を書いた」）に従い、**全タスク完了後に人間がまとめて行う**。

**準備:** worktree で確認するなら、先に `Get-NetTCPConnection -LocalPort 5173` で他のチェックアウトの dev サーバーがポートを掴んでいないことを確認する（掴まれていると古いコードのアプリが表示される）。確認用フォルダは git 管理下にしておくと `git diff` / `git restore` が使えて楽（`sample-project` が使える）。

- [ ] **1. 自己書き込みでは何も起きない（完了条件5）**: 用語集を開いて1文字編集 → 1秒待つ → **トーストが出ないこと**。続けて新規作成（別 type が無いので `メモ` 等の JSON を外部で作る代わりに、用語集のあるフォルダで削除→ゴミ箱を確認）でもトーストが出ないこと。ここでトーストが出るなら台帳の更新が漏れている（`writeAndRecord` を通っていない書き込みがある）。
- [ ] **2. 外部変更の自動取り込み（完了条件1・2・3）**: 用語集を開いた状態で、VS Code など別エディタで同じファイルの `title` を書き換えて保存 → 1秒以内に画面の表示が変わり、トースト「外部の変更を読み込みました…」が出る → `Ctrl+Z` を押しても**取り込んだ内容が巻き戻らない**（履歴が破棄されている）→ トーストの「取り込み前に戻す」を押す → ファイルが元の内容に戻り、`git diff` が空になる（**バイト一致で戻ることの確認。ここが1行でも差分になったら退避が生バイトになっていない**）。
- [ ] **3. 二択ダイアログ（完了条件4）**: 「未保存編集がある状態」は手では作りにくいので、**書き込みを失敗させて作る**。(a) 用語集ファイルに読み取り専用属性を付ける（`attrib +R <path>`）(b) アプリで1文字編集 → 自動保存が失敗して `saveError` バナーが出る（この状態が `hasUnsaved() === true`）(c) 属性を戻す（`attrib -R <path>`）(d) 別エディタでそのファイルを書き換えて保存 → **二択ダイアログが出る**。「自分の編集で上書き」で自分の内容がディスクに残ること（`git diff` で確認）、もう一度同じ手順で「外部変更を取り込む」で外部の内容が表示されることを確認する。Esc を押しても閉じないことも確認する。
- [ ] **4. 開いているファイルの外部削除（完了条件6）**: 用語集を開いた状態で、エクスプローラでそのファイルを削除 → 選択が外れ、トーストが出て、一覧から消える → **フォルダを開き直してもファイルが復活していないこと**（書き戻しが起きていない）。
- [ ] **5. 外部でファイルが増える／単一性違反（完了条件7）**: 用語集があるフォルダへ、外部から2つ目の用語集 JSON をコピー → 一覧に増え、両方に単一性違反の赤バッジが出る → 片方を削除 → バッジが消える。**M4 の完了条件3はアプリ内だけでは再現できなくなった**（申し送り10節）が、監視が入ったこの経路で確認できる。
- [ ] **6. Skill との同居（完了条件9。申し送り10節のデータ喪失の再現手順そのもの）**: 空フォルダをアプリで開く（「このプロジェクトにはまだ用語集がありません」が出る）→ アプリはそのまま触らず、Claude に `glossary-term-register` で用語登録を頼む → **監視でトーストが出て一覧に用語集が現れ、「用語集を作る」ボタンが消えること**。もしボタンが残っていたら押してみて、**Skill の用語集が上書きされず、2つ目（`用語集-2.json`）が作られること**を確認する（上書きされたら Task 2 が効いていない）。
- [ ] **7. close の取りこぼし（完了条件10）**: 1文字打った直後（0.5秒以内）にウィンドウの × を押す → アプリが閉じ、**ファイルに最後の1文字が入っていること**。
- [ ] **8. フォルダ切替**: 別フォルダを開く → 前のフォルダのファイルを外部で書き換えても**通知が出ないこと**（監視が張り替わっている）。
- [ ] **9. 監視が張れない環境の確認（任意）**: ネットワークドライブ等で `watch` が失敗する場合、`ioError` バナーに「フォルダの監視を開始できませんでした」が出て、**それ以外の機能は使えること**（監視の失敗でアプリが壊れない）。

**結果の記録:** 見つかった不整合は、修正するかどうかに関わらず**実装スコープ定義書の「M5 完了に伴う申し送り」に書く**——レビューの記録は作業ワークスペースと一緒に消えるため、そこが唯一の恒久的な記録である（申し送り10節）。

---

## 計画の自己レビュー（作成時に実施）

**1. 仕様のカバレッジ**: 実装スコープ定義書 4節 M5 の4項目、8節・9節・10節の「M5 で扱うもの」全項目、および10節「残件」のうち M5 が触る3件（`addCreatedFile` の二重登録／`forceClose` の無音失敗／`forceClose` のテスト欠如）にタスクを割り当てた（対応表は「M5 のスコープ」節）。**割り当てなかった残件**は以下で、いずれも M5 の要件と独立に閉じられるため据え置く: `move_to_trash` の同期実行によるウィンドウ固まり／編集1打鍵ごとの全ファイル `checkConsistency`／定義セル・種別セルの `mark(index, field)` 未参照／`@testing-library/user-event` の未使用／`resolveCommand` の非対称／`CellInput` の `caretAtStart` の扱い／`file-naming.ts` の Windows 予約デバイス名（M5 でもユーザー入力は届かない）／`FileList` の `aria-describedby`／`ConfirmDialog.dom.test.tsx` の `getByText` 負債（ただし新設の `ChoiceDialog.dom.test.tsx` は最初から `getByRole('heading')` で書く）。

**2. 申し送りとの明示的な相違**: 9節の「取り込みは `applyEdit` の4本目の経路になる」は**そのままでは成立しない**ため、`selectFile` 経路に合流させた（設計決定4）。`applyEdit` の4本目になるのは「自分の編集で上書き」側。**これは申し送りの予告に対する意図的な変更であり、実装者が「計画が申し送りを読み落とした」と解釈しないよう、両方の文書に理由を残してある。**

**3. 型の一貫性**: `AutoSaver.settle()` は Task 1 で追加し、`trashFile` の `saver` 引数の要求メソッドを `flush` から `settle` に変えた（両方を要求しない）。`buildNewFile` の第2引数は Task 2 で `existingNames` から解決済み `name` に変わり、呼び出し元は `createFile` の1箇所だけ。`ScanEntry`（`src/core/scan.ts`）と既存の `ScannedFile`（`src/core/file-ops.ts` の `ensureFileOfType` 用）は**別の型で名前も別**にしてある（前者は生テキストと `LoadResult`、後者は `type` だけ）。`selectFile` は Task 3 で `ProjectFile` から `path: string` を受け取る形に変わり、呼び出しは `FileList.onSelect` / `addCreatedFile` / `ensureGlossary` / `importExternalChange` / `revertImport` の5箇所。

**4. 順序の依存**: Task 1（`settle`）→ Task 3（台帳）→ Task 4（判断）→ Task 8（配線）は前後できない。Task 2・5・6・7 は Task 8 より前でありさえすればよい。Task 9・10 は Task 8 の後（Task 9 は Task 1 の `settle` と Task 8 の `knownDisk` に触るため）。

