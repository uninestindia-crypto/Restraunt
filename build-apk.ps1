# The Taste POS — Android APK Builder Script
# This script sets up the local path environment variables for JDK 17 and Android SDK and builds the APK.

$ErrorActionPreference = "Stop"

# 1. Setup local paths
$jdkPath = "d:\Zeaul\Restraunt\jdk21\jdk-21.0.2+13"
if (-not (Test-Path $jdkPath)) {
    # Try alternate location if extracted differently
    $dirs = Get-ChildItem -Path "d:\Zeaul\Restraunt\jdk21\*" -Directory
    if ($dirs.Count -gt 0) {
        $jdkPath = $dirs[0].FullName
    } else {
        Write-Error "JDK 21 directory not found at $jdkPath. Please ensure the JDK download task is completed."
    }
}

Write-Host "☕ Using JDK at: $jdkPath"
$env:JAVA_HOME = $jdkPath
$env:PATH = "$jdkPath\bin;$env:PATH"

# Setup Android SDK Path
$sdkPath = "C:\Users\user\AppData\Local\Android\Sdk"
Write-Host "🤖 Using Android SDK at: $sdkPath"
$env:ANDROID_HOME = $sdkPath
$env:ANDROID_SDK_ROOT = $sdkPath

# 2. Compile Web Assets & Sync with Capacitor
Write-Host "⚡ Compiling web assets for production..."
$env:PATH = "C:\Program Files\nodejs;$env:PATH"
& "C:\Program Files\nodejs\npm.cmd" run build

Write-Host "🔄 Syncing Capacitor web assets to Android project..."
& cmd.exe /c "npx cap sync"

# 3. Compile the Android APK
Write-Host "🛠️ Building native Android APK using Gradle..."
Set-Location -Path "d:\Zeaul\Restraunt\android"
& .\gradlew.bat assembleDebug

# 4. Copy the compiled APK to the root directory
$apkSource = "d:\Zeaul\Restraunt\android\app\build\outputs\apk\debug\app-debug.apk"
$apkDest = "d:\Zeaul\Restraunt\TheTaste.apk"

if (Test-Path $apkSource) {
    Copy-Item -Path $apkSource -Destination $apkDest -Force
    Write-Host "SUCCESS: Compiled APK copied to: $apkDest"
    Write-Host "You can transfer this APK file directly to your phone to install the POS app!"
} else {
    Write-Error "Gradle build completed but could not locate compiled APK at: $apkSource"
}
