$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSCommandPath
$url = 'http://localhost:8765/'
$listener = [System.Net.Sockets.TcpListener]::new([System.Net.IPAddress]::Loopback, 8765)

try {
    $listener.Start()
}
catch {
    Start-Process $url
    exit 0
}

Start-Process $url
$mimeTypes = @{
    '.html' = 'text/html; charset=utf-8'
    '.css'  = 'text/css; charset=utf-8'
    '.js'   = 'text/javascript; charset=utf-8'
    '.zip'  = 'application/zip'
}

try {
    while ($true) {
        $client = $listener.AcceptTcpClient()
        try {
            $stream = $client.GetStream()
            $reader = [System.IO.StreamReader]::new($stream, [System.Text.Encoding]::ASCII, $false, 1024, $true)
            $requestLine = $reader.ReadLine()
            if ([string]::IsNullOrWhiteSpace($requestLine)) { continue }
            while ($reader.ReadLine() -ne '') {}

            $path = ($requestLine -split ' ')[1].Split('?')[0]
            $fileName = switch ($path) {
                '/' { 'index.html' }
                '/index.html' { 'index.html' }
                '/styles.css' { 'styles.css' }
                '/app.js' { 'app.js' }
                '/download' { 'Capture-Studio-Windows.zip' }
                default { $null }
            }

            if ($null -eq $fileName) {
                $status = '404 Not Found'
                $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                $contentType = 'text/plain; charset=utf-8'
            }
            else {
                $filePath = Join-Path $root $fileName
                if (-not (Test-Path -LiteralPath $filePath -PathType Leaf)) {
                    $status = '404 Not Found'
                    $body = [System.Text.Encoding]::UTF8.GetBytes('Not found')
                    $contentType = 'text/plain; charset=utf-8'
                }
                else {
                    $status = '200 OK'
                    $body = [System.IO.File]::ReadAllBytes($filePath)
                    $contentType = $mimeTypes[[System.IO.Path]::GetExtension($filePath)]
                }
            }

            $disposition = if ($fileName -eq 'Capture-Studio-Windows.zip' -and $status -eq '200 OK') {
                "Content-Disposition: attachment; filename=`"Capture-Studio-Windows.zip`"`r`n"
            } else { '' }
            $header = "HTTP/1.1 $status`r`nContent-Type: $contentType`r`nContent-Length: $($body.Length)`r`n${disposition}Cache-Control: no-store`r`nConnection: close`r`n`r`n"
            $headerBytes = [System.Text.Encoding]::ASCII.GetBytes($header)
            $stream.Write($headerBytes, 0, $headerBytes.Length)
            $stream.Write($body, 0, $body.Length)
            $stream.Flush()
        }
        catch [System.IO.IOException] {
            # The browser may cancel navigation after receiving a file download.
        }
        finally {
            $client.Dispose()
        }
    }
}
finally {
    $listener.Stop()
}
