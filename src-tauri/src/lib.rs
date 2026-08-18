mod pty;

use tauri_plugin_fs::FsExt as _;

/// プロジェクトフォルダ配下の `.claude/` を fs プラグインの実行時 scope に入れる。
///
/// **これが無いと mac で Skill を置けない。** フォルダ選択のダイアログが入れる
/// 許可は `<フォルダ>` と `<フォルダ>/**` の2パターンで、この scope の glob 判定は
/// unix では `require_literal_leading_dot: true` が既定になる（tauri の
/// `scope/fs.rs`。Windows は false）。つまり `**` は `.claude` のような
/// ドット始まりの要素に一致せず、`.claude/skills/` への `exists` が
/// 「forbidden path」で落ちる。**Windows では既定が逆なので表に出ない。**
///
/// **`tauri.conf.json` の `plugins.fs.requireLiteralLeadingDot: false` では
/// これは直らない。** その設定が届くのは capabilities 由来の scope までで
/// （同梱 Skill 側の `.gitignore` を読むために実際に入れてある）、ダイアログが
/// 許可を入れる実行時 scope は `FsScope::default()` から作られており設定を
/// 見ない（tauri-plugin-fs の `lib.rs`）。**2つの scope は別物で、
/// 設定とこのコマンドはどちらも要る。**
///
/// パターンに `.claude` を literal で入れれば判定を通る。ここで許可するのは
/// `.claude` 配下だけで、判断は一切置かない（rev 7章）。
///
/// **2段になっている。** `allow_directory` の `**` はドット始まりの直下要素に
/// 一致しないため、Skill ごとの `.gitignore` はこれだけでは書けない。
/// 同期対象のドットファイルは `allow_file` で1つずつ literal に許可する。
/// 対象は Skill 直下の `.gitignore` のみ——ここに判断は置かない（rev 7章）。
/// 対象ファイルが増えたら TS 側（skill-resources.ts）から渡す形を広げる
#[tauri::command]
fn allow_skill_dir(app: tauri::AppHandle, dir: String, skills: Vec<String>) -> Result<(), String> {
    let scope = app.fs_scope();
    let claude = std::path::Path::new(&dir).join(".claude");
    scope
        .allow_directory(&claude, true)
        .map_err(|e| e.to_string())?;
    for skill in &skills {
        scope
            .allow_file(claude.join("skills").join(skill).join(".gitignore"))
            .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// プロジェクトフォルダを fs プラグインの実行時 scope に入れる。
///
/// フォルダ選択ダイアログが入れる scope はセッション限りで、次回起動には
/// 引き継がれない。**起動時に前回のフォルダを自動で復元する**ときはダイアログ
/// を経由しないため、ここで明示的に取り直す。判断は一切置かない
/// （`allow_skill_dir` と同じ姿勢。rev 7章）
///
/// **前提条件チェック（判断ではない）: `dir` が空文字列なら `Err` を返す。**
/// 最終ブランチレビューで見つかった欠陥への防御——tauri-2.11.5 の scope 実装は
/// 空パスに `MAIN_SEPARATOR + "**"` を足すため、`allow_directory(Path::new(""), true)`
/// は unix では `/**`（fs の実行時 scope をファイルシステム全体へ広げる）に
/// なる。呼び出し元（`src/fs/settings-fs.ts` の `readLastProjectDir`）は既に
/// 空文字列を `null` として弾くが、ここでも弾いておく
#[tauri::command]
fn allow_project_dir(app: tauri::AppHandle, dir: String) -> Result<(), String> {
    if dir.is_empty() {
        return Err("dir must not be empty".to_string());
    }
    let scope = app.fs_scope();
    scope
        .allow_directory(std::path::Path::new(&dir), true)
        .map_err(|e| e.to_string())
}

/// ファイルを OS のゴミ箱へ移す。
///
/// Tauri の fs プラグインにゴミ箱 API が無く、
/// `remove` は完全削除になるため、rev 6章「削除はOSのゴミ箱へ移動。完全削除は
/// しない」をプラグインだけでは満たせない。ロジックは TypeScript 側という
/// 原則（rev 7章）は維持し、ここには判断を一切置かない。
/// **ワーカースレッドで実行する。** Tauri v2 は `async` でないコマンドを
/// メインスレッド上で実行するため、同期のままだと削除中にウィンドウが固まる。
/// `trash::delete` は Windows ではシェルのファイル操作 API を通り、ゴミ箱の
/// 管理情報の更新・ネットワークパス・Defender のスキャンで実時間がかかりうる。
/// `trash` クレートは呼び出しごとに自前で COM を初期化するのでワーカースレッドで問題ない
#[tauri::command]
async fn move_to_trash(path: String) -> Result<(), String> {
    tauri::async_runtime::spawn_blocking(move || trash::delete(&path).map_err(|e| e.to_string()))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // 自動アップデート（M19）。**デスクトップ限定のプラグインなので分けてある。**
    // ここでも判断は持たない——チェックも適用も TypeScript 側から呼ぶ（rev 7章）
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            allow_skill_dir,
            allow_project_dir,
            pty::pty_spawn,
            pty::pty_write,
            pty::pty_resize,
            pty::pty_kill
        ])
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
