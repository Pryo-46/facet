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

既存の `src/fs/project-fs.ts` と同じ方針（「Tauri のファイルアクセスをここに隔離する。コアは Tauri を知らない」）に従い、新規モジュールで隔離する。`project-fs.ts` が `BaseDirectory` を使わず `@tauri-apps/api/path` の `join` で絶対パスを組み立てる流儀に揃え、ここでも `appConfigDir()` + `join` で絶対パスを解決する（`BaseDirectory.AppConfig` は使わない）。

- 保存先: `appConfigDir()`（`@tauri-apps/api/path`）配下の `settings.json`
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

### 3. プロジェクトフォルダの実行時 scope 再付与（Rust コマンド、新規）

**当初の設計に無かった、実装検討で見つかった必須事項。** `dir` の fs scope は、通常はフォルダ選択ダイアログ（`recursive: true`）が実行時に付与する。だが起動時の復元はダイアログを経由しないため、`settings.json` から読んだパスへ `readDir` / `readTextFile` しようとすると scope が無く `forbidden path` で失敗する——ダイアログ由来の scope はセッション限りで、次回起動には引き継がれない。

同じ問題は既に `.claude/`（Skill 同期）で発生しており、`src-tauri/src/lib.rs` の `allow_skill_dir` コマンドと `src/fs/skill-resources.ts` の `allowSkillDir()` がダイアログを介さず scope を付与する前例になっている。同じパターンで、プロジェクトフォルダ全体向けの自前コマンドを追加する:

- `src-tauri/src/lib.rs` に `allow_project_dir(app, dir: String) -> Result<(), String>` を追加。`app.fs_scope().allow_directory(&dir, true)`（`allow_skill_dir` と同じ `FsExt` 経由）を呼ぶだけで、判断は置かない。`invoke_handler` の `generate_handler!` へ登録する。
- `src/fs/project-fs.ts` に `allowProjectDir(dir: string): Promise<void>` を追加し、`invoke('allow_project_dir', { dir })` を呼ぶ。自前コマンドなので `allow_skill_dir` と同様に capabilities への追記は不要。
- 起動時復元フロー（下記4節）で、`fileExists(dir)` より前に呼ぶ。`dir` が既に存在しない場合、`allow_directory` がエラーを返しうるが、復元フロー全体を try/catch で包み、失敗はすべて「フォルダ未選択の通常起動」として握りつぶすので個別の分岐は不要。
- `.claude/` 配下のドット始まり要素に関する追加 scope（既存の `allow_skill_dir`）は、`projectDir` が更新されると自動的に走る Skill 同期 effect（`App.tsx` 546行目付近）が復元経路でも変わらず呼ぶため、ここでは何もしなくてよい。

### 4. 保存タイミング

`src/App.tsx` の `openProject(dir)`（`controller.openFolder(dir)` 成功後に `syncReadingGuide` を呼んでいる箇所）で、成功直後に `saveLastProjectDir(dir)` を呼ぶ。

失敗時（ディスク書き込みエラー等）は `console.error` のみで握りつぶし、トースト通知はしない。保存できなくても次回単に復元されないだけで、当該セッションの作業には影響しないため（`syncReadingGuide` 失敗時のトースト運用とは意図的に非対称にする）。

### 5. 起動時復元

`App.tsx` の `App()` 内にマウント時 `useEffect` を追加する。

```
useEffect(() => {
  if (hasAttemptedRestoreRef.current) return
  hasAttemptedRestoreRef.current = true
  let cancelled = false
  void (async () => {
    try {
      const dir = await readLastProjectDir()
      if (dir === null || cancelled) return
      await allowProjectDir(dir)
      if (cancelled) return
      if (!(await fileExists(dir))) return  // 削除・移動済みなら静かに諦める
      if (cancelled) return
      await openProject(dir)
    } catch (err: unknown) {
      console.error('起動時のフォルダ復元に失敗しました', err)
    }
  })()
  return () => { cancelled = true }
}, [])
```

- `switchFolder` は使わない。起動直後は端末もペインも無いため、その後始末ロジック（`killAllPtys` / `closeAll` / `setPaneOpen(false)`）は不要かつ無意味。
- StrictMode の二重マウント対策として `useRef` の一回性ガード（`hasAttemptedRestoreRef`）を effect の先頭に置き、2回目のマウントでは `readLastProjectDir` の呼び出し自体を省く（走査コスト・二重 open のコストを避ける）。`cancelled` はアンマウント時に非同期処理の続きを止めるための別ガードで、役割が異なるため両方必要。
- `allowProjectDir(dir)` の失敗（`dir` が既に存在しない等）を含め、復元フロー全体を `try/catch` で包み、あらゆる失敗を「フォルダ未選択」の通常起動として扱う（エラー表示なし、`console.error` のみ）。

### 6. StrictMode / Skill 同期との関係

`skillSyncInFlight`（`App.tsx`）が既にフォルダパスキーで同期を重複排除しているため、上記の一回性ガードと合わせて、Skill 同期が二重に走ることはない。新たな重複排除ロジックの追加は不要。

## テスト方針

- `src/fs/settings-fs.ts` の単体テスト: 正常な読み書き、ファイル不在時に `null` を返す、壊れた JSON でも例外を投げず `null` を返す
- `src/App.dom.test.tsx` に統合ケースを追加（既存の `vi.mock('@/fs/project-fs', ...)` に `allowProjectDir` を、新規に `vi.mock('@/fs/settings-fs', ...)` に `readLastProjectDir` / `saveLastProjectDir` を足し、テストから制御できる可変状態にする。他の describe ブロックの前提を崩さないよう、既定値は「復元対象パス無し」に揃える）:
  - 保存済みパスがあり実在する → `allowProjectDir` → `openFolder` の順で呼ばれ、自動で開く
  - 保存済みパスが無い → 何も開かず通常起動
  - 保存済みパスがあるが実在しない → `allowProjectDir` は呼ばれるが `openFolder` は呼ばれず、通常起動
  - `allowProjectDir` が例外を投げても、通常起動にフォールバックする（エラー表示なし）
  - StrictMode 下で二重マウントしても `openFolder` 相当の処理が1回しか走らない
- Rust 側の `allow_project_dir` はスコープ付与を呼ぶだけで判断を持たないため、専用のユニットテストは追加しない（`allow_skill_dir` と同じ扱い）。`cargo test` の既存スイートには影響しないことを確認する。
