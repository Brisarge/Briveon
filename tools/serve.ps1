# Local preview server for the site. No Node or Python needed.
# Run from anywhere:
#   powershell -ExecutionPolicy Bypass -File tools\serve.ps1
# then open http://localhost:5173/  (admin demo: http://localhost:5173/admin/?demo)
param(
  [int]$Port = 5173,
  [string]$Root = (Split-Path -Parent $PSScriptRoot)
)

$rootFull = [IO.Path]::GetFullPath($Root).TrimEnd('\')
$mime = @{
  '.html' = 'text/html; charset=utf-8'
  '.css'  = 'text/css; charset=utf-8'
  '.js'   = 'text/javascript; charset=utf-8'
  '.json' = 'application/json; charset=utf-8'
  '.svg'  = 'image/svg+xml'
  '.png'  = 'image/png'
  '.jpg'  = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.gif'  = 'image/gif'
  '.ico'  = 'image/x-icon'
  '.mp3'  = 'audio/mpeg'
  '.ogg'  = 'audio/ogg'
  '.wav'  = 'audio/wav'
  '.mp4'  = 'video/mp4'
  '.md'   = 'text/plain; charset=utf-8'
  '.sql'  = 'text/plain; charset=utf-8'
  '.txt'  = 'text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
$listener.Start()
Write-Host "Serving $rootFull at http://localhost:$Port/  (Ctrl+C to stop)"

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response
    try {
      $urlPath = [Uri]::UnescapeDataString($req.Url.AbsolutePath)
      $rel = $urlPath.TrimStart('/').Replace('/', '\')
      $path = [IO.Path]::GetFullPath((Join-Path $rootFull $rel))

      if ($path -ne $rootFull -and -not $path.StartsWith($rootFull + '\', [StringComparison]::OrdinalIgnoreCase)) {
        $res.StatusCode = 403
      }
      elseif (Test-Path -LiteralPath $path -PathType Container) {
        if (-not $urlPath.EndsWith('/')) {
          # same as GitHub Pages: /admin -> /admin/ so relative links work
          $res.StatusCode = 301
          $res.RedirectLocation = $urlPath + '/' + $req.Url.Query
        }
        else {
          $path = Join-Path $path 'index.html'
        }
      }

      if ($res.StatusCode -eq 200) {
        if (Test-Path -LiteralPath $path -PathType Leaf) {
          $ext = [IO.Path]::GetExtension($path).ToLowerInvariant()
          $type = $mime[$ext]
          if (-not $type) { $type = 'application/octet-stream' }
          $res.ContentType = $type
          $res.Headers.Add('Cache-Control', 'no-store')
          $res.Headers.Add('Accept-Ranges', 'bytes')
          $fs = [IO.File]::OpenRead($path)
          try {
            $total = $fs.Length
            $start = 0L
            $end = $total - 1
            # Range requests let video/audio load in pieces instead of all at once
            $range = $req.Headers['Range']
            if ($range -and $range -match '^bytes=(\d*)-(\d*)$') {
              if ($Matches[1] -ne '') { $start = [long]$Matches[1] }
              if ($Matches[2] -ne '') { $end = [Math]::Min([long]$Matches[2], $total - 1) }
              if ($Matches[1] -eq '' -and $Matches[2] -ne '') { $start = [Math]::Max(0, $total - [long]$Matches[2]); $end = $total - 1 }
              $res.StatusCode = 206
              $res.Headers.Add('Content-Range', "bytes $start-$end/$total")
            }
            $res.ContentLength64 = $end - $start + 1
            $fs.Position = $start
            $left = $end - $start + 1
            $chunk = New-Object byte[] 65536
            while ($left -gt 0) {
              $read = $fs.Read($chunk, 0, [int][Math]::Min($chunk.Length, $left))
              if ($read -le 0) { break }
              $res.OutputStream.Write($chunk, 0, $read)
              $left -= $read
            }
          }
          finally {
            $fs.Dispose()
          }
        }
        else {
          $res.StatusCode = 404
        }
      }
      Write-Host ("{0} {1} {2}" -f $res.StatusCode, $req.HttpMethod, $urlPath)
    }
    catch {
      try { $res.StatusCode = 500 } catch {}
    }
    finally {
      try { $res.Close() } catch {}
    }
  }
}
finally {
  $listener.Stop()
}
