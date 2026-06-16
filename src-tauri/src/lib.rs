pub mod exportador_android;

#[tauri::command]
fn verificar_java(app: tauri::AppHandle) -> Result<String, String> {
    exportador_android::verificar_java(&app)
}

#[tauri::command]
fn caminho_keystore_auto(app: tauri::AppHandle) -> Result<String, String> {
    exportador_android::caminho_keystore_auto(&app)
}

#[tauri::command]
fn abrir_pasta(caminho: String) -> Result<(), String> {
    exportador_android::abrir_pasta(&caminho)
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
async fn gerar_aplicativo(
    app: tauri::AppHandle,
    html: String,
    nome_app: String,
    pasta_saida: String,
    keystore_path: String,
    store_pass: String,
    key_alias: String,
    key_pass: String,
    nome_responsavel: String,
    organizacao: String,
    cidade: String,
    estado: String,
    pais: String,
    icone_bytes: Vec<u8>,
    midias_extras: Option<std::collections::HashMap<String, Vec<u8>>>,
    package_name: Option<String>,
    version_name: Option<String>,
    version_code: Option<u32>,
) -> Result<exportador_android::ResultadoAndroid, String> {
    exportador_android::gerar_aplicativo(
        &app,
        &html,
        &nome_app,
        &pasta_saida,
        &keystore_path,
        &store_pass,
        &key_alias,
        &key_pass,
        &nome_responsavel,
        &organizacao,
        &cidade,
        &estado,
        &pais,
        &icone_bytes,
        midias_extras.unwrap_or_default(),
        package_name.as_deref().unwrap_or(""),
        version_name.as_deref().unwrap_or(""),
        version_code,
    )
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            verificar_java,
            caminho_keystore_auto,
            abrir_pasta,
            gerar_aplicativo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
