Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$srcPath = Join-Path $root "assets\images\logo.png"
$src = [System.Drawing.Image]::FromFile($srcPath)

function New-PaddedIcon {
    param(
        [string]$OutPath,
        [int]$Canvas,
        [double]$LogoRatio,
        [string]$BgHex # $null for transparent
    )
    $bmp = New-Object System.Drawing.Bitmap($Canvas, $Canvas, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($BgHex) {
        $c = [System.Drawing.ColorTranslator]::FromHtml($BgHex)
        $g.Clear($c)
    } else {
        $g.Clear([System.Drawing.Color]::Transparent)
    }

    $logoSize = [int]([math]::Round($Canvas * $LogoRatio))
    $offset = [int]([math]::Round(($Canvas - $logoSize) / 2))
    $destRect = New-Object System.Drawing.Rectangle($offset, $offset, $logoSize, $logoSize)
    $g.DrawImage($src, $destRect, 0, 0, $src.Width, $src.Height, [System.Drawing.GraphicsUnit]::Pixel)

    $g.Dispose()
    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    Write-Host "Wrote $OutPath ($Canvas x $Canvas, logo ${LogoRatio})"
}

$img = Join-Path $root "assets\images"

# Main app icon: opaque white background, phoenix padded to 76% (avoids legacy mask cropping)
New-PaddedIcon -OutPath (Join-Path $img "icon.png") -Canvas 1024 -LogoRatio 0.76 -BgHex "#FFFFFF"

# Adaptive foreground: transparent, phoenix at 62% so it sits fully inside the 66% safe zone
New-PaddedIcon -OutPath (Join-Path $img "adaptive-icon.png") -Canvas 1024 -LogoRatio 0.62 -BgHex $null

# Splash logo: transparent, phoenix at 70%, high resolution
New-PaddedIcon -OutPath (Join-Path $img "splash-icon.png") -Canvas 1024 -LogoRatio 0.70 -BgHex $null

$src.Dispose()
Write-Host "DONE"
