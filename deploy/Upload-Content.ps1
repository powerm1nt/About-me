<#
.SYNOPSIS
	Uploads markdown content files to Azure Blob Storage using the REST API.
	No Azure CLI required — only needs a Storage Account Key.
.EXAMPLE
	.\Upload-Content.ps1 -StorageKey "your_key_here"
#>

[CmdletBinding()]
param(
	[Parameter(Mandatory)]
	[string]$StorageKey,

	[string]$StorageAccount = "nwrks",
	[string]$ContainerName  = "static",
	[string]$ContentPath    = "C:\Users\Emi\Developer\About-me"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Ok   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Info { param($msg) Write-Host "   $msg" -ForegroundColor Gray }

# Build HMAC-SHA256 signature for Azure Storage shared key auth
function Get-StorageSignature {
	param(
		[string]$Method,
		[string]$ContentLength,
		[string]$ContentType,
		[string]$Date,
		[string]$BlobName
	)

	$canonicalizedHeaders = "x-ms-blob-type:BlockBlob`nx-ms-date:$Date`nx-ms-version:2020-10-02"
	$canonicalizedResource = "/$StorageAccount/$ContainerName/$BlobName"

	$stringToSign = "$Method`n`n`n$ContentLength`n`n$ContentType`n`n`n`n`n`n`n$canonicalizedHeaders`n$canonicalizedResource"

	$keyBytes  = [Convert]::FromBase64String($StorageKey)
	$hmac      = New-Object System.Security.Cryptography.HMACSHA256
	$hmac.Key  = $keyBytes
	$sigBytes  = $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($stringToSign))
	return [Convert]::ToBase64String($sigBytes)
}

function Upload-Blob {
	param(
		[string]$LocalPath,
		[string]$BlobName,
		[string]$ContentType = "text/markdown"
	)

	$bytes         = [System.IO.File]::ReadAllBytes($LocalPath)
	$contentLength = $bytes.Length.ToString()
	$date          = [DateTime]::UtcNow.ToString("R")
	$sig           = Get-StorageSignature -Method "PUT" -ContentLength $contentLength -ContentType $ContentType -Date $date -BlobName $BlobName

	$uri     = "https://$StorageAccount.blob.core.windows.net/$ContainerName/$BlobName"
	$headers = @{
		"Authorization"  = "SharedKey ${StorageAccount}:${sig}"
		"x-ms-date"      = $date
		"x-ms-version"   = "2020-10-02"
		"x-ms-blob-type" = "BlockBlob"
		"Content-Type"   = $ContentType
	}

	try {
		Invoke-RestMethod -Uri $uri -Method PUT -Headers $headers -Body $bytes | Out-Null
		Write-Ok "$BlobName"
	}
	catch {
		Write-Host "   FAIL $BlobName - $_" -ForegroundColor Red
	}
}

# Collect .mdx and .md files (exclude node_modules, .git, src/)
$files = Get-ChildItem -Path $ContentPath -Recurse -File -Include "*.mdx","*.md" |
	Where-Object { $_.FullName -notmatch [regex]::Escape("node_modules") -and
				   $_.FullName -notmatch [regex]::Escape(".git")         -and
				   $_.FullName -notmatch "\\src\\" }

Write-Step "Uploading $($files.Count) content files to '$ContainerName'"

foreach ($file in $files) {
	$rel      = $file.FullName.Substring($ContentPath.Length).TrimStart('\','/').Replace('\','/')
	# Rename .mdx -> .md in the blob name
	$blobName = $rel -replace '\.ja\.mdx$', '.ja.md' -replace '\.mdx$', '.md'

	Write-Info "$rel  ->  $blobName"
	Upload-Blob -LocalPath $file.FullName -BlobName $blobName
}

Write-Step "Done"
Write-Host ""
Write-Host "  Blob endpoint: https://$StorageAccount.blob.core.windows.net/$ContainerName" -ForegroundColor Magenta
