param(
  [string]$Path,
  [int]$MaxDim
)

Add-Type -AssemblyName System.Drawing

$src = [System.Drawing.Bitmap]::FromFile($Path)
$w = $src.Width
$h = $src.Height

if ($w -gt $MaxDim -or $h -gt $MaxDim) {
  if ($w -gt $h) {
    $nh = [int]($h * $MaxDim / $w)
    $nw = $MaxDim
  } else {
    $nw = [int]($w * $MaxDim / $h)
    $nh = $MaxDim
  }
} else {
  $nw = $w
  $nh = $h
}

$dest = New-Object System.Drawing.Bitmap($nw, $nh)
$g = [System.Drawing.Graphics]::FromImage($dest)
$g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.DrawImage($src, 0, 0, $nw, $nh)

$src.Dispose()
$g.Dispose()

$tmp = "$Path.tmp.png"
$dest.Save($tmp, [System.Drawing.Imaging.ImageFormat]::Png)
$dest.Dispose()

Move-Item -Path $tmp -Destination $Path -Force
