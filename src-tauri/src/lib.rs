mod pty;

use tauri_plugin_fs::FsExt as _;

/// プロジェクトフォルダを fs プラグインの実行時 scope に入れる。
///
/// フォルダ選択ダイアログが入れる scope はセッション限りで、次回起動には
/// 引き継がれない。**起動時に前回のフォルダを自動で復元する**ときはダイアログ
/// を経由しないため、ここで明示的に取り直す。判断は一切置かない（rev 7章）。
///
/// **前提条件チェック（判断ではない）: `dir` が空文字列なら `Err` を返す。**
/// tauri-2.11.5 の scope 実装は
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

/// クリップボードの HTML を読む。
///
/// `tauri-plugin-clipboard-manager` は **HTML の読み取り API を持たない**
/// （型定義に「we can read html data only as a string so there's just readText(),
/// no readHtml()」と明記されている）。内部で使っている arboard は `Get::html()` を
/// 持ち Windows 実装も入っているので、公開されていないだけのそれをここで通す。
///
/// **判断もロジックも持たない**（rev 7章）。復号もパースも木の組み立ても TypeScript 側。
#[tauri::command]
fn read_clipboard_html() -> Result<String, String> {
    arboard::Clipboard::new()
        .and_then(|mut clipboard| clipboard.get().html())
        .map_err(|err| err.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init());

    // 自動アップデート。**デスクトップ限定のプラグインなので分けてある。**
    // ここでも判断は持たない——チェックも適用も TypeScript 側から呼ぶ（rev 7章）
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    builder
        .manage(pty::PtyState::default())
        .invoke_handler(tauri::generate_handler![
            move_to_trash,
            allow_project_dir,
            read_clipboard_html,
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
