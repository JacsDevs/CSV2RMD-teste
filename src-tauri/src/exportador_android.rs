use std::collections::HashMap;
use std::io::{Cursor, Read, Write};
use std::path::{Path, PathBuf};
use std::process::Command;
use tauri::Manager;
use zip::write::SimpleFileOptions;
use zip::{CompressionMethod, ZipArchive, ZipWriter};

// ---------------------------------------------------------------------------
// Resolução de caminhos
// ---------------------------------------------------------------------------

/// Remove o prefixo \\?\ (extended-length path) que a Tauri API retorna no
/// Windows em modo release. Ferramentas Java como bundletool e apksigner não
/// sabem interpretar esse formato e falham ao tentar abrir seus próprios JARs.
fn normalizar_caminho(p: PathBuf) -> PathBuf {
    #[cfg(windows)]
    {
        let s = p.to_string_lossy();
        if let Some(rest) = s.strip_prefix(r"\\?\") {
            return PathBuf::from(rest.to_string());
        }
    }
    p
}

fn resources_dir(_app: &tauri::AppHandle) -> PathBuf {
    #[cfg(debug_assertions)]
    {
        PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources")
    }
    #[cfg(not(debug_assertions))]
    {
        let p = _app.path()
            .resource_dir()
            .expect("resource_dir não encontrado")
            .join("resources");
        normalizar_caminho(p)
    }
}

fn buscar_bin(app: &tauri::AppHandle, nome: &str) -> Result<PathBuf, String> {
    let p = resources_dir(app).join("jre").join("bin").join(nome);
    if p.exists() {
        return Ok(p);
    }
    let locator = if cfg!(windows) { "where" } else { "which" };
    let out = Command::new(locator).arg(nome).output().ok();
    if let Some(out) = out {
        if out.status.success() {
            let linha = String::from_utf8_lossy(&out.stdout)
                .lines()
                .next()
                .unwrap_or("")
                .trim()
                .to_owned();
            if !linha.is_empty() {
                return Ok(PathBuf::from(linha));
            }
        }
    }
    Err(format!(
        "{nome} não encontrado em {}.\nExecute scripts/prepare-resources.",
        resources_dir(app).join("jre").join("bin").join(nome).display()
    ))
}

fn java(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    buscar_bin(app, if cfg!(windows) { "java.exe" } else { "java" })
}

fn keytool(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    buscar_bin(app, if cfg!(windows) { "keytool.exe" } else { "keytool" })
}

fn jarsigner(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    buscar_bin(app, if cfg!(windows) { "jarsigner.exe" } else { "jarsigner" })
}

fn buscar_android_sdk_bin(app: &tauri::AppHandle, nome: &str) -> Result<PathBuf, String> {
    let p = resources_dir(app).join("android-sdk").join(nome);
    if p.exists() {
        Ok(p)
    } else {
        Err(format!(
            "{nome} não encontrado em {}.\nExecute scripts/prepare-resources.",
            p.display()
        ))
    }
}

fn aapt2(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    buscar_android_sdk_bin(app, if cfg!(windows) { "aapt2.exe" } else { "aapt2" })
}

fn zipalign(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    buscar_android_sdk_bin(app, if cfg!(windows) { "zipalign.exe" } else { "zipalign" })
}

fn caminho_recurso_obrigatorio(app: &tauri::AppHandle, rel: &str) -> Result<PathBuf, String> {
    let p = resources_dir(app).join(rel);
    if p.exists() {
        Ok(p)
    } else {
        Err(format!(
            "{rel} não encontrado em {}.\nExecute scripts/prepare-resources.",
            p.display()
        ))
    }
}

// ---------------------------------------------------------------------------
// Keystore (inalterado — apenas usa keytool, independente do pipeline de build)
// ---------------------------------------------------------------------------

fn caminho_keystore_padrao(app: &tauri::AppHandle) -> Result<PathBuf, String> {
    let dir = app
        .path()
        .app_data_dir()
        .map_err(|e| format!("Erro ao obter diretório de dados: {e}"))?;
    Ok(normalizar_caminho(dir).join("upload.jks"))
}

fn garantir_keystore_auto(
    app: &tauri::AppHandle,
    alias: &str,
    senha: &str,
    nome_responsavel: &str,
    organizacao: &str,
    cidade: &str,
    estado: &str,
    pais: &str,
) -> Result<PathBuf, String> {
    let ks = caminho_keystore_padrao(app)?;
    if ks.exists() {
        // Valida a senha antes de prosseguir — se estiver errada, o erro do apksigner é críptico.
        if let Ok(kt) = keytool(app) {
            let check = Command::new(&kt)
                .args([
                    "-list",
                    "-keystore", ks.to_str().unwrap_or(""),
                    "-storepass", senha,
                ])
                .output();
            if let Ok(out) = check {
                if !out.status.success() {
                    return Err(format!(
                        "Senha incorreta para o keystore automático.\n\
                        O keystore em '{}' foi criado com uma senha diferente.\n\
                        Use a mesma senha da primeira geração, ou apague o arquivo para criar um novo keystore.",
                        ks.display()
                    ));
                }
            }
        }
        return Ok(ks);
    }
    std::fs::create_dir_all(ks.parent().unwrap())
        .map_err(|e| format!("Erro ao criar pasta de dados: {e}"))?;

    let cn = if nome_responsavel.is_empty() { "App" } else { nome_responsavel };
    let o  = if organizacao.is_empty() { "App" } else { organizacao };
    let l  = if cidade.is_empty() { "Unknown" } else { cidade };
    let st = if estado.is_empty() { "Unknown" } else { estado };
    let c  = if pais.is_empty() { "BR" } else { pais };
    let dname = format!("CN={cn}, O={o}, L={l}, ST={st}, C={c}");

    let kt = keytool(app)?;
    let saida = Command::new(&kt)
        .args([
            "-J-Dfile.encoding=UTF-8",
            "-J-Dstdout.encoding=UTF-8",
            "-genkeypair",
            "-v",
            "-keystore",  ks.to_str().unwrap(),
            "-alias",     alias,
            "-keyalg",    "RSA",
            "-keysize",   "4096",
            "-validity",  "10000",
            "-storetype", "PKCS12",
            "-storepass", senha,
            "-keypass",   senha,
            "-dname",     &dname,
        ])
        .output()
        .map_err(|e| format!("Erro ao executar keytool: {e}"))?;

    if saida.status.success() {
        Ok(ks)
    } else {
        Err(format!(
            "keytool falhou:\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&saida.stdout),
            String::from_utf8_lossy(&saida.stderr)
        ))
    }
}

fn listar_aliases_keystore(
    app: &tauri::AppHandle,
    ks_path: &Path,
    store_pass: &str,
) -> Vec<String> {
    let kt = match keytool(app) {
        Ok(k) => k,
        Err(_) => return vec![],
    };
    let output = match Command::new(&kt)
        .args([
            "-J-Dfile.encoding=UTF-8",
            "-list",
            "-keystore", ks_path.to_str().unwrap_or(""),
            "-storepass", store_pass,
        ])
        .output()
    {
        Ok(o) => o,
        Err(_) => return vec![],
    };

    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut aliases = Vec::new();

    for line in stdout.lines() {
        let trimmed = line.trim();
        // Formato do keytool: "alias, data, PrivateKeyEntry, ..."
        if trimmed.contains("PrivateKeyEntry")
            || trimmed.contains("SecretKeyEntry")
            || trimmed.contains("trustedCertEntry")
        {
            if let Some(alias) = trimmed.split(',').next() {
                let a = alias.trim().to_string();
                if !a.is_empty() {
                    aliases.push(a);
                }
            }
        }
    }

    aliases
}

// ---------------------------------------------------------------------------
// Utilitários de zip e XML
// ---------------------------------------------------------------------------

fn escapar_xml(texto: &str) -> String {
    texto
        .replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
        .replace('\'', "&apos;")
}

fn extrair_entrada_zip(zip_bytes: &[u8], nome_entrada: &str) -> Result<Vec<u8>, String> {
    let mut zip = ZipArchive::new(Cursor::new(zip_bytes))
        .map_err(|e| format!("Erro ao abrir zip: {e}"))?;
    let mut entrada = zip
        .by_name(nome_entrada)
        .map_err(|e| format!("Entrada '{nome_entrada}' não encontrada no zip: {e}"))?;
    let mut buf = Vec::new();
    entrada
        .read_to_end(&mut buf)
        .map_err(|e| format!("Erro ao ler '{nome_entrada}': {e}"))?;
    Ok(buf)
}

/// Copia todas as entradas de um zip para um novo, opcionalmente renomeando
/// algumas (de, para) e adicionando novas entradas (nome, bytes) ao final.
/// Usado para injetar classes.dex (fixo, vindo do template.apk) e os assets
/// (html + mídias) tanto no APK direto quanto no módulo base do AAB.
///
/// Assets são injetados aqui (em vez de via `aapt2 link -A <dir>`) porque o
/// aapt2.exe no Windows grava entradas de subpastas com separador misto
/// (ex: "assets/audio\som.mp3" em vez de "assets/audio/som.mp3") ao percorrer
/// o diretório — o Android faz match exato de caminho, então o WebView não
/// encontra o arquivo. Construindo o nome da entrada nós mesmos (sempre com
/// "/"), evitamos esse problema independente de SO.
fn transformar_zip(
    bytes: &[u8],
    renomear: &[(&str, &str)],
    adicionar: &[(String, &[u8])],
) -> Result<Vec<u8>, String> {
    let mut zip = ZipArchive::new(Cursor::new(bytes)).map_err(|e| format!("Erro ao abrir zip: {e}"))?;
    let mut saida = Vec::new();
    {
        let mut w = ZipWriter::new(Cursor::new(&mut saida));

        for i in 0..zip.len() {
            let mut e = zip
                .by_index(i)
                .map_err(|err| format!("Erro ao ler entrada {i}: {err}"))?;
            let nome_original = e.name().to_owned();
            let nome_final = renomear
                .iter()
                .find(|(de, _)| *de == nome_original)
                .map(|(_, para)| para.to_string())
                .unwrap_or(nome_original);

            // Preserva o método de compressão original de cada entrada.
            // CRÍTICO: resources.arsc é gravado STORED (sem compressão) pelo aapt2,
            // pois o Android mapeia esse arquivo direto na memória; recomprimi-lo
            // (como acontecia antes, com Deflated fixo) faz a instalação do APK
            // falhar silenciosamente em dispositivos reais ("app não instalado").
            let opts = SimpleFileOptions::default().compression_method(e.compression());

            let mut buf = Vec::new();
            e.read_to_end(&mut buf)
                .map_err(|err| format!("Erro ao ler {nome_final}: {err}"))?;

            w.start_file(&nome_final, opts)
                .map_err(|err| format!("Erro ao adicionar {nome_final}: {err}"))?;
            w.write_all(&buf)
                .map_err(|err| format!("Erro ao escrever {nome_final}: {err}"))?;
        }

        let opts_novos = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
        for (nome, conteudo) in adicionar {
            w.start_file(nome, opts_novos)
                .map_err(|err| format!("Erro ao adicionar {nome}: {err}"))?;
            w.write_all(conteudo)
                .map_err(|err| format!("Erro ao escrever {nome}: {err}"))?;
        }

        w.finish().map_err(|err| format!("Erro ao finalizar zip: {err}"))?;
    }
    Ok(saida)
}

// ---------------------------------------------------------------------------
// Sanitização do nome para arquivo
// ---------------------------------------------------------------------------

fn sanitizar_nome(nome: &str) -> String {
    let s: String = nome
        .chars()
        .map(|c| match c {
            'a'..='z' | 'A'..='Z' | '0'..='9' | '-' => c,
            ' ' | '_' => '_',
            _ => '_',
        })
        .collect();
    let s = s.trim_matches('_').to_lowercase();
    if s.is_empty() { "dicionario".to_owned() } else { s }
}

// ---------------------------------------------------------------------------
// Resultado serializado para o frontend
// ---------------------------------------------------------------------------

#[derive(serde::Serialize)]
pub struct ResultadoAndroid {
    pub aab: String,
    pub apk: String,
    pub keystore: String,
}

// ---------------------------------------------------------------------------
// Comandos públicos
// ---------------------------------------------------------------------------

/// Retorna a versão do Java embutido.
pub fn verificar_java(app: &tauri::AppHandle) -> Result<String, String> {
    let j = java(app)?;
    let out = Command::new(&j)
        .arg("-version")
        .output()
        .map_err(|e| format!("Erro ao executar java: {e}"))?;
    Ok(String::from_utf8_lossy(&out.stderr).trim().to_string())
}

/// Retorna o caminho do keystore automático (para exibir no modal).
pub fn caminho_keystore_auto(app: &tauri::AppHandle) -> Result<String, String> {
    Ok(caminho_keystore_padrao(app)?
        .to_string_lossy()
        .to_string())
}

/// Abre o explorador de arquivos na pasta indicada.
pub fn abrir_pasta(caminho: &str) -> Result<(), String> {
    #[cfg(windows)]
    {
        Command::new("explorer")
            .arg(caminho)
            .spawn()
            .map_err(|e| format!("Erro ao abrir pasta: {e}"))?;
    }
    #[cfg(target_os = "macos")]
    {
        Command::new("open")
            .arg(caminho)
            .spawn()
            .map_err(|e| format!("Erro ao abrir pasta: {e}"))?;
    }
    #[cfg(target_os = "linux")]
    {
        Command::new("xdg-open")
            .arg(caminho)
            .spawn()
            .map_err(|e| format!("Erro ao abrir pasta: {e}"))?;
    }
    Ok(())
}

/// Comando Tauri: resolve ferramentas/keystore via AppHandle e delega a
/// lógica de geração (independente de Tauri) para `gerar_apk_e_aab`.
#[allow(clippy::too_many_arguments)]
pub fn gerar_aplicativo(
    app: &tauri::AppHandle,
    html: &str,
    nome_app: &str,
    pasta_saida: &str,
    keystore_path: &str,
    store_pass: &str,
    key_alias: &str,
    key_pass: &str,
    nome_responsavel: &str,
    organizacao: &str,
    cidade: &str,
    estado: &str,
    pais: &str,
    icone_bytes: &[u8],
    midias_extras: HashMap<String, Vec<u8>>,
    package_name: &str,
    version_name: &str,
    version_code: Option<u32>,
) -> Result<ResultadoAndroid, String> {
    let ferramentas = FerramentasAndroid {
        aapt2: aapt2(app)?,
        zipalign: zipalign(app)?,
        java: java(app)?,
        jarsigner: jarsigner(app)?,
        android_jar: caminho_recurso_obrigatorio(app, "android-sdk/android.jar")?,
        apksigner_jar: Some(caminho_recurso_obrigatorio(app, "android-sdk/apksigner.jar")?),
        bundletool_jar: caminho_recurso_obrigatorio(app, "bundletool.jar")?,
        template_apk: caminho_recurso_obrigatorio(app, "template.apk")?,
        template_dir: resources_dir(app).join("android-template"),
    };
    if !ferramentas.template_dir.exists() {
        return Err(format!(
            "android-template não encontrado em {}.\nExecute scripts/prepare-resources.",
            ferramentas.template_dir.display()
        ));
    }

    // Keystore (resolvido cedo para falhar rápido antes de compilar)
    let (ks_path, ks_pass, ks_alias, kp) = if keystore_path.is_empty() {
        let ks = garantir_keystore_auto(
            app, key_alias, store_pass,
            nome_responsavel, organizacao, cidade, estado, pais,
        )?;
        let alias_real = listar_aliases_keystore(app, &ks, store_pass)
            .into_iter()
            .next()
            .unwrap_or_else(|| key_alias.to_owned());
        (ks, store_pass.to_owned(), alias_real, key_pass.to_owned())
    } else {
        (
            normalizar_caminho(PathBuf::from(keystore_path)),
            store_pass.to_owned(),
            key_alias.to_owned(),
            key_pass.to_owned(),
        )
    };

    gerar_apk_e_aab(
        &ferramentas,
        html,
        nome_app,
        &normalizar_caminho(PathBuf::from(pasta_saida)),
        &ks_path,
        &ks_pass,
        &ks_alias,
        &kp,
        icone_bytes,
        &midias_extras,
        package_name,
        version_name,
        version_code,
    )
}

/// Caminhos de todas as ferramentas/recursos necessários para gerar apk+aab.
/// Permite reusar `gerar_apk_e_aab` tanto no app desktop (caminhos resolvidos
/// via `tauri::AppHandle`) quanto em um binário CLI standalone para CI
/// (caminhos passados diretamente por argumento de linha de comando).
pub struct FerramentasAndroid {
    pub aapt2: PathBuf,
    pub zipalign: PathBuf,
    pub java: PathBuf,
    pub jarsigner: PathBuf,
    pub android_jar: PathBuf,
    /// Opcional: usado apenas pelo CLI de CI (GitHub Actions). O desktop usa jarsigner.
    pub apksigner_jar: Option<PathBuf>,
    pub bundletool_jar: PathBuf,
    pub template_apk: PathBuf,
    /// Pasta com AndroidManifest.xml + res/ (placeholders {{PACKAGE_NAME}} etc.)
    pub template_dir: PathBuf,
}

/// Pipeline completo (Fase 5 — aapt2 + apksigner + bundletool, sem JRE pesado/protobuf manual):
///
///  1. Substitui placeholders no AndroidManifest.xml e strings.xml (texto puro)
///  2. `aapt2 compile` dos recursos (res/) → compiled.zip
///  3. Extrai classes.dex do template.apk (Fase 4 — nunca recompilado, Java é fixo)
///  4. Caminho APK: `aapt2 link` (binário) + injeta dex/assets + `zipalign` + `apksigner sign`
///  5. Caminho AAB: `aapt2 link --proto-format` + injeta dex + `bundletool build-bundle`
///     (entregue sem assinatura — Play App Signing assina no upload, igual ao comportamento anterior)
///
/// Não depende de `tauri::AppHandle` — pode ser chamada tanto pelo comando
/// Tauri do app desktop quanto por um binário CLI (ex: em CI).
#[allow(clippy::too_many_arguments)]
pub fn gerar_apk_e_aab(
    ferramentas: &FerramentasAndroid,
    html: &str,
    nome_app: &str,
    pasta_saida: &Path,
    ks_path: &Path,
    ks_pass: &str,
    ks_alias: &str,
    ks_key_pass: &str,
    icone_bytes: &[u8],
    midias_extras: &HashMap<String, Vec<u8>>,
    package_name: &str,
    version_name: &str,
    version_code: Option<u32>,
) -> Result<ResultadoAndroid, String> {
    let nome = sanitizar_nome(nome_app);
    let dir = pasta_saida;
    let aab_path = dir.join(format!("{nome}.aab"));
    let apk_path = dir.join(format!("{nome}.apk"));
    std::fs::create_dir_all(dir).map_err(|e| format!("Erro ao criar pasta de saída: {e}"))?;

    let aapt2_bin = &ferramentas.aapt2;
    let zipalign_bin = &ferramentas.zipalign;
    let android_jar = &ferramentas.android_jar;
    let apksigner_jar = ferramentas.apksigner_jar.as_ref();
    let bundletool_jar = &ferramentas.bundletool_jar;
    let template_apk_path = &ferramentas.template_apk;
    let template_dir = &ferramentas.template_dir;
    let j = &ferramentas.java;
    let jarsigner_bin = &ferramentas.jarsigner;

    let pkg = if package_name.trim().is_empty() {
        format!("br.com.csv2dmli.{nome}")
    } else {
        package_name.trim().to_owned()
    };
    let ver_name = if version_name.trim().is_empty() { "1.0" } else { version_name.trim() };
    let ver_code = version_code.unwrap_or(1).max(1);

    // --- Diretório de trabalho temporário ---
    let work = tempfile::Builder::new()
        .prefix("csv2dmli-android-")
        .tempdir()
        .map_err(|e| format!("Erro ao criar diretório temporário: {e}"))?;
    let work_path = work.path();

    // --- Manifest com placeholders substituídos ---
    let manifest_tpl = std::fs::read_to_string(template_dir.join("AndroidManifest.xml"))
        .map_err(|e| format!("Erro ao ler AndroidManifest.xml template: {e}"))?;
    let manifest_final = manifest_tpl
        .replace("{{PACKAGE_NAME}}", &pkg)
        .replace("{{VERSION_CODE}}", &ver_code.to_string())
        .replace("{{VERSION_NAME}}", ver_name);
    let manifest_path = work_path.join("AndroidManifest.xml");
    std::fs::write(&manifest_path, manifest_final)
        .map_err(|e| format!("Erro ao escrever manifest: {e}"))?;

    // --- res/ — strings.xml gerado, demais arquivos copiados do template ---
    let res_work = work_path.join("res");
    std::fs::create_dir_all(res_work.join("values"))
        .map_err(|e| format!("Erro ao criar res/values: {e}"))?;
    std::fs::create_dir_all(res_work.join("layout"))
        .map_err(|e| format!("Erro ao criar res/layout: {e}"))?;
    std::fs::create_dir_all(res_work.join("drawable"))
        .map_err(|e| format!("Erro ao criar res/drawable: {e}"))?;

    let strings_tpl = std::fs::read_to_string(template_dir.join("res/values/strings.xml"))
        .map_err(|e| format!("Erro ao ler strings.xml template: {e}"))?;
    let strings_final = strings_tpl.replace("{{APP_NAME}}", &escapar_xml(nome_app));
    std::fs::write(res_work.join("values/strings.xml"), strings_final)
        .map_err(|e| format!("Erro ao escrever strings.xml: {e}"))?;

    std::fs::copy(
        template_dir.join("res/values/themes.xml"),
        res_work.join("values/themes.xml"),
    )
    .map_err(|e| format!("Erro ao copiar themes.xml: {e}"))?;
    std::fs::copy(
        template_dir.join("res/layout/activity_main.xml"),
        res_work.join("layout/activity_main.xml"),
    )
    .map_err(|e| format!("Erro ao copiar activity_main.xml: {e}"))?;

    if icone_bytes.is_empty() {
        std::fs::copy(
            template_dir.join("res/drawable/ic_launcher.xml"),
            res_work.join("drawable/ic_launcher.xml"),
        )
        .map_err(|e| format!("Erro ao copiar ic_launcher.xml: {e}"))?;
    } else {
        std::fs::write(res_work.join("drawable/ic_launcher.png"), icone_bytes)
            .map_err(|e| format!("Erro ao escrever ícone customizado: {e}"))?;
    }

    // --- assets (HTML do dicionário + mídias extras) injetados via transformar_zip,
    // NUNCA via `aapt2 link -A <dir>`: o aapt2.exe no Windows grava entradas de
    // subpastas com separador misto ("assets/audio\som.mp3"), o que quebra o
    // carregamento no WebView (Android faz match exato de caminho). Construindo
    // o nome da entrada nós mesmos (sempre com "/"), o resultado é correto em
    // qualquer SO.
    let html_bytes = html.as_bytes();
    let mut entradas_assets: Vec<(String, &[u8])> = vec![("assets/index.html".to_string(), html_bytes)];
    for (caminho_rel, bytes) in midias_extras {
        entradas_assets.push((format!("assets/{caminho_rel}"), bytes.as_slice()));
    }

    // --- aapt2 compile ---
    let compiled_zip = work_path.join("compiled.zip");
    let saida = Command::new(&aapt2_bin)
        .args([
            "compile",
            "--dir", res_work.to_str().unwrap(),
            "-o", compiled_zip.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Erro ao executar aapt2 compile: {e}"))?;
    if !saida.status.success() {
        return Err(format!(
            "aapt2 compile falhou:\n{}",
            String::from_utf8_lossy(&saida.stderr)
        ));
    }

    // --- classes.dex fixo, extraído do template.apk (Fase 4) ---
    let template_apk_bytes = std::fs::read(&template_apk_path)
        .map_err(|e| format!("Erro ao ler template.apk: {e}"))?;
    let dex_bytes = extrair_entrada_zip(&template_apk_bytes, "classes.dex")?;

    // =========================================================================
    // Caminho A: APK direto (aapt2 link binário + dex + zipalign + apksigner)
    // =========================================================================
    let linked_apk_path = work_path.join("linked.apk");
    let saida = Command::new(&aapt2_bin)
        .args([
            "link",
            "-I", android_jar.to_str().unwrap(),
            "--manifest", manifest_path.to_str().unwrap(),
            "--auto-add-overlay",
            "-o", linked_apk_path.to_str().unwrap(),
            compiled_zip.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Erro ao executar aapt2 link (apk): {e}"))?;
    if !saida.status.success() {
        return Err(format!(
            "aapt2 link (apk) falhou:\n{}",
            String::from_utf8_lossy(&saida.stderr)
        ));
    }

    let linked_apk_bytes =
        std::fs::read(&linked_apk_path).map_err(|e| format!("Erro ao ler linked.apk: {e}"))?;
    let mut adicionar_apk: Vec<(String, &[u8])> = vec![("classes.dex".to_string(), dex_bytes.as_slice())];
    adicionar_apk.extend(entradas_assets.iter().map(|(n, b)| (n.clone(), *b)));
    let unsigned_apk_bytes = transformar_zip(&linked_apk_bytes, &[], &adicionar_apk)?;
    let unsigned_apk_path = work_path.join("unsigned.apk");
    std::fs::write(&unsigned_apk_path, &unsigned_apk_bytes)
        .map_err(|e| format!("Erro ao escrever unsigned.apk: {e}"))?;

    let aligned_apk_path = work_path.join("aligned.apk");
    let saida = Command::new(&zipalign_bin)
        .args([
            "-f", "-p", "4",
            unsigned_apk_path.to_str().unwrap(),
            aligned_apk_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Erro ao executar zipalign: {e}"))?;
    if !saida.status.success() {
        return Err(format!(
            "zipalign falhou:\n{}",
            String::from_utf8_lossy(&saida.stderr)
        ));
    }

    // Prefere apksigner (v1+v2+v3 — necessário para Android 11+).
    // Fallback para jarsigner (v1 apenas) se apksigner não estiver disponível.
    if let Some(jar) = apksigner_jar {
        let saida = Command::new(j)
            .args([
                "-jar", jar.to_str().unwrap(),
                "sign",
                "--ks", ks_path.to_str().unwrap(),
                &format!("--ks-pass=pass:{ks_pass}"),
                &format!("--ks-key-alias={ks_alias}"),
                &format!("--key-pass=pass:{ks_key_pass}"),
                "--out", apk_path.to_str().unwrap(),
                aligned_apk_path.to_str().unwrap(),
            ])
            .output()
            .map_err(|e| format!("Erro ao executar apksigner: {e}"))?;
        if !saida.status.success() {
            return Err(format!(
                "apksigner falhou:\nstdout: {}\nstderr: {}",
                String::from_utf8_lossy(&saida.stdout),
                String::from_utf8_lossy(&saida.stderr)
            ));
        }
    } else {
        // Fallback: jarsigner (v1 apenas — instala em qualquer Android, mas
        // targetSdkVersion >= 30 pode rejeitar em Android 11+ sem v2).
        let saida = Command::new(jarsigner_bin)
            .args([
                "-J-Dfile.encoding=UTF-8",
                "-keystore", ks_path.to_str().unwrap(),
                "-storepass", ks_pass,
                "-keypass", ks_key_pass,
                "-digestalg", "SHA-256",
                "-sigalg", "SHA256withRSA",
                "-signedjar", apk_path.to_str().unwrap(),
                aligned_apk_path.to_str().unwrap(),
                ks_alias,
            ])
            .output()
            .map_err(|e| format!("Erro ao executar jarsigner: {e}"))?;
        if !saida.status.success() {
            return Err(format!(
                "jarsigner falhou:\nstdout: {}\nstderr: {}",
                String::from_utf8_lossy(&saida.stdout),
                String::from_utf8_lossy(&saida.stderr)
            ));
        }
    }

    // =========================================================================
    // Caminho B: AAB (aapt2 link --proto-format + dex + bundletool build-bundle)
    // Entregue sem assinatura própria — Play App Signing assina no upload,
    // mesmo comportamento da implementação anterior.
    // =========================================================================
    let proto_apk_path = work_path.join("proto.apk");
    let saida = Command::new(&aapt2_bin)
        .args([
            "link",
            "-I", android_jar.to_str().unwrap(),
            "--manifest", manifest_path.to_str().unwrap(),
            "--proto-format",
            "--auto-add-overlay",
            "-o", proto_apk_path.to_str().unwrap(),
            compiled_zip.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("Erro ao executar aapt2 link (aab): {e}"))?;
    if !saida.status.success() {
        return Err(format!(
            "aapt2 link (aab) falhou:\n{}",
            String::from_utf8_lossy(&saida.stderr)
        ));
    }

    let proto_bytes =
        std::fs::read(&proto_apk_path).map_err(|e| format!("Erro ao ler proto.apk: {e}"))?;
    let mut adicionar_aab: Vec<(String, &[u8])> = vec![("dex/classes.dex".to_string(), dex_bytes.as_slice())];
    adicionar_aab.extend(entradas_assets.iter().map(|(n, b)| (n.clone(), *b)));
    let module_bytes = transformar_zip(
        &proto_bytes,
        &[("AndroidManifest.xml", "manifest/AndroidManifest.xml")],
        &adicionar_aab,
    )?;
    let module_path = work_path.join("base-module.zip");
    std::fs::write(&module_path, &module_bytes)
        .map_err(|e| format!("Erro ao escrever módulo base do AAB: {e}"))?;

    let saida = Command::new(&j)
        .args([
            "-jar", bundletool_jar.to_str().unwrap(),
            "build-bundle",
            &format!("--modules={}", module_path.display()),
            &format!("--output={}", aab_path.display()),
            "--overwrite",
        ])
        .output()
        .map_err(|e| format!("Erro ao executar bundletool build-bundle: {e}"))?;
    if !saida.status.success() {
        return Err(format!(
            "bundletool build-bundle falhou:\nstdout: {}\nstderr: {}",
            String::from_utf8_lossy(&saida.stdout),
            String::from_utf8_lossy(&saida.stderr)
        ));
    }

    Ok(ResultadoAndroid {
        aab: aab_path.to_string_lossy().to_string(),
        apk: apk_path.to_string_lossy().to_string(),
        keystore: ks_path.to_string_lossy().to_string(),
    })
}

// ---------------------------------------------------------------------------
// Teste temporário: confirma que transformar_zip preserva o método de
// compressão original de cada entrada (crítico para resources.arsc == STORED).
// ---------------------------------------------------------------------------
#[cfg(test)]
mod teste_compressao {
    use super::*;

    #[test]
    fn preserva_stored_em_resources_arsc() {
        // zip de origem com uma entrada STORED e outra DEFLATED, simulando
        // exatamente o que o aapt2 link produz.
        let mut origem_bytes = Vec::new();
        {
            let mut w = ZipWriter::new(Cursor::new(&mut origem_bytes));
            let stored = SimpleFileOptions::default().compression_method(CompressionMethod::Stored);
            let deflated = SimpleFileOptions::default().compression_method(CompressionMethod::Deflated);
            w.start_file("resources.arsc", stored).unwrap();
            w.write_all(b"conteudo-fake-de-resources-arsc-1234567890").unwrap();
            w.start_file("AndroidManifest.xml", deflated).unwrap();
            w.write_all(b"<manifest></manifest>").unwrap();
            w.finish().unwrap();
        }

        let resultado = transformar_zip(
            &origem_bytes,
            &[],
            &[("classes.dex".to_string(), b"FAKE_DEX".as_slice())],
        ).unwrap();

        let mut zip = ZipArchive::new(Cursor::new(&resultado)).unwrap();
        let arsc = zip.by_name("resources.arsc").unwrap();
        assert_eq!(arsc.compression(), CompressionMethod::Stored, "resources.arsc deve permanecer STORED");
        drop(arsc);
        let manifest = zip.by_name("AndroidManifest.xml").unwrap();
        assert_eq!(manifest.compression(), CompressionMethod::Deflated);
        drop(manifest);
        let dex = zip.by_name("classes.dex").unwrap();
        assert_eq!(dex.compression(), CompressionMethod::Deflated);
    }

    #[test]
    fn entradas_aninhadas_usam_barra_normal() {
        // Regressão: aapt2.exe no Windows grava entradas de subpastas com
        // separador misto ("assets/audio\som.mp3") quando usado com -A <dir>.
        // transformar_zip constrói o nome da entrada explicitamente, então
        // deve sempre produzir "/" independente do SO.
        let mut origem_bytes = Vec::new();
        {
            let mut w = ZipWriter::new(Cursor::new(&mut origem_bytes));
            w.start_file("AndroidManifest.xml", SimpleFileOptions::default()).unwrap();
            w.write_all(b"<manifest></manifest>").unwrap();
            w.finish().unwrap();
        }

        let adicionar: Vec<(String, &[u8])> = vec![
            ("assets/index.html".to_string(), b"<html></html>".as_slice()),
            ("assets/audio/som.mp3".to_string(), b"FAKE_AUDIO".as_slice()),
        ];
        let resultado = transformar_zip(&origem_bytes, &[], &adicionar).unwrap();

        let mut zip = ZipArchive::new(Cursor::new(&resultado)).unwrap();
        let nomes: Vec<String> = (0..zip.len())
            .map(|i| zip.by_index(i).unwrap().name().to_string())
            .collect();
        assert!(nomes.contains(&"assets/audio/som.mp3".to_string()), "nomes encontrados: {nomes:?}");
        assert!(!nomes.iter().any(|n| n.contains('\\')), "nenhuma entrada deve conter barra invertida: {nomes:?}");
    }
}
