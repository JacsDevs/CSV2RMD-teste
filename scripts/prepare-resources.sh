#!/bin/bash
# prepare-resources.sh
# Configura em src-tauri/resources/ tudo que o pipeline Android (Fase 5) precisa:
#   - bundletool.jar (build-bundle do .aab)
#   - JRE minimo via jlink (roda bundletool.jar/apksigner.jar + keytool)
#   - aapt2/zipalign/apksigner.jar/android.jar — copiados do Android SDK LOCAL
#     (mais confiavel que baixar de URL; requer Android Studio ou sdkmanager instalado)
#   - template.apk — PRECISA SER GERADO MANUALMENTE (ver passo 4)
# Execute UMA VEZ antes de fazer o build do Tauri.
# Requer: curl, tar, jlink (incluso no JDK baixado), Android SDK local.

set -e
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
RESOURCES_DIR="$SCRIPT_DIR/../src-tauri/resources"
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT
BUILD_TOOLS_VERSION="34.0.0"
PLATFORM_VERSION="android-34"

echo "=== Preparando recursos para build Android (Fase 5) ==="

# ---------------------------------------------------------------------------
# 1. bundletool.jar (mantido — usado para gerar o .aab via build-bundle)
# ---------------------------------------------------------------------------
BUNDLETOOL_VERSION="1.18.1"
BUNDLETOOL_DEST="$RESOURCES_DIR/bundletool.jar"

if [ -f "$BUNDLETOOL_DEST" ]; then
    echo "[SKIP] bundletool.jar já existe."
else
    echo "[1/4] Baixando bundletool $BUNDLETOOL_VERSION..."
    curl -fL \
      "https://github.com/google/bundletool/releases/download/${BUNDLETOOL_VERSION}/bundletool-all-${BUNDLETOOL_VERSION}.jar" \
      -o "$BUNDLETOOL_DEST"
    echo "      OK -> $BUNDLETOOL_DEST"
fi

# ---------------------------------------------------------------------------
# 2. JDK Eclipse Temurin 21 minimo (java + keytool)
# ---------------------------------------------------------------------------
JRE_DEST="$RESOURCES_DIR/jre"

if [ -f "$JRE_DEST/bin/java" ]; then
    echo "[SKIP] JRE já configurado em resources/jre/."
else
    echo "[2/4] Baixando Eclipse Temurin JDK 21 (Linux x64)..."
    JDK_TAR="$TEMP_DIR/temurin-jdk.tar.gz"
    curl -fL \
      "https://api.adoptium.net/v3/binary/latest/21/ga/linux/x64/jdk/hotspot/normal/eclipse" \
      -o "$JDK_TAR"

    echo "      Extraindo JDK..."
    tar -xzf "$JDK_TAR" -C "$TEMP_DIR"
    JDK_DIR=$(find "$TEMP_DIR" -maxdepth 1 -type d -name "jdk-*" | head -1)

    echo "      Criando JRE mínimo com jlink..."
    MODULES="java.base,java.logging,java.xml,java.sql,java.naming,java.desktop,jdk.crypto.ec,jdk.crypto.cryptoki"
    "$JDK_DIR/bin/jlink" \
      --add-modules "$MODULES" \
      --output "$JRE_DEST" \
      --no-header-files \
      --no-man-pages \
      --compress=2

    # keytool nao faz parte do jlink output; copiar manualmente
    # (jarsigner nao e mais necessario - apksigner substitui seu uso na Fase 5)
    echo "      Copiando keytool..."
    cp "$JDK_DIR/bin/keytool" "$JRE_DEST/bin/keytool"
    chmod +x "$JRE_DEST/bin/keytool"

    echo "      OK -> $JRE_DEST"
fi

# ---------------------------------------------------------------------------
# 3. aapt2 / zipalign / apksigner.jar / android.jar — copiados do Android SDK local
# ---------------------------------------------------------------------------
SDK_DEST_DIR="$RESOURCES_DIR/android-sdk"
mkdir -p "$SDK_DEST_DIR"

if [ -f "$SDK_DEST_DIR/aapt2" ] && [ -f "$SDK_DEST_DIR/zipalign" ] && \
   [ -f "$SDK_DEST_DIR/apksigner.jar" ] && [ -f "$SDK_DEST_DIR/android.jar" ]; then
    echo "[SKIP] android-sdk/ já configurado."
else
    echo "[3/4] Localizando Android SDK local..."

    SDK_ROOT=""
    for candidate in "$ANDROID_HOME" "$ANDROID_SDK_ROOT" "$HOME/Android/Sdk" "$HOME/Library/Android/sdk"; do
        if [ -n "$candidate" ] && [ -d "$candidate" ]; then
            SDK_ROOT="$candidate"
            break
        fi
    done

    if [ -z "$SDK_ROOT" ]; then
        echo "      ERRO: Android SDK não encontrado (ANDROID_HOME/ANDROID_SDK_ROOT não definidos"
        echo "      e caminhos padrão não existem)."
        echo "      Instale o Android Studio ou defina ANDROID_HOME manualmente."
        exit 1
    fi

    BUILD_TOOLS_DIR="$SDK_ROOT/build-tools/$BUILD_TOOLS_VERSION"
    PLATFORM_DIR="$SDK_ROOT/platforms/$PLATFORM_VERSION"

    if [ ! -d "$BUILD_TOOLS_DIR" ]; then
        echo "      ERRO: build-tools $BUILD_TOOLS_VERSION não encontrado em $BUILD_TOOLS_DIR"
        echo "      Instale via Android Studio > SDK Manager, ou: sdkmanager \"build-tools;$BUILD_TOOLS_VERSION\""
        exit 1
    fi
    if [ ! -d "$PLATFORM_DIR" ]; then
        echo "      ERRO: platform $PLATFORM_VERSION não encontrado em $PLATFORM_DIR"
        echo "      Instale via Android Studio > SDK Manager, ou: sdkmanager \"platforms;$PLATFORM_VERSION\""
        exit 1
    fi

    echo "      SDK encontrado em $SDK_ROOT"
    cp "$BUILD_TOOLS_DIR/aapt2"            "$SDK_DEST_DIR/aapt2"
    cp "$BUILD_TOOLS_DIR/zipalign"         "$SDK_DEST_DIR/zipalign"
    cp "$BUILD_TOOLS_DIR/lib/apksigner.jar" "$SDK_DEST_DIR/apksigner.jar"
    cp "$PLATFORM_DIR/android.jar"         "$SDK_DEST_DIR/android.jar"
    chmod +x "$SDK_DEST_DIR/aapt2" "$SDK_DEST_DIR/zipalign"
    echo "      OK -> $SDK_DEST_DIR (aapt2, zipalign, apksigner.jar, android.jar)"
fi

# ---------------------------------------------------------------------------
# 4. Verificar template.apk (gerado pelo android-template/ — ver Fase 4)
# ---------------------------------------------------------------------------
echo "[4/4] Verificando template.apk..."
TEMPLATE_APK_PATH="$RESOURCES_DIR/template.apk"
if [ -f "$TEMPLATE_APK_PATH" ]; then
    SIZE=$(wc -c < "$TEMPLATE_APK_PATH")
    echo "      OK -> template.apk ($SIZE bytes)"
else
    echo "      ATENÇÃO: template.apk não encontrado!"
    echo "      Gere localmente:"
    echo "        cd android-template && ./gradlew assembleRelease"
    echo "        cp app/build/outputs/apk/release/app-release-unsigned.apk $TEMPLATE_APK_PATH"
    echo "      Ou baixe o artefato 'android-template-apk' do workflow CI e renomeie para template.apk."
fi

echo ""
echo "=== Recursos prontos. Execute: npm run tauri build ==="
