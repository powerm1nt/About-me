<#
.SYNOPSIS
    Provisions Azure Blob Storage + Azure Front Door CDN and uploads static assets.
.NOTES
    Compatible with Windows PowerShell 5.1+
#>

[CmdletBinding()]
param(
    [string]$SubscriptionId    = "",
    [string]$ResourceGroup     = "Default",
    [string]$Location          = "japaneast",
    [string]$StorageAccount    = "nwrks",
    [string]$ContainerName     = "static",
    [string]$FrontDoorProfile  = "nwrks-fd",
    [string]$FrontDoorEndpoint = "nwrks-cdn",
    [string]$SourcePath        = "C:\Users\Emi\Developer\About-me\public",
    [string]$ContentPath       = "C:\Users\Emi\Developer\About-me"
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Write-Step { param($msg) Write-Host "`n>> $msg" -ForegroundColor Cyan }
function Write-Ok   { param($msg) Write-Host "   OK  $msg" -ForegroundColor Green }
function Write-Warn { param($msg) Write-Host "   !!  $msg" -ForegroundColor Yellow }

# --- 1. Ensure Azure CLI ---
Write-Step "Checking Azure CLI"
if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
    Write-Warn "Azure CLI not found. Installing via winget..."
    winget install --id Microsoft.AzureCLI -e --accept-package-agreements --accept-source-agreements
    $env:PATH += ";C:\Program Files\Microsoft SDKs\Azure\CLI2\wbin"
    if (-not (Get-Command az -ErrorAction SilentlyContinue)) {
        throw "Azure CLI install failed. Install manually: https://aka.ms/installazurecliwindows"
    }
}
Write-Ok "Azure CLI ready"

# --- 2. Login & set subscription ---
Write-Step "Authenticating with Azure"
$account = az account show 2>$null | ConvertFrom-Json
if (-not $account) {
    az login --output none
    $account = az account show | ConvertFrom-Json
}
Write-Ok "Logged in as: $($account.user.name)"
Write-Ok "Subscription : $($account.name) ($($account.id))"

if ($SubscriptionId) {
    az account set --subscription $SubscriptionId
    Write-Ok "Switched to subscription $SubscriptionId"
}

# --- 3. Resource Group ---
Write-Step "Resource Group: $ResourceGroup"
$rgExists = az group exists --name $ResourceGroup
if ($rgExists -eq "true") {
    Write-Ok "Already exists"
} else {
    az group create --name $ResourceGroup --location $Location --output none
    Write-Ok "Created in $Location"
}

# --- 4. Storage Account ---
Write-Step "Storage Account: $StorageAccount"
$saAvailable = az storage account check-name --name $StorageAccount --query "nameAvailable" -o tsv
if ($saAvailable -eq "false") {
    Write-Ok "Storage account '$StorageAccount' already exists - skipping creation"
} else {
    az storage account create --name $StorageAccount --resource-group $ResourceGroup --location $Location --sku Standard_LRS --kind StorageV2 --allow-blob-public-access true --output none
    Write-Ok "Storage account created"
}

$storageKey = az storage account keys list --account-name $StorageAccount --resource-group $ResourceGroup --query "[0].value" -o tsv

# --- 5. Blob Container ---
Write-Step "Container: $ContainerName (public blob access)"
az storage container create --name $ContainerName --account-name $StorageAccount --account-key $storageKey --public-access blob --output none
Write-Ok "Container '$ContainerName' ready"

# --- 6. MIME type map ---
$mimeTypes = @{
    ".html"  = "text/html"
    ".htm"   = "text/html"
    ".css"   = "text/css"
    ".js"    = "application/javascript"
    ".json"  = "application/json"
    ".xml"   = "application/xml"
    ".txt"   = "text/plain"
    ".md"    = "text/markdown"
    ".mdx"   = "text/markdown"
    ".png"   = "image/png"
    ".jpg"   = "image/jpeg"
    ".jpeg"  = "image/jpeg"
    ".gif"   = "image/gif"
    ".svg"   = "image/svg+xml"
    ".ico"   = "image/x-icon"
    ".webp"  = "image/webp"
    ".woff"  = "font/woff"
    ".woff2" = "font/woff2"
    ".ttf"   = "font/ttf"
    ".eot"   = "application/vnd.ms-fontobject"
    ".pdf"   = "application/pdf"
    ".map"   = "application/json"
}

# --- 7. Upload all files ---
Write-Step "Uploading assets from: $SourcePath"

if (-not (Test-Path $SourcePath)) {
    throw "Source path not found: $SourcePath"
}

$files = Get-ChildItem -Path $SourcePath -Recurse -File
$total = $files.Count
$index = 0

foreach ($file in $files) {
    $index++
    $relativePath = $file.FullName.Substring($SourcePath.Length).TrimStart('\', '/').Replace('\', '/')
    $ext          = $file.Extension.ToLower()
    $contentType  = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "application/octet-stream" }

    Write-Host "   [$index/$total] $relativePath" -ForegroundColor Gray

    az storage blob upload --account-name $StorageAccount --account-key $storageKey --container-name $ContainerName --name $relativePath --file $file.FullName --content-type $contentType --overwrite true --output none
}

Write-Ok "Uploaded $total files to '$ContainerName'"

# --- 7b. Upload markdown content files (stored as .md blobs, source may be .mdx) ---
Write-Step "Uploading content files from: $ContentPath"

$contentFiles = Get-ChildItem -Path $ContentPath -Recurse -File -Include "*.mdx","*.md","articles-metadata.json" |
    Where-Object { $_.FullName -notmatch [regex]::Escape("node_modules") -and $_.FullName -notmatch [regex]::Escape(".git") -and $_.FullName -notmatch [regex]::Escape("src\\") }

$ctotal = $contentFiles.Count
$cindex = 0

foreach ($file in $contentFiles) {
    $cindex++
    $rel = $file.FullName.Substring($ContentPath.Length).TrimStart('\', '/').Replace('\', '/')

    # Store .mdx files under their .md equivalent name so the API resolves them
    $blobName = $rel -replace '\.ja\.mdx$', '.ja.md' -replace '\.mdx$', '.md'

    $ext = $file.Extension.ToLower()
    $contentType = if ($mimeTypes.ContainsKey($ext)) { $mimeTypes[$ext] } else { "text/plain" }

    Write-Host "   [$cindex/$ctotal] $rel -> $blobName" -ForegroundColor Gray

    az storage blob upload --account-name $StorageAccount --account-key $storageKey --container-name $ContainerName --name $blobName --file $file.FullName --content-type $contentType --overwrite true --output none
}

Write-Ok "Uploaded $ctotal content files to '$ContainerName'"

$blobEndpoint
Write-Ok "Blob endpoint: $blobEndpoint"

# --- 8. Azure Front Door ---
Write-Step "Registering Microsoft.Cdn resource provider"
az provider register --namespace Microsoft.Cdn --output none
Write-Host "   Waiting for Microsoft.Cdn registration..." -ForegroundColor Gray
do {
    Start-Sleep -Seconds 5
    $state = az provider show --namespace Microsoft.Cdn --query "registrationState" -o tsv
    Write-Host "   State: $state" -ForegroundColor Gray
} while ($state -ne "Registered")
Write-Ok "Microsoft.Cdn registered"

Write-Step "Azure Front Door profile: $FrontDoorProfile"
az extension add --name front-door --only-show-errors 2>$null
az afd profile create --profile-name $FrontDoorProfile --resource-group $ResourceGroup --sku Standard_AzureFrontDoor --output none 2>$null
Write-Ok "Front Door profile ready"

# --- 9. Endpoint ---
Write-Step "Front Door Endpoint: $FrontDoorEndpoint"
az afd endpoint create --endpoint-name $FrontDoorEndpoint --profile-name $FrontDoorProfile --resource-group $ResourceGroup --enabled-state Enabled --output none 2>$null
$fdHostname = az afd endpoint show --endpoint-name $FrontDoorEndpoint --profile-name $FrontDoorProfile --resource-group $ResourceGroup --query "hostName" -o tsv
Write-Ok "Endpoint: https://$fdHostname"

# --- 10. Origin Group ---
Write-Step "Origin Group: blob-origin-group"
az afd origin-group create --origin-group-name blob-origin-group --profile-name $FrontDoorProfile --resource-group $ResourceGroup --probe-request-type HEAD --probe-protocol Https --probe-interval-in-seconds 60 --probe-path "/" --sample-size 4 --successful-samples-required 3 --output none 2>$null
Write-Ok "Origin group ready"

# --- 11. Origin ---
Write-Step "Origin: $StorageAccount.blob.core.windows.net"
az afd origin create --origin-name blob-origin --origin-group-name blob-origin-group --profile-name $FrontDoorProfile --resource-group $ResourceGroup --host-name "$StorageAccount.blob.core.windows.net" --origin-host-header "$StorageAccount.blob.core.windows.net" --http-port 80 --https-port 443 --priority 1 --weight 1000 --enabled-state Enabled --output none 2>$null
Write-Ok "Origin configured"

# --- 12. Route ---
Write-Step "Route: /* -> blob-origin-group"
az afd route create --route-name default-route --endpoint-name $FrontDoorEndpoint --profile-name $FrontDoorProfile --resource-group $ResourceGroup --origin-group blob-origin-group --forwarding-protocol HttpsOnly --https-redirect Enabled --patterns-to-match "/*" --supported-protocols Http Https --link-to-default-domain Enabled --output none 2>$null
Write-Ok "Route ready"

# --- Summary ---
Write-Host ""
Write-Host "=================================================" -ForegroundColor Magenta
Write-Host " Deployment complete!" -ForegroundColor Magenta
Write-Host "=================================================" -ForegroundColor Magenta
Write-Host ""
Write-Host "  Storage account : $StorageAccount"
Write-Host "  Container       : $ContainerName (public blob)"
Write-Host "  Direct blob URL : $blobEndpoint"
Write-Host "  Front Door CDN  : https://$fdHostname"
Write-Host ""
Write-Host "  Asset example   : https://$fdHostname/$ContainerName/cardboard.png"
Write-Host "  Blog example    : https://$fdHostname/$ContainerName/blog/index.md"
Write-Host ""
Write-Host "  Note: Front Door propagation may take 5-10 minutes." -ForegroundColor Yellow
Write-Host ""
