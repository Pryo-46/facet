# M13（コア）設計スペック: ファイルに名前をつける／一覧を種類でまとめる

**日付**: 2026-08-14
**範囲**: コア（額縁とファイル一覧）。ツールモジュールは4本とも変更しない（用語集・エラーカタログの `<h2>` 削除を除く）

## 解こうとしている問題

ロジックツリーとシーケンスは**1プロジェクトに何本あってもよい**（`singleton: false`）。ところが名前をつける手段が無いため、ディスク上には `シーケンス.json` / `シーケンス-2.json` / `シーケンス-3.json` が並び、**どれが何の図か画面からもファイル名からも分からない**。

同時に、ファイル一覧は `readDir` の順そのまま（`src/core/scan.ts` の `scanFolder` → `src/fs/project-fs.ts:18`）で、新規作成したファイルは末尾に追加される（`src/core/app-controller.ts:309`）。ソートはコード上どこにも無い。**種類の異なるファイルが順不同で混ざる。**

## 前提の確認: リネームは Claude を壊さない

「ファイル名を変えると Claude がファイルを見失う」という懸念を検討したが、**成立しない**。

- `src/core/reading-guide.md`（facet がプロジェクトに置く AI 向けガイド）が明示している——「ファイル名ではなく、中身の `type` フィールドで種類を判別する（ファイル名は自由）」
- 登録 Skill も同じ判別をする（`.claude/skills/glossary-term-register/SKILL.md:27`）
- **ファイル間の参照はすべて ID 経由**で、パスを持つ箇所が1つも無い（rev 101行目「設定ファイルによるパス管理を持たない」）

したがって採否はリネームの危険では決まらない。決め手は次の2つ。

1. **実装コストが桁で違う。** ファイル名変更は `fs:allow-rename` の capability 追加、`src/fs` への関数追加、自動保存の `dispose()` → `flush()` → rename の順序制御（M4 の削除で踏んだ罠と同型）、**パスごとに内容を持つ外部変更検知の台帳**（rev 87行目）に対する旧パス消滅・新パス出現の自己書き込み除外、`selectedPath` の張り替えと `handleSelectedGone` との競合——が要る。`title` 編集は既存の `onChange` 経路に乗るだけで、Tauri 側の変更がゼロ
2. **連動させても外から壊れる。** エクスプローラでリネームされたとき `title` は追従しない。ファイル名は自由であるという原則を採っている以上、アプリ内で「名前は1つ」に見せるのは、**外の世界がいつでも破れる嘘**になる

→ **`title` を編集可能にする。ファイル名は変えない。**

## 決定

| # | 決定 | 根拠 |
| --- | --- | --- |
| 1 | 名前の実体は JSON の `title`。ファイル名は変えない | 上記。rev 5章「ファイル名は識別子にしない」 |
| 2 | 一覧の行は **主＝`title` / 副＝ファイル名** | 識別子でない方を大きく出しているのは倒錯している |
| 3 | `title` の編集 UI は**額縁のファイル見出し帯**に置く | 4ツール全部が自動で得る。キャンバス2本（ロジックツリー・シーケンス）は `title` の置き場所が無い |
| 4 | 見出しの順は**レジストリの登録順** | 新規作成ボタンが既に同じ順（`FileList.tsx:10`）。揃う |
| 5 | グループ内は `title` の五十音順 | 画面に大きく出ているもので並ぶので、順の根拠が見て分かる |
| 6 | 未知の type は**その type 文字列を見出しに**する | 「ツールが未対応なだけ」と「ファイルが壊れている」を区別できる |
| 7 | 空の `title` は許し、`(無題)` と表示する | rev 5章「拒否は最小限に」。空欄＝未決という原則 |

## A. データと、ファイル見出し帯

### A-1. スキーマは変更しない

`title` は既に全4スキーマの**必須 string**（`schemas/*.schema.json` の `properties.title`、`description: "表示名。プロジェクトのファイル一覧に使う。"`）。追加も改訂も不要で、**`schemaVersion` は上がらない**。マイグレータも型の再生成も要らないため、`open-issues.md` の「`gen-types.mjs` はスキーマが減っても古い型を消さない」は今回踏まない。

`minLength` は無いので `""` はスキーマ上妥当（決定7 と整合）。

### A-2. 編集は既存の `onChange` 経路に乗る

`src/App.tsx:655` のエディタ `onChange` は2行:

```ts
setHistory((h) => (h === null ? h : record(h, next, mergeKey ?? null, Date.now())))
controller.applyEdit(selected.path, selectedModule, next)
```

帯も**同じ closure を呼ぶ**。渡すのは `{ ...editingData, title: 次の値 }`。**`AppController` に新しい API を足さない。**

- `mergeKey` は `'title'` 固定。連続入力が1つの Undo にまとまる
- `applyEdit` は `serialize(next, module.schema)` を通すので、スキーマのキー順に正規化されて保存される

`editingData` は App の層では `unknown` なので、`title` を差し替える小さなヘルパが要る。**`src/core/load.ts` に置く**——生の文書レコードと `title` の関係を既に持っている層だから（`titleOf` も同じ理由でここ。A-3 参照）。`ProjectFile` を受ける `displayTitle`（B-1）だけが `project-file.ts` 側。

```ts
export function withTitle(data: unknown, title: string): unknown {
  return { ...(data as Record<string, unknown>), title }
}
```

### A-3. `applyEdit` が `result.title` を更新していない（要修正）

`src/core/app-controller.ts:290`:

```ts
? { ...f, result: { ...f.result, data: next } }
```

**`data` は差し替えるが `result.title` はそのまま。** 現在 `title` を編集する手段が無いので誰も踏んでいないが、**帯を足した瞬間に踏む**——帯で名前を変えても一覧の表示が古いまま残る。一覧の主表示が `title` である以上、これは「名前を変えたのに一覧が変わらない」という、機能の中心が動かない形で出る。

修正:

```ts
? { ...f, result: { ...f.result, data: next, title: titleOf(next) } }
```

`titleOf` は `typeof r.title === 'string' ? r.title : '(無題)'`。**同じ判定が `src/core/load.ts:42` にあるので、`load.ts` から export して共有する**（複製しない）。

**この修正には回帰テストを付ける。** 無いと静かに元へ戻り、戻ったことは「名前を変えても一覧が変わらない」という形でしか現れない。

### A-4. `FileHeader`（新規）

`src/components/FileHeader.tsx`。`FileList` と同じ規約で、**表示だけを担い、状態も I/O も持たない**（配線は App）。

| props | 型 | |
| --- | --- | --- |
| `title` | `string` | 現在の値 |
| `fileName` | `string` | 副表示 |
| `typeLabel` | `string \| null` | `module.displayName`。未登録なら null |
| `editable` | `boolean` | false なら読み取り専用 |
| `onTitleChange` | `(next: string) => void` | |

- **選択中ファイルが無いときは帯ごと出さない**
- `rejected` / `listOnly` では**読み取り専用**。データを書けないファイルに書き込む入口を作らない（`ensureFileOfType` が `editable` でないファイルを掴む M4 の教訓と同じ筋）
- 用語集・エラーカタログのエディタにある `<h2>{data.title}</h2>`（`src/modules/glossary/GlossaryEditor.tsx:212` / `src/modules/error-catalog/ErrorCatalogEditor.tsx:311`）は**削除し、帯に一本化する**

配置はエディタ領域の直上、全体ツールバー（`src/App.tsx:518` の `<header>`）の下。

## B. 一覧のグループ化とソート

### B-1. `displayTitle`（`src/core/project-file.ts`、既存の `fileName()` の隣）

行の主表示を決める純関数。

- `editable` → `result.title`。空文字なら `(無題)`
- `rejected` / `listOnly` → `result.title` が読めていればそれ、読めなければファイル名

2つ目は「JSON は解釈できたがスキーマ検証に落ちた」ファイルで効く。`load.ts:42` は `title` をスキーマ検証より前に読むので、**壊れたシーケンスでも「受注フロー」だと分かることが多い**。パースすらできなければ `title` は `null` なのでファイル名に落ちる。

### B-2. `groupFiles`（`src/core/file-grouping.ts`、新規）

```ts
export interface FileGroup {
  key: string        // 見出しの安定キー（React の key）
  heading: string    // 表示名
  files: ProjectFile[]
}
export function groupFiles(
  files: readonly ProjectFile[],
  modules: readonly AnyToolModule[],
): FileGroup[]
```

**グループの順**

1. 登録済み module の配列順。`key` = `module.type`、`heading` = `module.displayName`
2. 登録に無い type。`key` = その type 文字列、`heading` = `` `${type}（未対応）` ``。**type 文字列の昇順**で並べる（決定的にするため）
3. type が読めない（`type: null`）。`key` = `'__unknown__'`、`heading` = `種類不明`。最後

**空のグループは返さない。**

**グループ内**は `displayTitle` の `localeCompare('ja')`。**同値のときはファイル名で tie-break する**——無いと、同じ名前のファイルが2つあるだけで順が揺れてテストが落ちる。

### B-3. `FileList` の変更（`src/components/FileList.tsx`）

- props の `files: ProjectFile[]` を `groups: FileGroup[]` に差し替える。App 側で `useMemo(() => groupFiles(files, modules), [files, modules])`
- **`existingTypes` prop は触らない。** 新規作成ボタンのゲート（`canCreateFileOfType`）の意味を変えずに済む
- 構造を `<ul>` 1本から、グループごとの `<h3>` + `<ul>` の繰り返しに変える。見出しは装飾ではなく文書構造なので `<h3>`
- 行の主表示を `displayTitle`、副表示を `file.name` に入れ替える

### B-4. アクセシブル名を変える

現在 `aria-label` はファイル名だけで、`src/components/FileList.dom.test.tsx:148` に「アクセシブル名は『&lt;名前&gt; を開く』で固定」というコメントがある。

主表示が `title` になると、**見えているラベルが accessible name に含まれない**（WCAG 2.5.3 Label in Name）。かといって `title` だけにすると、`title` は空にも重複にもなりうるので `getByRole` が複数拾う。

→ **`${displayTitle}（${file.name}）を開く`**。ファイル名が必ず一意なので一意性が保たれ、見えている主表示も含まれる。削除ボタンも同じ形にする。**既存テストとそのコメントの更新が要る。**

副次的な効果として、同じコメントが挙げている「title がスクリーンリーダーに読まれない（M8 残件4）」の title の部分が解消する。**「開けない」「編集不可」・issue 件数バッジは読まれないままなので、残件そのものは閉じない。**

### B-5. 境界の扱い

| 状況 | 挙動 | 根拠 |
| --- | --- | --- |
| `title` が空文字 | 許す。一覧は `(無題)` をグレーで表示 | rev 5章「拒否は最小限に」。空欄＝未決という原則 |
| `title` が重複 | 許す | 用語集が2つある単一性違反とは別の話。ファイル名が違えば別ファイルとして操作できる |
| 打鍵ごとに一覧が並び替わる | 承知の上で許容 | 編集する場所（帯）が一覧の外なので、行が動いても入力は妨げられない |
| `(無題)` が上に集まる | 許容 | `localeCompare` で `(` は記号なので先頭寄り。名前をつけていないファイルが目に付くのは望ましい |

## テスト

**新規**

- `src/core/file-grouping.test.ts` — 登録順／グループ内の五十音／同名の tie-break／未知 type の昇順／`type: null` が最後／空グループを返さない
- `src/components/FileHeader.dom.test.tsx` — 入力が `onTitleChange` を呼ぶ／`editable: false` で読み取り専用／`typeLabel` が null でも壊れない

**更新**

- `src/components/FileList.dom.test.tsx` — 見出しが出る／主表示が `title`／accessible name の形（既存コメントも直す）
- `src/core/app-controller.test.ts` — **`applyEdit` が `result.title` を引き直すことを固定**（A-3 の回帰テスト）

## 埋めない穴（申し送り）

**帯の `onTitleChange` が `record` と `applyEdit` の両方を呼ぶことを、どのテストも見ない。** `open-issues.md` の「`src/App.tsx` に配線レベルのテストが1件も無い」と同じ性質の穴で、今回も埋めない。ただし**これは本機能の中心の配線**（片方が欠けると「Undo が効かない」か「保存されない」になる）なので、既存の穴より実害が大きい。M13 完了時に `open-issues.md` へ、この配線を名指しで追記する。

## 完了時に触る3箇所（CLAUDE.md の義務）

1. `docs/history/m13-core-file-titles-and-list-grouping.md` を新規作成
2. `docs/open-issues.md` — 上の申し送りを追記
3. `docs/overview-rev.md` — 決定1〜3（名前の実体は `title`／一覧の主表示／額縁が `title` の編集を持つ）を反映。**額縁の責務（rev 6章）に「選択中ファイルの `title` の編集」が加わる**ので、そこへ書く
