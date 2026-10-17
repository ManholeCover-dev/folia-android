param([string]$ToolsRoot = (Join-Path $PSScriptRoot '../../../.android-tools'))

# Downloads the build tools into this workspace without changing system settings.
$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'
$ToolsRoot = [IO.Path]::GetFullPath($ToolsRoot)
New-Item -ItemType Directory -Force -Path $ToolsRoot | Out-Null
function Get-CheckedArchive($Url, $Name, $Hash, $Algorithm = 'SHA256') {
    $archivePath = Join-Path $ToolsRoot $Name
    & node (Join-Path $PSScriptRoot 'downloadArchive.mjs') $Url $archivePath $Hash $Algorithm.ToLowerInvariant() | ForEach-Object { Write-Host $_ }
    if ($LASTEXITCODE -ne 0) { throw "Download failed: $Name" }
    if ((Get-FileHash -LiteralPath $archivePath -Algorithm $Algorithm).Hash.ToLowerInvariant() -ne $Hash.ToLowerInvariant()) {
        throw "Checksum mismatch: $Name"
    }
    return $archivePath
}
$jdkArchive = Get-CheckedArchive 'https://github.com/adoptium/temurin21-binaries/releases/download/jdk-21.0.12.1%2B1/OpenJDK21U-jdk_x64_windows_hotspot_21.0.12.1_1.zip' 'jdk21.zip' 'f9d6e191ab098c0d416e7d588a24420a8621cd2f4720dab2459b8b7b2d2d8b4e'
if (!(Test-Path (Join-Path $ToolsRoot 'jdk'))) {
    Expand-Archive -LiteralPath $jdkArchive -DestinationPath (Join-Path $ToolsRoot 'jdk')
}
$env:JAVA_HOME = (Get-ChildItem (Join-Path $ToolsRoot 'jdk') -Directory | Select-Object -First 1).FullName
$sdkRoot = Join-Path $ToolsRoot 'sdk'
$repository = [xml](Invoke-WebRequest 'https://dl.google.com/android/repository/repository2-1.xml').Content
$specs = @{
    'platforms;android-36' = 'platforms/android-36'
    'build-tools;36.0.0' = 'build-tools/36.0.0'
    'ndk;28.2.13676358' = 'ndk/28.2.13676358'
    'cmake;3.22.1' = 'cmake/3.22.1'
}
$packages = foreach ($spec in $specs.Keys) {
    $package = $repository.'sdk-repository'.remotePackage | Where-Object { $_.path -eq $spec } | Select-Object -Last 1
    $archive = $package.archives.archive | Where-Object { !$_.'host-os' -or $_.'host-os' -eq 'windows' } | Select-Object -First 1
    @{ destination=$specs[$spec]; url=[string]$archive.complete.url; checksum=[string]$archive.complete.checksum }
}
$packages | ConvertTo-Json | Set-Content -LiteralPath (Join-Path $ToolsRoot 'sdk-packages.json') -Encoding utf8NoBOM
& node (Join-Path $PSScriptRoot 'installSdk.mjs') $ToolsRoot
if ($LASTEXITCODE -ne 0) { throw 'Android SDK installation failed' }
# Reuse the SDK licenses already accepted by this user on this computer.
$existingLicenses = Join-Path $env:LOCALAPPDATA 'Android/Sdk/licenses'
if (Test-Path -LiteralPath $existingLicenses) {
    Copy-Item -LiteralPath $existingLicenses -Destination $sdkRoot -Recurse -Force
}
$gradleArchive = Get-CheckedArchive 'https://services.gradle.org/distributions/gradle-8.14.3-bin.zip' 'gradle-8.14.3-bin.zip' 'bd71102213493060956ec229d946beee57158dbd89d0e62b91bca0fa2c5f3531'
if (!(Test-Path (Join-Path $ToolsRoot 'gradle-distribution/gradle-8.14.3/bin/gradle.bat'))) {
    Expand-Archive -LiteralPath $gradleArchive -DestinationPath (Join-Path $ToolsRoot 'gradle-distribution') -Force
}
$localProperties = Join-Path $PSScriptRoot '../../android/local.properties'
Set-Content -LiteralPath $localProperties -Value ('sdk.dir=' + $sdkRoot.Replace('\', '/')) -Encoding ascii
Write-Output "Build tools ready. JAVA_HOME=$env:JAVA_HOME"
