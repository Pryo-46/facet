# アプリの設定（設計）

## 背景・目的

設定を選ぶ画面が無い。`settings.json` は起動時の復元のために `lastProjectDir` を1件持つだけで、テーマは `src/App.tsx` の state なので再起動で消える。キャンバスのパンとズームの手段も固定で、`Ctrl` を押さないとズームできず、盤面を動かすには `Space` か中ボタンが要る。

利用者が見た目と操作の手段を選び、選んだ値が次回起動に残る器を作る。

## スコープ

- 対象: テーマの選択。ライト・ダーク・システムに合わせるの3択
- 対象: キャンバスのパンの手段4つと、ホイールズームの修飾キーの要否
- 対象: 設定画面。カテゴリのタブを持ち、項目が増えても本体を触らずに足せる形にする
- 対象外: 端末ペインの配色。「端末は facet の面ではなく端末の面」の判断は動かさず、ダーク固定のまま
- 対象外: 矩形選択。実装せず、rev 10章が持つ標準操作の予約も落とす
- 対象外: プロジェクト単位の設定。値はアプリ全体に効く

## 設計

### 1. 設定の値（`src/core/settings.ts`、新規）

型・既定値・正規化を持つ純ロジックで、Tauri もファイルシステムも知らない。

```ts
export interface CanvasSettings {
  /** 地の上の左ドラッグでパンする */
  panWithEmptyDrag: boolean
  panWithSpaceDrag: boolean
  panWithMiddleDrag: boolean
  panWithRightDrag: boolean
  /** 修飾キーの無いホイールでズームする */
  zoomWithoutModifier: boolean
}

export interface AppSettings {
  theme: 'light' | 'dark' | 'system'
  canvas: CanvasSettings
}
```

既定値は `theme: 'system'`、`panWithRightDrag: false`、残り4つが `true`。右ドラッグだけ既定を落とすのは、rev 10章が右クリックをコンテキストメニューに予約しているため。

`lastProjectDir` は `AppSettings` に入れない。同じファイルに載るが、利用者が選ぶ値ではなく前回の状態の記録で、設定画面にも出ない。

`normalizeSettings(raw: unknown): AppSettings` が、欠けたキー・型の違う値・列挙にない文字列を既定で埋める。**パンの手段が4つとも false の入力は `panWithEmptyDrag` を true に起こす。** 盤面を動かせないアプリになる状態をファイルから作れないようにするためで、他の値には触らない。

### 2. 保存（`src/fs/settings-fs.ts`、変更）

`settings.json` の位置と読み書きの流儀は現状のまま使う。ファイル全体を読んで JSON オブジェクトとして扱う内部関数を置き、書き込みは**読んで merge して書く**形に統一する。現状の `saveLastProjectDir` はファイルを丸ごと上書きするので、直さないとフォルダを開き直すたびに設定が消える。

- `readSettings(): Promise<AppSettings>` — 読めない・壊れているのいずれでも例外を投げず、`normalizeSettings` を通した既定を返す
- `saveSettings(settings: AppSettings): Promise<void>` — `lastProjectDir` を保ったまま書く
- `readLastProjectDir` は現状のまま。空文字列を素通しさせない判定は fs scope の穴に直結するので触らない
- `saveLastProjectDir` — `canvas` と `theme` を保ったまま書く

`src-tauri/capabilities/default.json` は変更しない。同じ `$APPCONFIG/settings.json` を読み書きするだけで、許可は既に揃っている。

### 3. ストア（`src/core/settings-store.ts`、新規）

`useSyncExternalStore` に渡す `subscribe` / `getSnapshot` と、値を差し替える `set` を持つモジュールスコープのストア。形は `src/App.tsx` の `paneWidthStore` に合わせる。

ストアはファイルを知らない。起動時に `readSettings()` の結果を入れるのも、変更のたびに `saveSettings()` を呼ぶのも `src/App.tsx` の担当で、「コアは Tauri を知らない」という既存の分担をそのまま守る。

キャンバスの3モジュールと `ToolModule` の型には触らない。`useViewport` がフックの中でストアを読むので、props の経路を増やす必要がない。

### 4. ビューポート（`src/core/canvas/use-viewport.ts`、変更）

d3 の `filter` がストアの現在値を毎回読む。**値を effect のクロージャに閉じ込めないこと。** ハンドラはマウント時に1回しか張られないので、閉じ込めると最初の値で凍り、設定を変えても挙動が変わらない。既存の `enabledRef` と `spaceHeldRef` が同じ理由で ref を経由している。

`filter` の判定は次のとおり。

- `wheel` — `ctrlKey` か `metaKey` があれば常に通す。無ければ `zoomWithoutModifier`
- `mousedown` の button 0 — `spaceHeld && panWithSpaceDrag`、または地の上かつ `panWithEmptyDrag`
- button 1 — `panWithMiddleDrag`
- button 2 — `panWithRightDrag`

**地の判定は `event.target === container` で行う。** 3モジュールとも背景・エッジ・ノード層は `pointer-events-none` で、箱と行とチップだけが `auto` に戻る構造なので、地に当たったクリックの `target` はコンテナ自身になる。地の位置に `pointer-events` を持つ要素を足すとこの判定が崩れるので、罠としてコメントに残す。

`panWithRightDrag` が true の間だけ、コンテナに `contextmenu` の `preventDefault` を張る。false の間は張らないので、OS のメニューは現状どおり出る。

`Space` の押下監視は `panWithSpaceDrag` が false のとき止める。`Space` を奪わずページの既定に返すため。

### 5. テーマ（`src/core/theme.ts`、新規）

`resolveTheme(setting: Theme, systemPrefersDark: boolean): 'light' | 'dark'` が実効テーマを決める純関数。

適用の口は現状の `document.documentElement.classList.toggle('dark', …)` を使う。端末ペインは `src/styles/palette.css` の `.dark` クラスセレクタに依存しているので、クラスの付け外しという形を保つ限り端末側も `palette.css` も変更が要らない。

`setting` が `'system'` のときだけ `matchMedia('(prefers-color-scheme: dark)')` の変更を購読する。jsdom は `matchMedia` を持たないので、`src/test-setup.ts` にスタブを足す。

トップバーのテーマトグルは残す。押すとライトかダークの明示選択になり、その時点で `'system'` から外れる。ボタンの名前は実効テーマの逆を出す既存の規約に従う。

### 6. 設定画面

新しく置く部品は5本。

- `src/components/ui/dialog.tsx` — shadcn の Dialog。`radix-ui` の統合パッケージは導入済みで、追加依存は無い
- `src/components/ui/tabs.tsx` — shadcn の Tabs
- `src/components/SettingsDialog.tsx` — タブの枠と開閉
- `src/components/settings/GeneralSettings.tsx` — テーマ
- `src/components/settings/InputSettings.tsx` — パンとズーム

**土台は `AlertDialog` ではなく `Dialog` にする。** 既存のダイアログ3本は `AlertDialog` を土台にしているが、`role="alertdialog"` は応答を要する重要な通知の意味で、設定画面は該当しない。`Esc` とオーバーレイクリックで閉じる配線は `TableCopyDialog` の形をそのまま使う。

タブは配列で宣言し、`SettingsDialog` はそれを回してタブとパネルを組むだけにする。カテゴリを足すときはパネルを1本書いて配列に1行足す。

```ts
const SETTINGS_TABS = [
  { id: 'general', label: '一般', Panel: GeneralSettings },
  { id: 'input', label: '操作', Panel: InputSettings },
] as const
```

タブの選択は覚えず、開くたび先頭から始める。矢印キーでのタブ移動は Radix の Tabs が持つので自前で作らない。

開閉は `src/App.tsx` の state が持ち、モーダルキューには積まない。キューはアプリが出す要求を並べる器で、利用者が能動的に開く画面は性質が違う。開いている間は `KeyContext.modalOpen` を true にして操作言語を止める。

入口はトップバー右端、テーマのトグルの隣に歯車のボタンを置く。

パンの4つは、有効なものが1つだけになった時点でそのトグルを `disabled` にし、`title` で理由を出す。値の変更は即座に効いて保存し、OK とキャンセルは置かない。5つとも独立したトグルで、まとめて確定する意味がないため。

### 7. 文書の更新

`docs/overview-rev.md` 10章「キャンバス」の標準操作の行を置き換える。矩形選択の予約を落とし、パンとズームは既定の手段とアプリの設定で選べることを書く。「キャンバスのズーム・パンにはキーボード経路を作らない」は変えない。

`docs/open-issues.md` に1件足す。右ドラッグを有効にしている間はキャンバスの `contextmenu` を止めるので、将来コンテキストメニューを作るときに衝突する。

### 8. テスト

- `settings.ts` の正規化。欠けたキー・型違い・列挙外の文字列・パン4つが全て false の入力
- `settings-fs.ts` の merge。`lastProjectDir` を保ったまま設定を書くことと、その逆
- `theme.ts` の `resolveTheme` の真理値表
- `use-viewport.dom.test.tsx` に、5つのトグルそれぞれの on と off で `filter` の通し方が変わることを見るケース
- `SettingsDialog` の DOM テスト。タブの切り替えと、最後に残ったパンのトグルが `disabled` になること
- テーマが `'system'` のときだけ `matchMedia` の変更に追従すること
