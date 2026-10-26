# DSH <-> Premiere Pro bridge client
# Usage:
#   . .\dsh-pr.ps1
#   Invoke-PRJsx -Jsx 'app.version' -Verbose
#   Wait-PRBridge -TimeoutSec 120

$script:BridgeRoot = Join-Path $env:LOCALAPPDATA 'DSH\pr-bridge'
$script:QueueDir   = Join-Path $script:BridgeRoot 'queue'
$script:DoneDir    = Join-Path $script:BridgeRoot 'done'
$script:StatusFile = Join-Path $script:BridgeRoot 'status.json'

function Initialize-PRBridge {
    foreach ($d in @($script:BridgeRoot, $script:QueueDir, $script:DoneDir, (Join-Path $script:BridgeRoot 'logs'))) {
        if (-not (Test-Path $d)) { New-Item -ItemType Directory -Force -Path $d | Out-Null }
    }
}

function Get-PRBridgeStatus {
    if (-not (Test-Path $script:StatusFile)) { return $null }
    try {
        $s = Get-Content $script:StatusFile -Raw | ConvertFrom-Json
        $s | Add-Member -NotePropertyName ageSeconds -NotePropertyValue ([int](([DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds() - $s.ts) / 1000)) -Force
        return $s
    } catch { return $null }
}

# Blocks until the CEP panel writes a fresh heartbeat (panel open + PR focused once).
function Wait-PRBridge {
    param([int]$TimeoutSec = 120, [int]$MaxAgeSec = 5)
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        $s = Get-PRBridgeStatus
        if ($s -and $s.ageSeconds -le $MaxAgeSec) { return $s }
        Start-Sleep -Milliseconds 700
    }
    return $null
}

# Send one ExtendScript snippet, block for the result.
function Invoke-PRJsx {
    param(
        [Parameter(Mandatory=$true)][string]$Jsx,
        [int]$TimeoutSec = 90
    )
    Initialize-PRBridge
    $id = [guid]::NewGuid().ToString('N').Substring(0, 12)
    $cmdFile = Join-Path $script:QueueDir "$id.json"
    $payload = @{ id = $id; jsx = $Jsx } | ConvertTo-Json -Compress
    [IO.File]::WriteAllText($cmdFile, $payload, [Text.UTF8Encoding]::new($false))

    $doneFile = Join-Path $script:DoneDir "$id.json"
    $deadline = (Get-Date).AddSeconds($TimeoutSec)
    while ((Get-Date) -lt $deadline) {
        if (Test-Path $doneFile) {
            Start-Sleep -Milliseconds 60
            $res = Get-Content $doneFile -Raw | ConvertFrom-Json
            Remove-Item $doneFile -Force -ErrorAction SilentlyContinue
            return $res
        }
        Start-Sleep -Milliseconds 120
    }
    Remove-Item $cmdFile -Force -ErrorAction SilentlyContinue
    return [pscustomobject]@{ id = $id; ok = $false; result = "timeout after ${TimeoutSec}s (is the DSH PR Bridge panel open in Premiere?)" }
}

# Preferred entry point: run a .jsx file from disk inside Premiere.
# Avoids all quoting/escaping problems of inline JSX and keeps scripts versioned.
function Invoke-PRFile {
    param(
        [Parameter(Mandatory=$true)][string]$Path,
        [int]$TimeoutSec = 120
    )
    $full = (Resolve-Path $Path).ProviderPath -replace '\\', '/'
    return Invoke-PRJsx -Jsx "`$.evalFile('$full')" -TimeoutSec $TimeoutSec
}

# ExtendScript cannot JSON.stringify; write results with File() and read them back.
function Invoke-PRJsxFile {
    param(
        [Parameter(Mandatory=$true)][string]$Jsx,
        [string]$OutFile,
        [int]$TimeoutSec = 90
    )
    if (-not $OutFile) { $OutFile = Join-Path $script:BridgeRoot ("out-" + [guid]::NewGuid().ToString('N').Substring(0,8) + ".txt") }
    Remove-Item $OutFile -Force -ErrorAction SilentlyContinue
    $escaped = $OutFile -replace '\\', '/'
    $full = "var __out = new File('$escaped');`n" +
            "try { __out.encoding='UTF-8'; __out.open('w'); } catch(e) {`n" +
            "  try { __out.lineFeed='Unix'; __out.open('w'); } catch(e2) {} }`n" +
            "function __log(s){ try { __out.writeln(s); } catch(e){} }`n" +
            "try {`n" + $Jsx + "`n__log('__DSH_OK__');`n} catch(err) {`n  __log('__DSH_ERR__ ' + err.toString() + ' @line ' + err.line);`n}`n" +
            "try { __out.close(); } catch(e) {}`n'__DSH_DONE__';"
    $r = Invoke-PRJsx -Jsx $full -TimeoutSec $TimeoutSec
    $text = ''
    if (Test-Path $OutFile) { $text = Get-Content $OutFile -Raw }
    return [pscustomobject]@{ id = $r.id; ok = $r.ok; eval = $r.result; out = $text; outFile = $OutFile }
}
