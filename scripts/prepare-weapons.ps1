# Prépare les armes du « Free Classic Weapons Pack » (Stein Games, CC0) pour le web :
# copie des FBX, conversion des textures PNG en JPG, et réorganisation RMAO -> ARM
# (three.js lit l'occlusion dans R, la rugosité dans G et le métal dans B).
param(
  [string]$Src = "downloads/weapons_raw/WeaponsPack",
  [string]$Dst = "public/assets/weapons",
  [string[]]$Weapons = @('AK47', 'MP5', 'M700', '1911', 'M14')
)
Add-Type -AssemblyName System.Drawing
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Tex {
  static ImageCodecInfo Jpg() { foreach (var c in ImageCodecInfo.GetImageEncoders()) if (c.MimeType == "image/jpeg") return c; return null; }
  public static void SaveJpg(Bitmap b, string path, long q) {
    var p = new EncoderParameters(1); p.Param[0] = new EncoderParameter(System.Drawing.Imaging.Encoder.Quality, q);
    b.Save(path, Jpg(), p);
  }
  public static Bitmap Resize(Image src, int size) {
    var b = new Bitmap(size, size, PixelFormat.Format24bppRgb);
    using (var g = Graphics.FromImage(b)) { g.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic; g.DrawImage(src, 0, 0, size, size); }
    return b;
  }
  // RMAO (R=rugosité, G=métal, B=AO) -> ARM (R=AO, G=rugosité, B=métal)
  public static void Remap(Bitmap b) {
    var r = new Rectangle(0, 0, b.Width, b.Height);
    var d = b.LockBits(r, ImageLockMode.ReadWrite, PixelFormat.Format24bppRgb);
    int n = d.Stride * b.Height; var a = new byte[n]; Marshal.Copy(d.Scan0, a, 0, n);
    for (int y = 0; y < b.Height; y++) for (int x = 0; x < b.Width; x++) {
      int i = y * d.Stride + x * 3; // ordre BGR en mémoire
      byte rough = a[i + 2], metal = a[i + 1], ao = a[i];
      a[i + 2] = ao; a[i + 1] = rough; a[i] = metal;
    }
    Marshal.Copy(a, 0, d.Scan0, n); b.UnlockBits(d);
  }
}
"@
foreach ($w in $Weapons) {
  $s = Join-Path $Src $w; $d = Join-Path $Dst $w
  New-Item -ItemType Directory -Force $d | Out-Null
  Copy-Item (Get-ChildItem $s -Filter *.fbx).FullName (Join-Path $d "$w.fbx") -Force
  $files = Get-ChildItem $s -File
  $col = $files | Where-Object { $_.Name -match '_C\.png$' } | Select-Object -First 1
  $nor = $files | Where-Object { $_.Name -match '_N\.png$' } | Select-Object -First 1
  $rma = $files | Where-Object { $_.Name -match '_RMAO\.png$' } | Select-Object -First 1
  if ($col) { $img = [Drawing.Image]::FromFile($col.FullName); $b = [Tex]::Resize($img, 2048); [Tex]::SaveJpg($b, (Join-Path $d 'color.jpg'), 90); $b.Dispose(); $img.Dispose() }
  if ($nor) { $img = [Drawing.Image]::FromFile($nor.FullName); $b = [Tex]::Resize($img, 2048); [Tex]::SaveJpg($b, (Join-Path $d 'normal.jpg'), 95); $b.Dispose(); $img.Dispose() }
  if ($rma) { $img = [Drawing.Image]::FromFile($rma.FullName); $b = [Tex]::Resize($img, 1024); [Tex]::Remap($b); [Tex]::SaveJpg($b, (Join-Path $d 'arm.jpg'), 92); $b.Dispose(); $img.Dispose() }
  $size = (Get-ChildItem $d -File | Measure-Object Length -Sum).Sum / 1MB
  "{0,-6} {1:N1} Mo" -f $w, $size
}
