Add-Type -AssemblyName System.Drawing

$assetsDir = Resolve-Path "assets"
$targetFiles = @("adaptive-icon.png", "icon.png", "splash-icon.png", "splash.png")

foreach ($file in $targetFiles) {
    $fullPath = Join-Path $assetsDir $file
    if (Test-Path $fullPath) {
        Write-Host "Processing $file..."
        $img = [System.Drawing.Image]::FromFile($fullPath)
        $tmpPath = $fullPath + ".realpng"
        $img.Save($tmpPath, [System.Drawing.Imaging.ImageFormat]::Png)
        $img.Dispose()
        Remove-Item -Force $fullPath
        Move-Item -Force $tmpPath $fullPath
        Write-Host "Successfully converted $file to true PNG format."
    }
}
