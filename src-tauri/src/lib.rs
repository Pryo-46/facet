/// ファイルを OS のゴミ箱へ移す。
///
/// このアプリで唯一の自前コマンド。Tauri の fs プラグインにゴミ箱 API が無く、
/// `remove` は完全削除になるため、rev 6章「削除はOSのゴミ箱へ移動。完全削除は
/// しない」をプラグインだけでは満たせない。ロジックは TypeScript 側という
/// 原則（rev 7章）は維持し、ここには判断を一切置かない。
#[tauri::command]
fn move_to_trash(path: String) -> Result<(), String> {
    trash::delete(&path).map_err(|e| e.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
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
