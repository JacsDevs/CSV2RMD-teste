//! CLI standalone para gerar .apk/.aab fora do app desktop Tauri — usado em CI.
//! Reaproveita a mesma lógica de `exportador_android::gerar_apk_e_aab` (Fase 5),
//! só que com todos os caminhos de ferramentas passados explicitamente por
//! argumento, em vez de resolvidos via `tauri::AppHandle`.
//!
//! Uso:
//!   build_android \
//!     --html dist/bundle/index.html \
//!     --midias-dir dist/bundle \
//!     --nome-app "Dicionário X" \
//!     --pasta-saida dist/android \
//!     --keystore upload.jks --ks-pass xxx --ks-alias upload --ks-key-pass xxx \
//!     --package-name br.com.org.dicionario --version-name 1.0 --version-code 1 \
//!     [--icone icone.png] \
//!     --aapt2 <path> --zipalign <path> --java <path> \
//!     --android-jar <path> --apksigner-jar <path> --bundletool-jar <path> \
//!     --template-apk <path> --template-dir <path>

use app_lib::exportador_android::{gerar_apk_e_aab, FerramentasAndroid};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

fn parse_args() -> HashMap<String, String> {
    let mut args = HashMap::new();
    let raw: Vec<String> = std::env::args().collect();
    let mut i = 1;
    while i < raw.len() {
        if let Some(flag) = raw[i].strip_prefix("--") {
            let valor = raw.get(i + 1).cloned().unwrap_or_default();
            args.insert(flag.to_string(), valor);
            i += 2;
        } else {
            i += 1;
        }
    }
    args
}

fn obrigatorio<'a>(args: &'a HashMap<String, String>, chave: &str) -> &'a str {
    match args.get(chave) {
        Some(v) if !v.is_empty() => v,
        _ => {
            eprintln!("ERRO: --{chave} é obrigatório.");
            std::process::exit(1);
        }
    }
}

/// Lê recursivamente um diretório, retornando um mapa de caminho-relativo (com
/// barras `/`) → bytes. Usado para coletar mídias (audio/, foto/, video/) do
/// bundle web gerado por tools/build-bundle.mjs, ignorando o próprio index.html
/// (que é lido separadamente via --html).
fn ler_midias_recursivo(base: &Path) -> std::io::Result<HashMap<String, Vec<u8>>> {
    let mut midias = HashMap::new();
    let mut pilha = vec![base.to_path_buf()];
    while let Some(dir) = pilha.pop() {
        for entrada in std::fs::read_dir(&dir)? {
            let entrada = entrada?;
            let caminho = entrada.path();
            if caminho.is_dir() {
                pilha.push(caminho);
            } else {
                let relativo = caminho
                    .strip_prefix(base)
                    .unwrap()
                    .to_string_lossy()
                    .replace('\\', "/");
                if relativo == "index.html" {
                    continue;
                }
                midias.insert(relativo, std::fs::read(&caminho)?);
            }
        }
    }
    Ok(midias)
}

fn main() {
    let args = parse_args();

    let html_path = obrigatorio(&args, "html");
    let html = std::fs::read_to_string(html_path)
        .unwrap_or_else(|e| { eprintln!("Erro ao ler --html '{html_path}': {e}"); std::process::exit(1); });

    let midias_dir = obrigatorio(&args, "midias-dir");
    let midias = ler_midias_recursivo(Path::new(midias_dir))
        .unwrap_or_else(|e| { eprintln!("Erro ao ler --midias-dir '{midias_dir}': {e}"); std::process::exit(1); });
    eprintln!("Mídias coletadas: {} arquivo(s)", midias.len());

    let nome_app = obrigatorio(&args, "nome-app");
    let pasta_saida = PathBuf::from(obrigatorio(&args, "pasta-saida"));

    let icone_bytes = match args.get("icone") {
        Some(p) if !p.is_empty() => std::fs::read(p)
            .unwrap_or_else(|e| { eprintln!("Erro ao ler --icone '{p}': {e}"); std::process::exit(1); }),
        _ => Vec::new(),
    };

    let package_name = args.get("package-name").map(String::as_str).unwrap_or("");
    let version_name = args.get("version-name").map(String::as_str).unwrap_or("");
    let version_code = args.get("version-code").and_then(|v| v.parse::<u32>().ok());

    let ferramentas = FerramentasAndroid {
        aapt2: PathBuf::from(obrigatorio(&args, "aapt2")),
        zipalign: PathBuf::from(obrigatorio(&args, "zipalign")),
        java: PathBuf::from(obrigatorio(&args, "java")),
        android_jar: PathBuf::from(obrigatorio(&args, "android-jar")),
        apksigner_jar: PathBuf::from(obrigatorio(&args, "apksigner-jar")),
        bundletool_jar: PathBuf::from(obrigatorio(&args, "bundletool-jar")),
        template_apk: PathBuf::from(obrigatorio(&args, "template-apk")),
        template_dir: PathBuf::from(obrigatorio(&args, "template-dir")),
    };

    let ks_path = PathBuf::from(obrigatorio(&args, "keystore"));
    let ks_pass = obrigatorio(&args, "ks-pass");
    let ks_alias = obrigatorio(&args, "ks-alias");
    let ks_key_pass = obrigatorio(&args, "ks-key-pass");

    match gerar_apk_e_aab(
        &ferramentas,
        &html,
        nome_app,
        &pasta_saida,
        &ks_path,
        ks_pass,
        ks_alias,
        ks_key_pass,
        &icone_bytes,
        &midias,
        package_name,
        version_name,
        version_code,
    ) {
        Ok(resultado) => {
            println!("APK: {}", resultado.apk);
            println!("AAB: {}", resultado.aab);
            println!("KEYSTORE: {}", resultado.keystore);
        }
        Err(e) => {
            eprintln!("ERRO ao gerar APK/AAB:\n{e}");
            std::process::exit(1);
        }
    }
}
