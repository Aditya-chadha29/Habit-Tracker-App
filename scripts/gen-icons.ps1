Add-Type -AssemblyName System.Drawing

function New-Icon {
    param(
        [string]$OutPath,
        [int]$Size,
        [bool]$Maskable
    )

    $bmp = New-Object System.Drawing.Bitmap $Size, $Size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias

    $bgColor = [System.Drawing.ColorTranslator]::FromHtml('#181716')
    $goldColor = [System.Drawing.ColorTranslator]::FromHtml('#e1ad66')
    $g.Clear($bgColor)

    $goldBrush = New-Object System.Drawing.SolidBrush $goldColor

    $pad = if ($Maskable) { $Size * 0.30 } else { $Size * 0.22 }
    $boxSize = $Size - (2 * $pad)
    $radius = $boxSize * 0.14
    $d = $radius * 2

    $rect = New-Object System.Drawing.RectangleF $pad, $pad, $boxSize, $boxSize
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc($rect.X, $rect.Y, $d, $d, 180, 90)
    $gp.AddArc($rect.Right - $d, $rect.Y, $d, $d, 270, 90)
    $gp.AddArc($rect.Right - $d, $rect.Bottom - $d, $d, $d, 0, 90)
    $gp.AddArc($rect.X, $rect.Bottom - $d, $d, $d, 90, 90)
    $gp.CloseFigure()
    $g.FillPath($goldBrush, $gp)

    $penWidth = [Math]::Max(2, $boxSize * 0.11)
    $pen = New-Object System.Drawing.Pen $bgColor, $penWidth
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round

    $x0 = $pad + $boxSize * 0.20
    $y0 = $pad + $boxSize * 0.52
    $x1 = $pad + $boxSize * 0.42
    $y1 = $pad + $boxSize * 0.74
    $x2 = $pad + $boxSize * 0.80
    $y2 = $pad + $boxSize * 0.26

    $points = @(
        (New-Object System.Drawing.PointF $x0, $y0),
        (New-Object System.Drawing.PointF $x1, $y1),
        (New-Object System.Drawing.PointF $x2, $y2)
    )
    $g.DrawLines($pen, $points)

    $bmp.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $pen.Dispose()
    $goldBrush.Dispose()
    $gp.Dispose()
    $g.Dispose()
    $bmp.Dispose()
}

$pub = Join-Path $PSScriptRoot '..\public'
New-Icon -OutPath (Join-Path $pub 'pwa-192x192.png') -Size 192 -Maskable $false
New-Icon -OutPath (Join-Path $pub 'pwa-512x512.png') -Size 512 -Maskable $false
New-Icon -OutPath (Join-Path $pub 'pwa-maskable-512x512.png') -Size 512 -Maskable $true
New-Icon -OutPath (Join-Path $pub 'apple-touch-icon.png') -Size 180 -Maskable $false

Write-Host "Icons generated in $pub"
