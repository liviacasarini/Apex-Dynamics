#!/bin/bash
# Build local do APK — sem depender do EAS
# Uso: bash build-local.sh

set -e

NODE20="/c/node20-extract/node-v20.19.1-win-x64"
JDK17="/c/jdk17-extract/jdk-17.0.18+8"
SDK="/c/AndroidSdk"
GRADLE_CACHE="/c/gradle-home"
BUILD_DIR="/c/ApexBuild"
MOBILE_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "=== ApexDynamics — Build Local Android ==="
echo "Node.js 20: $NODE20"
echo "JDK 17:     $JDK17"
echo ""

# 1. Copiar projeto para caminho sem acento (Gradle não suporta caracteres especiais)
echo "[1/3] Copiando projeto para $BUILD_DIR..."
powershell -Command "Remove-Item -Recurse -Force '$BUILD_DIR' -ErrorAction SilentlyContinue; robocopy '$MOBILE_DIR' '$BUILD_DIR' /E /SL /NJH /NJS /NFL /NDL /NC /NS /NP /R:0 /W:0; exit 0" > /dev/null 2>&1

# Garantir metro.config.js
cat > "$BUILD_DIR/metro.config.js" << 'METROEOF'
const { getDefaultConfig } = require('expo/metro-config');
module.exports = getDefaultConfig(__dirname);
METROEOF

# 2. Gerar android/ se não existir
if [ ! -d "$BUILD_DIR/android" ]; then
  echo "[*] Gerando projeto nativo (expo prebuild)..."
  cd "$BUILD_DIR"
  export PATH="$NODE20:$PATH"
  npx expo prebuild --platform android --clean
  # Fix gradle.properties para path com acento
  echo "android.overridePathCheck=true" >> "$BUILD_DIR/android/gradle.properties"
fi

# 3. Build
echo "[2/3] Compilando APK..."
cd "$BUILD_DIR/android"
export PATH="$NODE20:$PATH"
export ANDROID_HOME="$SDK"
export ANDROID_SDK_ROOT="$SDK"
export JAVA_HOME="$JDK17"
export GRADLE_USER_HOME="$GRADLE_CACHE"
./gradlew assembleRelease

# 4. Copiar APK
APK="$BUILD_DIR/android/app/build/outputs/apk/release/app-release.apk"
DEST="$MOBILE_DIR/ApexDynamics.apk"
cp "$APK" "$DEST"

echo ""
echo "=== BUILD OK ==="
echo "APK: $DEST"
echo "Tamanho: $(du -h "$DEST" | cut -f1)"
