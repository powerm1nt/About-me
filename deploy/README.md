# Azure Deployment — NukaWorks Static Assets CDN

Provisions the following Azure infrastructure and uploads all static assets:

| Resource | Value |
|---|---|
| Resource Group | `Default` |
| Storage Account | `nwrks` |
| Blob Container | `static` (public read) |
| Front Door Profile | `nwrks-fd` (Standard SKU) |
| Front Door Endpoint | `nwrks-cdn` |
| Source folder | `C:\Users\Emi\Developer\About-me\public` |

---

## Prerequisites

- **Windows 10/11** or Windows Server 2019+
- **PowerShell 7+** — [Download](https://aka.ms/powershell)
- **Azure CLI** — installed automatically by the script via `winget` if missing, or manually from [aka.ms/installazurecliwindows](https://aka.ms/installazurecliwindows)
- An active **Azure subscription**

---

## Usage

Open a PowerShell 7 terminal and run:

```powershell
cd deploy
.\Deploy-Azure.ps1
```

### Override defaults

```powershell
.\Deploy-Azure.ps1 `
	-SubscriptionId   "xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx" `
	-ResourceGroup    "Default" `
	-Location         "japaneast" `
	-StorageAccount   "nwrks" `
	-ContainerName    "static" `
	-FrontDoorProfile "nwrks-fd" `
	-FrontDoorEndpoint "nwrks-cdn" `
	-SourcePath       "C:\Users\Emi\Developer\About-me\public"
```

---

## What the script does

1. **Installs Azure CLI** via `winget` if not already present
2. **Logs you in** (`az login`) if not already authenticated
3. **Creates resource group** `nwrks-rg` in `eastus`
4. **Creates storage account** `nwrksassets` (Standard LRS, blob public access on)
5. **Creates container** `jade` with public blob read access
6. **Uploads every file** from `About-me/public` preserving the folder structure and setting correct `Content-Type` headers per extension
7. **Creates Front Door Standard** profile `nwrks-fd`
8. **Creates CDN endpoint** `nwrks-cdn.azurefd.net`
9. **Wires origin** → `nwrksassets.blob.core.windows.net`
10. **Creates catch-all route** `/*` with HTTPS redirect enabled

---

## After deployment

| What | URL pattern |
|---|---|
| Static image | `https://nwrks-cdn.azurefd.net/static/cardboard.png` |
| Blog index | `https://nwrks-cdn.azurefd.net/static/blog/index.md` |
| Favicon | `https://nwrks-cdn.azurefd.net/static/favicon.ico` |

> **Note:** Front Door global propagation takes **5–10 minutes** after first deploy.

---

## Re-uploading assets

The script is idempotent — re-running it will overwrite existing blobs and skip already-existing Azure resources without errors.

---

## Connecting to the Blazor app

Update `appsettings` or a constant in the Blazor project to point asset URLs at the CDN:

```
https://nwrks-cdn.azurefd.net/static/
```
