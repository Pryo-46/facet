# 起動時に最後に開いていたフォルダを復元する（設計）

## 背景・目的

現状、`projectDir`（開いているフォルダ）はインメモリのみで保持され（`src/core/app-controller.ts` のクロージャ変数）、アプリを再起動すると必ずフォルダ未選択の状態に戻る。永続化の仕組みは現状どこにも無い（`tauri-plugin-store` 等は未導入、`localStorage` も未使用）。

本設計は、直近に開いていたフォルダのパスをディスクに永続化し、次回起動時に自動で復元することを目的とする。

`src/App.tsx` の `skillSyncInFlight` 周辺コメントに、この機能をにらんだ既存の設計判断がある: 「起動時に前回のフォルダを復元する」を足すと、マウント時に `projectDir` が非 null になるため、StrictMode の二重マウントで Skill 同期 effect も二重に走りうる。そのケースは `skillSyncInFlight`（フォルダパスをキーにした Map ベースの重複排除）で既に塞いである。

## スコープ

- 対象: フォルダを開いた際に、そのパスを永続化する。アプリ起動時、永続化されたパスがあり、かつそのフォルダが実在すれば自動で開く。
- 対象外: 「最近開いたフォルダの一覧」など複数件の履歴管理。今回は直近1件のみ。
- 対象外: 復元に失敗した場合のユーザー通知（トースト等）。静かに通常起動する。

## 設計

### 1. 永続化ファイル（`src/fs/settings-fs.ts`、新規）

既存の `src/fs/project-fs.ts` と同じ方針（「Tauri のファイルアクセスをここに隔離する。コアは Tauri を知らない」）に従い、新規モジュールで隔離する。

- 保存先: アプリ設定ディレクトリ（`@tauri-apps/plugin-fs` の `BaseDirectory.AppConfig`）配下の `settings.json`
- 内容: `{ "lastProjectDir": "<絶対パス>" }`
- 関数:
  - `readLastProjectDir(): Promise<string | null>` — ファイルが無い／読めない／JSON として壊れている／`lastProjectDir` が無い、のいずれでも例外を投げず `null` を返す
  - `saveLastProjectDir(dir: string): Promise<void>` — 設定ディレクトリが無ければ `mkdir`（`recursive: true`）してから `writeTextFile`

### 2. capabilities（`src-tauri/capabilities/default.json`）

現行の fs 許可はコマンド許可のみで、パスの scope はダイアログ選択時に実行時付与される設計（同ファイルの `description` 参照）。アプリ設定ディレクトリはダイアログ経由ではないため、`$RESOURCE/skills` と同様に明示スコープを追記する:

```json
{
  "identifier": "fs:allow-read-text-file",
  "allow": [{ "path": "$APPCONFIG/settings.json" }]
},
{
  "identifier": "fs:allow-write-text-file",
  "allow": [{ "path": "$APPCONFIG/settings.json" }]
},
{
  "identifier": "fs:allow-exists",
  "allow": [{ "path": "$APPCONFIG" }, { "path": "$APPCONFIG/settings.json" }]
},
{
  "identifier": "fs:allow-mkdir",
  "allow": [{ "path": "$APPCONFIG" }]
}
```

`description` 冒頭の説明コメントにも、既存の書式（各許可の理由を短く追記するスタイル）に倣って一文追記する。

### 3. 保存タイミング

`src/App.tsx` の `openProject(dir)`（`controller.openFolder(dir)` 成功後に `syncReadingGuide` を呼んでいる箇所）で、成功直後に `saveLastProjectDir(dir)` を呼ぶ。

失敗時（ディスク書き込みエラー等）は `console.error` のみで握りつぶし、トースト通知はしない。保存できなくても次回単に復元されないだけで、当該セッションの作業には影響しないため（`syncReadingGuide` 失敗時のトースト運用とは意図的に非対称にする）。

### 4. 起動時復元

`App.tsx` の `App()` 内にマウント時 `useEffect` を追加する。

```
useEffect(() => {
  let cancelled = false
  void (async () => {
    const dir = await readLastProjectDir()
    if (dir === null || cancelled) return
    if (!(await fileExists(dir))) return  // 削除・移動済みなら静かに諦める
    await openProject(dir)
  })()
  return () => { cancelled = true }
}, [])
```

- `switchFolder` は使わない。起動直後は端末もペインも無いため、その後始末ロジック（`killAllPtys` / `closeAll` / `setPaneOpen(false)`）は不要かつ無意味。
- StrictMode の二重マウント対策として、上記の `cancelled` フラグに加えて `useRef` の一回性ガード（`hasAttemptedRestoreRef`）を effect の先頭に置き、2回目のマウントでは `readLastProjectDir` の呼び出し自体を省く（走査コスト・二重 open のコストを避ける）。
- 復元先フォルダが既に存在しない場合、および `settings.json` の読み込み・パースに失敗した場合は、いずれも「フォルダ未選択」の通常起動として扱う（エラー表示なし）。

### 5. StrictMode / Skill 同期との関係

`skillSyncInFlight`（`App.tsx`）が既にフォルダパスキーで同期を重複排除しているため、上記の一回性ガードと合わせて、Skill 同期が二重に走ることはない。新たな重複排除ロジックの追加は不要。

## テスト方針

- `src/fs/settings-fs.ts` の単体テスト: 正常な読み書き、ファイル不在時に `null` を返す、壊れた JSON でも例外を投げず `null` を返す
- `src/App.dom.test.tsx` に統合ケースを追加:
  - 保存済みパスがあり実在する → 自動で開く
  - 保存済みパスが無い → 何も開かず通常起動
  - 保存済みパスがあるが実在しない → 何も開かず通常起動
  - StrictMode 下で二重マウントしても `openFolder` 相当の処理が1回しか走らない
