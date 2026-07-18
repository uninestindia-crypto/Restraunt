param(
    [ValidateSet('pos', 'customer', 'all')]
    [string]$Portal = 'all',
    [switch]$Upload
)

$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$androidRoot = Join-Path $root 'android'
$capConfigPath = Join-Path $root 'capacitor.config.json'
$gradlePath = Join-Path $androidRoot 'app\build.gradle'
$stringsPath = Join-Path $androidRoot 'app\src\main\res\values\strings.xml'
$artifactDir = Join-Path $root 'artifacts\android'

if (-not $env:JAVA_HOME) { $env:JAVA_HOME = Join-Path $root 'jdk21\jdk-21.0.3+9' }
if (-not $env:ANDROID_HOME) { $env:ANDROID_HOME = Join-Path $root 'android-sdk' }
$env:ANDROID_SDK_ROOT = $env:ANDROID_HOME
$env:PATH = "$(Join-Path $env:JAVA_HOME 'bin');$env:PATH"

$requiredSigningVariables = @(
    'THE_TASTE_KEYSTORE',
    'THE_TASTE_KEYSTORE_PASSWORD',
    'THE_TASTE_KEY_ALIAS',
    'THE_TASTE_KEY_PASSWORD'
)
foreach ($variable in $requiredSigningVariables) {
    if ([string]::IsNullOrWhiteSpace([Environment]::GetEnvironmentVariable($variable))) {
        throw "Release signing requires environment variable $variable."
    }
}

$resolvedKeystore = (Resolve-Path -LiteralPath $env:THE_TASTE_KEYSTORE).Path
if (-not (Test-Path -LiteralPath $resolvedKeystore -PathType Leaf)) {
    throw 'THE_TASTE_KEYSTORE must point to an existing keystore file.'
}
$env:THE_TASTE_KEYSTORE = $resolvedKeystore

function Invoke-Checked([string]$FilePath, [string[]]$Arguments, [string]$WorkingDirectory = $root) {
    Push-Location $WorkingDirectory
    try {
        & $FilePath @Arguments
        if ($LASTEXITCODE -ne 0) {
            throw "$FilePath exited with code $LASTEXITCODE."
        }
    } finally {
        Pop-Location
    }
}

function Write-Utf8NoBom([string]$Path, [string]$Content) {
    [System.IO.File]::WriteAllText($Path, $Content, [System.Text.UTF8Encoding]::new($false))
}

$originalCapConfig = Get-Content -Raw -LiteralPath $capConfigPath
$originalGradle = Get-Content -Raw -LiteralPath $gradlePath
$originalStrings = Get-Content -Raw -LiteralPath $stringsPath

function Build-Portal([string]$PortalName, [string]$AppId, [string]$AppName, [string]$ArtifactName) {
    Write-Utf8NoBom $capConfigPath $originalCapConfig
    Write-Utf8NoBom $gradlePath $originalGradle
    Write-Utf8NoBom $stringsPath $originalStrings

    Invoke-Checked 'npm.cmd' @('run', "build:$PortalName")

    $capConfig = [ordered]@{
        appId = $AppId
        appName = $AppName
        webDir = 'dist'
        android = @{ allowMixedContent = $false }
    }
    Write-Utf8NoBom $capConfigPath ($capConfig | ConvertTo-Json -Depth 4)

    $gradleContent = $originalGradle -replace 'applicationId\s+"com\.thetaste\.pos"', "applicationId `"$AppId`""
    Write-Utf8NoBom $gradlePath $gradleContent

    $stringsContent = $originalStrings
    $stringsContent = $stringsContent -replace '<string name="app_name">.*?</string>', "<string name=`"app_name`">$AppName</string>"
    $stringsContent = $stringsContent -replace '<string name="title_activity_main">.*?</string>', "<string name=`"title_activity_main`">$AppName</string>"
    $stringsContent = $stringsContent -replace '<string name="package_name">.*?</string>', "<string name=`"package_name`">$AppId</string>"
    $stringsContent = $stringsContent -replace '<string name="custom_url_scheme">.*?</string>', "<string name=`"custom_url_scheme`">$AppId</string>"
    Write-Utf8NoBom $stringsPath $stringsContent

    Invoke-Checked 'npx.cmd' @('cap', 'sync', 'android')
    Invoke-Checked '.\gradlew.bat' @('clean', 'assembleRelease', '--no-daemon') $androidRoot

    $sourceApk = Join-Path $androidRoot 'app\build\outputs\apk\release\app-release.apk'
    if (-not (Test-Path -LiteralPath $sourceApk -PathType Leaf)) {
        throw "Signed release APK was not produced at $sourceApk."
    }

    New-Item -ItemType Directory -Path $artifactDir -Force | Out-Null
    $artifactPath = Join-Path $artifactDir $ArtifactName
    Copy-Item -LiteralPath $sourceApk -Destination $artifactPath -Force

    $buildTools = Get-ChildItem -LiteralPath (Join-Path $env:ANDROID_HOME 'build-tools') -Directory | Sort-Object Name -Descending | Select-Object -First 1
    $apkSigner = Join-Path $buildTools.FullName 'apksigner.bat'
    $certificateOutput = & $apkSigner verify --print-certs $artifactPath 2>&1 | Out-String
    if ($LASTEXITCODE -ne 0) { throw "APK signature verification failed for $ArtifactName." }
    if ($certificateOutput -match 'Android Debug') { throw "Refusing debug-signed artifact $ArtifactName." }

    $sha256 = (Get-FileHash -LiteralPath $artifactPath -Algorithm SHA256).Hash.ToLowerInvariant()
    Write-Utf8NoBom "$artifactPath.sha256" "$sha256  $ArtifactName`n"
    Write-Host "Verified signed release: $artifactPath"
}

try {
    if ($Portal -in @('pos', 'all')) {
        Build-Portal 'pos' 'com.thetaste.pos' 'TheTaste POS' 'TheTastePOS-release.apk'
    }
    if ($Portal -in @('customer', 'all')) {
        Build-Portal 'customer' 'com.thetaste.customer' 'TheTaste Customer' 'TheTasteCustomer-release.apk'
    }
    if ($Upload) {
        Invoke-Checked 'node.exe' @('scripts/upload-apks.js')
    }
} finally {
    Write-Utf8NoBom $capConfigPath $originalCapConfig
    Write-Utf8NoBom $gradlePath $originalGradle
    Write-Utf8NoBom $stringsPath $originalStrings
}
