$key = (Get-Content "C:\Users\Emi\source\repos\NukaWorks.Website\Server\appsettings.Development.json" | ConvertFrom-Json).BlobStorage.AccountKey
$account = "nwrks"
$container = "static"

function Upload-Blob {
	param([string]$localPath, [string]$blobName, [string]$contentType)
	$bytes = [System.IO.File]::ReadAllBytes($localPath)
	$date = [DateTime]::UtcNow.ToString("R")
	$cl = $bytes.Length.ToString()
	$ch = "x-ms-blob-type:BlockBlob`nx-ms-date:$date`nx-ms-version:2020-10-02"
	$cr = "/$account/$container/$blobName"
	$sts = "PUT`n`n`n$cl`n`n$contentType`n`n`n`n`n`n`n$ch`n$cr"
	$hmac = New-Object System.Security.Cryptography.HMACSHA256
	$hmac.Key = [Convert]::FromBase64String($key)
	$sig = [Convert]::ToBase64String($hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($sts)))
	$uri = "https://$account.blob.core.windows.net/$container/$blobName"
	$headers = @{
		"Authorization"  = "SharedKey ${account}:${sig}"
		"x-ms-date"      = $date
		"x-ms-version"   = "2020-10-02"
		"x-ms-blob-type" = "BlockBlob"
		"Content-Type"   = $contentType
	}
	try {
		Invoke-RestMethod -Uri $uri -Method PUT -Headers $headers -Body $bytes | Out-Null
		Write-Host "OK  $blobName" -ForegroundColor Green
	} catch {
		Write-Host "FAIL $blobName - $_" -ForegroundColor Red
	}
}

Upload-Blob "C:\Users\Emi\Developer\About-me\src\Common\Components\HeadlineLogo\pfp.jpg" "pfp.jpg" "image/jpeg"
Upload-Blob "C:\Users\Emi\Developer\About-me\src\Common\Components\HeadlineLogo\logo.png" "logo.png" "image/png"
