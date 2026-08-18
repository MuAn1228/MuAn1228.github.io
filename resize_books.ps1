Add-Type -AssemblyName System.Drawing

$srcDir = "D:\blog\source\img\books"

# Find 漫画Party.png
$img1Path = Get-ChildItem "$srcDir" -Filter "*漫画Party*" | Select-Object -First 1
if ($img1Path) {
    $img1 = [System.Drawing.Image]::FromFile($img1Path.FullName)
    $ratio1 = 600.0 / $img1.Width
    $nw1 = 600
    $nh1 = [int]($img1.Height * $ratio1)
    $bmp1 = New-Object System.Drawing.Bitmap($nw1, $nh1)
    $g1 = [System.Drawing.Graphics]::FromImage($bmp1)
    $g1.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g1.DrawImage($img1, 0, 0, $nw1, $nh1)
    $jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
    $params1 = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $params1.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, 85)
    $outPath1 = [System.IO.Path]::ChangeExtension($img1Path.FullName, '.jpg')
    $bmp1.Save($outPath1, $jpeg, $params1)
    $img1.Dispose(); $bmp1.Dispose(); $g1.Dispose()
    Write-Host "漫画Party: $($nw1)x$($nh1) -> $outPath1"
} else {
    Write-Host "漫画Party.png not found"
}

# Find 程序员健康指南.png
$img2Path = Get-ChildItem "$srcDir" -Filter "*程序员健康*" | Select-Object -First 1
if ($img2Path) {
    $img2 = [System.Drawing.Image]::FromFile($img2Path.FullName)
    $ratio2 = 400.0 / $img2.Width
    $nw2 = 400
    $nh2 = [int]($img2.Height * $ratio2)
    $bmp2 = New-Object System.Drawing.Bitmap($nw2, $nh2)
    $g2 = [System.Drawing.Graphics]::FromImage($bmp2)
    $g2.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g2.DrawImage($img2, 0, 0, $nw2, $nh2)
    $outPath2 = [System.IO.Path]::ChangeExtension($img2Path.FullName, '.jpg')
    $bmp2.Save($outPath2, $jpeg, $params1)
    $img2.Dispose(); $bmp2.Dispose(); $g2.Dispose()
    Write-Host "程序员健康指南: $($nw2)x$($nh2) -> $outPath2"
} else {
    Write-Host "程序员健康指南.png not found"
}

Write-Host "Done"
