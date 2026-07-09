# The Taste — Android APK Builder & Uploader Script
$ErrorActionPreference = "Stop"

# 1. Setup local paths for build environment
$env:JAVA_HOME = "d:\Zeaul\Restraunt\jdk21\jdk-21.0.3+9"
$env:ANDROID_HOME = "d:\Zeaul\Restraunt\android-sdk"
$env:ANDROID_SDK_ROOT = "d:\Zeaul\Restraunt\android-sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"

# Paths to files we need to modify
$capConfigPath = "d:\Zeaul\Restraunt\capacitor.config.json"
$gradlePath = "d:\Zeaul\Restraunt\android\app\build.gradle"
$stringsPath = "d:\Zeaul\Restraunt\android\app\src\main\res\values\strings.xml"

# Function to save original files
$originals = @{}
function Save-Originals {
    $originals[$capConfigPath] = Get-Content -Raw $capConfigPath
    $originals[$gradlePath] = Get-Content -Raw $gradlePath
    $originals[$stringsPath] = Get-Content -Raw $stringsPath
}

# Function to restore original files
function Restore-Originals {
    Write-Host "Reverting configuration files to original state..."
    $originals.Keys | ForEach-Object {
        [System.IO.File]::WriteAllText($_, $originals[$_])
    }
}

# Function to build an APK
function Build-App-APK ($appId, $appName, $url, $outName) {
    # Always restore original files first to ensure replacements match cleanly!
    Restore-Originals

    Write-Host "`n================================================"
    Write-Host "Building $appName ($appId) pointing to $url..."
    Write-Host "================================================"

    # Parse host name for allowNavigation
    $uri = New-Object System.Uri($url)
    $hostName = $uri.Host

    # 1. Modify capacitor.config.json
    $capConfig = @{
        appId = $appId
        appName = $appName
        webDir = "dist"
        server = @{
            url = $url
            cleartext = $true
            allowNavigation = @(
                $hostName,
                "*.supabase.co",
                "*.supabase.in"
            )
        }
    }
    $capConfig | ConvertTo-Json -Depth 5 | Out-File $capConfigPath -Encoding utf8

    # 2. Modify android/app/build.gradle (replace applicationId)
    $gradleContent = Get-Content -Raw $gradlePath
    $gradleContent = $gradleContent -replace 'applicationId "com.thetaste.pos"', "applicationId `"$appId`""
    [System.IO.File]::WriteAllText($gradlePath, $gradleContent)

    # 3. Modify strings.xml
    $stringsContent = Get-Content -Raw $stringsPath
    $stringsContent = $stringsContent -replace '<string name="app_name">TheTaste</string>', "<string name=`"app_name`">$appName</string>"
    $stringsContent = $stringsContent -replace '<string name="title_activity_main">TheTaste</string>', "<string name=`"title_activity_main`">$appName</string>"
    $stringsContent = $stringsContent -replace '<string name="package_name">com.thetaste.pos</string>', "<string name=`"package_name`">$appId</string>"
    $stringsContent = $stringsContent -replace '<string name="custom_url_scheme">com.thetaste.pos</string>', "<string name=`"custom_url_scheme`">$appId</string>"
    [System.IO.File]::WriteAllText($stringsPath, $stringsContent)

    # 4. Sync Capacitor
    Write-Host "Syncing Capacitor configurations to Android..."
    & cmd.exe /c "npx cap sync android"

    # 5. Clean and Build Native APK using Gradle
    Write-Host "Compiling native Android APK using Gradle..."
    $prevDir = Get-Location
    Set-Location -Path "d:\Zeaul\Restraunt\android"
    & .\gradlew.bat clean assembleDebug
    Set-Location -Path $prevDir

    # 6. Copy output APK
    $apkSource = "d:\Zeaul\Restraunt\android\app\build\outputs\apk\debug\app-debug.apk"
    $apkDest = "d:\Zeaul\Restraunt\$outName"
    
    if (Test-Path $apkSource) {
        Copy-Item -Path $apkSource -Destination $apkDest -Force
        Write-Host "SUCCESS: Built $appName APK saved to: $apkDest"
    } else {
        throw "Build failed: Output APK not found at $apkSource"
    }
}

# Run the build process
try {
    Save-Originals

    # Build POS APK (Staff Portal)
    Build-App-APK `
        -appId "com.thetaste.pos" `
        -appName "TheTaste POS" `
        -url "https://restraunt-d646-nine.vercel.app/?portal=pos" `
        -outName "TheTastePOS.apk"

    # Build Customer APK (Storefront)
    Build-App-APK `
        -appId "com.thetaste.customer" `
        -appName "TheTaste Customer" `
        -url "https://restraunt-two.vercel.app/?portal=customer" `
        -outName "TheTasteCustomer.apk"

    # 7. Upload to Supabase Storage
    Write-Host "`n================================================"
    Write-Host "Uploading new APKs to Supabase Storage..."
    Write-Host "================================================"
    & node scripts/upload-apks.js

} catch {
    Write-Error "Build process encountered an error: $_"
} finally {
    Restore-Originals
}
