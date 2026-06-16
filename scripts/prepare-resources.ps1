# prepare-resources.ps1
# Configura em src-tauri/resources/ tudo que o pipeline Android (Fase 5) precisa:
#   - bundletool.jar (build-bundle do .aab)
#   - JRE minimo via jlink (roda bundletool.jar/apksigner.jar + keytool)
#   - aapt2/zipalign/apksigner.jar/android.jar — copiados do Android SDK LOCAL
#     (mais confiavel que baixar de URL, ja que essas versoes nao tem URLs
#     estaveis/simples; requer Android Studio ou sdkmanager instalado)
#   - template.apk — PRECISA SER GERADO MANUALMENTE (ver passo 4)
# Execute UMA VEZ antes de fazer o build do Tauri.
# Requer: conexao com internet (bundletool/JDK) e Android SDK local (aapt2/etc).

$ErrorActionPreference = "Stop"
$ResourcesDir = "$PSScriptRoot\..\src-tauri\resources"
$TempDir = "$env:TEMP\csv2dmli-prepare"
$BuildToolsVersion = "34.0.0"
$PlatformVersion = "android-34"

Write-Host "=== Preparando recursos para build Android (Fase 5) ===" -ForegroundColor Cyan
New-Item -ItemType Directory -Force -Path $TempDir | Out-Null

# ---------------------------------------------------------------------------
# 1. bundletool.jar (mantido — usado para gerar o .aab via build-bundle)
# ---------------------------------------------------------------------------
$BundletoolVersion = "1.18.1"
$BundletoolDest = "$ResourcesDir\bundletool.jar"

if (Test-Path $BundletoolDest) {
    Write-Host "[SKIP] bundletool.jar já existe." -ForegroundColor Yellow
} else {
    Write-Host "[1/4] Baixando bundletool $BundletoolVersion..." -ForegroundColor Green
    $BundletoolUrl = "https://github.com/google/bundletool/releases/download/$BundletoolVersion/bundletool-all-$BundletoolVersion.jar"
    Invoke-WebRequest -Uri $BundletoolUrl -OutFile $BundletoolDest -UseBasicParsing
    Write-Host "      OK -> $BundletoolDest"
}

# ---------------------------------------------------------------------------
# 2. JDK Eclipse Temurin 21 minimo (java + keytool — apksigner/bundletool rodam via java -jar)
# ---------------------------------------------------------------------------
$JreDest = "$ResourcesDir\jre"

if (Test-Path "$JreDest\bin\java.exe") {
    Write-Host "[SKIP] JRE já configurado em resources\jre\." -ForegroundColor Yellow
} else {
    Write-Host "[2/4] Baixando Eclipse Temurin JDK 21 (Windows x64)..." -ForegroundColor Green
    $JdkUrl = "https://api.adoptium.net/v3/binary/latest/21/ga/windows/x64/jdk/hotspot/normal/eclipse"
    $JdkZip = "$TempDir\temurin-jdk.zip"
    Invoke-WebRequest -Uri $JdkUrl -OutFile $JdkZip -UseBasicParsing

    Write-Host "      Extraindo JDK..."
    Expand-Archive -Path $JdkZip -DestinationPath $TempDir -Force
    $JdkDir = Get-ChildItem -Path $TempDir -Directory | Where-Object { $_.Name -like "jdk-*" } | Select-Object -First 1

    Write-Host "      Criando JRE mínimo com jlink..."
    $JlinkExe = "$($JdkDir.FullName)\bin\jlink.exe"
    $Modules = "java.base,java.logging,java.xml,java.sql,java.naming,java.desktop,jdk.crypto.ec,jdk.crypto.cryptoki"
    & $JlinkExe --add-modules $Modules --output $JreDest --no-header-files --no-man-pages --compress=2

    # keytool nao faz parte do jlink output; copiar manualmente
    # (jarsigner nao e mais necessario - apksigner substitui seu uso na Fase 5)
    Write-Host "      Copiando keytool..."
    Copy-Item "$($JdkDir.FullName)\bin\keytool.exe" "$JreDest\bin\keytool.exe"

    Remove-Item $JdkZip -Force
    Remove-Item $JdkDir.FullName -Recurse -Force
    Write-Host "      OK -> $JreDest"
}

# ---------------------------------------------------------------------------
# 3. aapt2 / zipalign / apksigner.jar / android.jar — copiados do Android SDK local
# ---------------------------------------------------------------------------
$SdkDestDir = "$ResourcesDir\android-sdk"
New-Item -ItemType Directory -Force -Path $SdkDestDir | Out-Null

$NeedCopy = -not (Test-Path "$SdkDestDir\aapt2.exe") -or
            -not (Test-Path "$SdkDestDir\zipalign.exe") -or
            -not (Test-Path "$SdkDestDir\apksigner.jar") -or
            -not (Test-Path "$SdkDestDir\android.jar")

if (-not $NeedCopy) {
    Write-Host "[SKIP] android-sdk\ já configurado." -ForegroundColor Yellow
} else {
    Write-Host "[3/4] Localizando Android SDK local..." -ForegroundColor Green

    $SdkCandidates = @($env:ANDROID_HOME, $env:ANDROID_SDK_ROOT, "$env:LOCALAPPDATA\Android\Sdk") |
        Where-Object { $_ -and (Test-Path $_) }
    $SdkRoot = $SdkCandidates | Select-Object -First 1

    if (-not $SdkRoot) {
        Write-Host "      ERRO: Android SDK não encontrado (ANDROID_HOME/ANDROID_SDK_ROOT não definidos" -ForegroundColor Red
        Write-Host "      e $env:LOCALAPPDATA\Android\Sdk não existe)." -ForegroundColor Red
        Write-Host "      Instale o Android Studio ou defina ANDROID_HOME manualmente." -ForegroundColor Red
        exit 1
    }

    $BuildToolsDir = "$SdkRoot\build-tools\$BuildToolsVersion"
    $PlatformDir = "$SdkRoot\platforms\$PlatformVersion"

    if (-not (Test-Path $BuildToolsDir)) {
        Write-Host "      ERRO: build-tools $BuildToolsVersion não encontrado em $BuildToolsDir" -ForegroundColor Red
        Write-Host "      Instale via Android Studio > SDK Manager, ou:" -ForegroundColor Red
        Write-Host "      sdkmanager `"build-tools;$BuildToolsVersion`"" -ForegroundColor Red
        exit 1
    }
    if (-not (Test-Path $PlatformDir)) {
        Write-Host "      ERRO: platform $PlatformVersion não encontrado em $PlatformDir" -ForegroundColor Red
        Write-Host "      Instale via Android Studio > SDK Manager, ou:" -ForegroundColor Red
        Write-Host "      sdkmanager `"platforms;$PlatformVersion`"" -ForegroundColor Red
        exit 1
    }

    Write-Host "      SDK encontrado em $SdkRoot"
    Copy-Item "$BuildToolsDir\aapt2.exe"        "$SdkDestDir\aapt2.exe" -Force
    Copy-Item "$BuildToolsDir\zipalign.exe"     "$SdkDestDir\zipalign.exe" -Force
    Copy-Item "$BuildToolsDir\lib\apksigner.jar" "$SdkDestDir\apksigner.jar" -Force
    Copy-Item "$PlatformDir\android.jar"        "$SdkDestDir\android.jar" -Force
    Write-Host "      OK -> $SdkDestDir (aapt2, zipalign, apksigner.jar, android.jar)"
}

# ---------------------------------------------------------------------------
# 4. Verificar template.apk (gerado pelo android-template/ — ver Fase 4)
# ---------------------------------------------------------------------------
Write-Host "[4/4] Verificando template.apk..." -ForegroundColor Green
$TemplateApkPath = "$ResourcesDir\template.apk"
if (Test-Path $TemplateApkPath) {
    $Size = (Get-Item $TemplateApkPath).Length
    Write-Host "      OK -> template.apk ($Size bytes)"
} else {
    Write-Host "      ATENÇÃO: template.apk não encontrado!" -ForegroundColor Red
    Write-Host "      Gere localmente:" -ForegroundColor Red
    Write-Host "        cd android-template && .\gradlew.bat assembleRelease" -ForegroundColor Red
    Write-Host "        copy app\build\outputs\apk\release\app-release-unsigned.apk $TemplateApkPath" -ForegroundColor Red
    Write-Host "      Ou baixe o artefato 'android-template-apk' do workflow CI e renomeie para template.apk." -ForegroundColor Red
}

Remove-Item $TempDir -Recurse -Force -ErrorAction SilentlyContinue
Write-Host ""
Write-Host "=== Recursos prontos. Execute: npm run tauri build ===" -ForegroundColor Cyan
