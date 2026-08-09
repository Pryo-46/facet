/// ファイルを OS のゴミ箱へ移す。
///
/// このアプリで唯一の自前コマンド。Tauri の fs プラグインにゴミ箱 API が無く、
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
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .invoke_handler(tauri::generate_handler![move_to_trash])
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
