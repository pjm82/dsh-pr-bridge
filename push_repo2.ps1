# Push the staged tree to GitHub in one commit using inline tree content.
# Avoids both pitfalls seen here: 409 on blobs for empty repos, and a stray 404
# when combining base_tree with pre-created blob shas.
param(
    [string]$TokenFile = "$env:USERPROFILE\.gh-token",
    [string]$Owner = 'pjm82',
    [string]$RepoName = 'dsh-pr-bridge',
    [string]$Stage = $PSScriptRoot,
    [string]$Message = "Add DSH <-> Premiere Pro bridge"
)

$ErrorActionPreference = 'Stop'
$Api = 'https://api.github.com'
$token = (Get-Content $TokenFile -Raw).Trim()
$headers = @{
    Authorization          = "Bearer $token"
    Accept                 = 'application/vnd.github+json'
    'X-GitHub-Api-Version' = '2022-11-28'
    'User-Agent'           = 'dsh-pr-bridge-uploader'
}

function Invoke-Gh {
    param([string]$Method, [string]$Path, $Body)
    $req = @{ Method = $Method; Uri = "$Api$Path"; Headers = $headers; TimeoutSec = 120 }
    if ($null -ne $Body) {
        $req.Body = ($Body | ConvertTo-Json -Depth 12 -Compress)
        $req.ContentType = 'application/json; charset=utf-8'
    }
    Invoke-RestMethod @req
}

$ref = Invoke-Gh -Method GET -Path "/repos/$Owner/$RepoName/git/ref/heads/main"
$parentSha = $ref.object.sha

$tree = @()
$files = Get-ChildItem -Path $Stage -Recurse -File | Where-Object {
    $_.FullName -notmatch '\\\.git\\' -and $_.Name -notin @('create_repo.ps1', 'push_repo.ps1')
}
foreach ($f in $files) {
    $rel = $f.FullName.Substring($Stage.Length).TrimStart('\').Replace('\', '/')
    $tree += @{
        path    = $rel
        mode    = '100644'
        type    = 'blob'
        content = [IO.File]::ReadAllText($f.FullName, [Text.Encoding]::UTF8)
    }
}
Write-Host "staged $($tree.Count) files"

$newTree = Invoke-Gh -Method POST -Path "/repos/$Owner/$RepoName/git/trees" -Body @{ tree = $tree }
$commit = Invoke-Gh -Method POST -Path "/repos/$Owner/$RepoName/git/commits" -Body @{
    message = $Message
    tree    = $newTree.sha
    parents = @($parentSha)
}
Invoke-Gh -Method PATCH -Path "/repos/$Owner/$RepoName/git/refs/heads/main" -Body @{ sha = $commit.sha; force = $true } | Out-Null

$check = Invoke-Gh -Method GET -Path "/repos/$Owner/$RepoName/git/trees/main?recursive=1"
Write-Host "commit $($commit.sha) -> $($check.tree.Count) paths"
$check.tree | ForEach-Object { Write-Host "  $($_.path)  $($_.size)" }
Write-Host "URL: https://github.com/$Owner/$RepoName"
