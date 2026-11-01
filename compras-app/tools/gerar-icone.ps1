# Gera os icones PNG (Android antigo / fallback) com o mesmo desenho do res\drawable\ic_fg.xml.
# Uso: powershell -File tools\gerar-icone.ps1   (os PNGs gerados ficam em res\mipmap-*)
Add-Type -AssemblyName System.Drawing
$root = Split-Path $PSScriptRoot -Parent
$tamanhos = @{ 'mdpi' = 48; 'hdpi' = 72; 'xhdpi' = 96; 'xxhdpi' = 144; 'xxxhdpi' = 192 }

foreach ($d in $tamanhos.Keys) {
    $t = $tamanhos[$d]
    $s = $t / 108.0
    $bmp = New-Object System.Drawing.Bitmap($t, $t)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = 'AntiAlias'
    $g.Clear([System.Drawing.Color]::Transparent)

    # fundo: quadrado arredondado azul
    $azul = [System.Drawing.Color]::FromArgb(255, 0x25, 0x63, 0xEB)
    $r = [int]($t * 0.22)
    $gp = New-Object System.Drawing.Drawing2D.GraphicsPath
    $gp.AddArc(0, 0, 2 * $r, 2 * $r, 180, 90)
    $gp.AddArc($t - 2 * $r - 1, 0, 2 * $r, 2 * $r, 270, 90)
    $gp.AddArc($t - 2 * $r - 1, $t - 2 * $r - 1, 2 * $r, 2 * $r, 0, 90)
    $gp.AddArc(0, $t - 2 * $r - 1, 2 * $r, 2 * $r, 90, 90)
    $gp.CloseFigure()
    $g.FillPath((New-Object System.Drawing.SolidBrush($azul)), $gp)

    $branco = [System.Drawing.Brushes]::White
    $caneta = New-Object System.Drawing.Pen([System.Drawing.Color]::White, [single](4.5 * $s))
    $caneta.StartCap = 'Round'; $caneta.EndCap = 'Round'; $caneta.LineJoin = 'Round'

    function P($x, $y) { New-Object System.Drawing.PointF([single]($x * $s), [single]($y * $s)) }
    # cesta
    $g.FillPolygon($branco, [System.Drawing.PointF[]]@((P 40 42), (P 80 42), (P 73 63), (P 47 63)))
    # alca e fundo do carrinho
    $g.DrawLines($caneta, [System.Drawing.PointF[]]@((P 28 34), (P 40 34), (P 48 64), (P 72 64)))
    # rodas
    foreach ($cx in 51, 69) {
        $g.FillEllipse($branco, [single](($cx - 4.5) * $s), [single]((72 - 4.5) * $s), [single](9 * $s), [single](9 * $s))
    }
    $g.Dispose()
    $pasta = Join-Path $root "res\mipmap-$d"
    New-Item -ItemType Directory -Force $pasta | Out-Null
    $bmp.Save((Join-Path $pasta 'ic_launcher.png'), [System.Drawing.Imaging.ImageFormat]::Png)
    $bmp.Dispose()
    "{0,-8} {1}x{1}" -f $d, $t
}
