# yard-app 簡易Webサーバー
# 使い方：PowerShellでこのファイルを実行する
# 停止：Ctrl+C

$port = 8080
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.IPAddress -notlike '127.*' -and $_.IPAddress -notlike '169.*'
} | Select-Object -First 1).IPAddress

$listener = New-Object System.Net.HttpListener
# localhost と LAN IPの両方を登録
$listener.Prefixes.Add("http://localhost:$port/")
$listener.Prefixes.Add("http://${ip}:$port/")

try {
    $listener.Start()
} catch {
    $port = 8081
    $listener = New-Object System.Net.HttpListener
    $listener.Prefixes.Add("http://localhost:$port/")
    $listener.Prefixes.Add("http://${ip}:$port/")
    $listener.Start()
}

Write-Host ""
Write-Host "======================================="
Write-Host "  サーバー起動中"
Write-Host "======================================="
Write-Host ""
Write-Host "  PC ブラウザ: http://localhost:$port"
Write-Host "  iPhone:      http://${ip}:$port"
Write-Host ""
Write-Host "  停止するには Ctrl+C を押してください"
Write-Host "======================================="
Write-Host ""

$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.js'   = 'application/javascript'
    '.css'  = 'text/css'
    '.json' = 'application/json'
    '.png'  = 'image/png'
    '.jpg'  = 'image/jpeg'
    '.svg'  = 'image/svg+xml'
    '.ico'  = 'image/x-icon'
    '.dxf'  = 'application/octet-stream'
    '.csv'  = 'text/csv; charset=utf-8'
}

while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    $path = $req.Url.LocalPath
    if ($path -eq '/') { $path = '/index.html' }

    $filePath = Join-Path $root ($path.TrimStart('/').Replace('/', '\'))

    if (Test-Path $filePath -PathType Leaf) {
        $ext  = [System.IO.Path]::GetExtension($filePath).ToLower()
        $mime = if ($mimeTypes[$ext]) { $mimeTypes[$ext] } else { 'application/octet-stream' }
        $bytes = [System.IO.File]::ReadAllBytes($filePath)
        $res.ContentType   = $mime
        $res.ContentLength64 = $bytes.Length
        $res.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
        $res.StatusCode = 404
        $body  = [System.Text.Encoding]::UTF8.GetBytes('404 Not Found')
        $res.OutputStream.Write($body, 0, $body.Length)
    }
    $res.OutputStream.Close()
}
