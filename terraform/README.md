# Terraform — NukaWorks infra

Describes the Azure resources currently live for this project:

- **`Default` resource group**: storage account `nwrks` (`static` container, public blob read) +
  Front Door Standard profile `nwrks-cdn` with two routes:
  - `default-route` → blob storage, custom domain `nwrks-cdn.public.prod.nuka.works`
  - `blog-route` → the Static Web App hosting `Web/` (Blazor WASM), custom domain `blog.nuka.works`
- **`blog-api_group` resource group**: Linux App Service `blog-api` (ASP.NET Core `Server/`), currently on the **F1 Free** plan.

## Not managed here

- **DNS** — `nuka.works` is on Cloudflare (`hank.ns.cloudflare.com` / `meadow.ns.cloudflare.com`), DNS-only
  (grey-clouded) for the Front Door hostnames. Required records, already in place:
  - `nwrks-cdn.public.prod.nuka.works` → CNAME → `nwrks-cdn-ebfnb4hdfdc3bag9.z02.azurefd.net`
  - `blog.nuka.works` → CNAME → `nwrks-cdn-ebfnb4hdfdc3bag9.z02.azurefd.net`
  - `_dnsauth.<host>` TXT records for Front Door domain ownership validation (token per domain,
    see `azurerm_cdn_frontdoor_custom_domain.*` validation output after apply)
- **The Static Web App itself** (`orange-sky-0311fd600`) — deployed via
  `.github/workflows/azure-static-web-apps-orange-sky-0311fd600.yml`, not provisioned here.
- **App Service secrets** (`BlobStorage__AccountKey`, `GitHub__ClientSecret`, etc.) — injected by
  `.github/workflows/deploy-server.yml` via `az webapp config appsettings set`; `app_settings` is
  excluded from Terraform's plan via `lifecycle.ignore_changes`.

## Getting started

```bash
cd terraform
terraform init
```

Set the subscription either via `-var subscription_id=...` or the `ARM_SUBSCRIPTION_ID` env var.

## Importing the existing resources

Nothing has been created by Terraform yet — these resources already exist in Azure. Run
`terraform plan` first; it will show every resource as "to be created." Before applying, import
each one so Terraform adopts the real infra instead of trying to create duplicates:

```bash
terraform import azurerm_resource_group.assets /subscriptions/<sub>/resourceGroups/Default
terraform import azurerm_storage_account.assets /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Storage/storageAccounts/nwrks
terraform import azurerm_storage_container.static https://nwrks.blob.core.windows.net/static

terraform import azurerm_cdn_frontdoor_profile.this /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn
terraform import azurerm_cdn_frontdoor_endpoint.this /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/afdEndpoints/nwrks-cdn
terraform import azurerm_cdn_frontdoor_custom_domain.cdn /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/customDomains/nwrks-cdn-public-prod
terraform import azurerm_cdn_frontdoor_custom_domain.site /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/customDomains/blog-nuka-works
terraform import azurerm_cdn_frontdoor_origin_group.assets /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/originGroups/default-origin-group-56eb63dc
terraform import azurerm_cdn_frontdoor_origin_group.site /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/originGroups/blog-origin-group
terraform import azurerm_cdn_frontdoor_origin.assets /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/originGroups/default-origin-group-56eb63dc/origins/default-origin
terraform import azurerm_cdn_frontdoor_origin.site /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/originGroups/blog-origin-group/origins/blog-static-webapp
terraform import azurerm_cdn_frontdoor_route.assets /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/afdEndpoints/nwrks-cdn/routes/default-route
terraform import azurerm_cdn_frontdoor_route.site /subscriptions/<sub>/resourceGroups/Default/providers/Microsoft.Cdn/profiles/nwrks-cdn/afdEndpoints/nwrks-cdn/routes/blog-route

terraform import azurerm_resource_group.api /subscriptions/<sub>/resourceGroups/blog-api_group
terraform import azurerm_service_plan.api /subscriptions/<sub>/resourceGroups/blog-api_group/providers/Microsoft.Web/serverfarms/ASP-blogapigroup-b00d
terraform import azurerm_linux_web_app.api /subscriptions/<sub>/resourceGroups/blog-api_group/providers/Microsoft.Web/sites/blog-api
```

Then run `terraform plan` again — it should come back clean (or close to it; a few computed/
default fields may show drift on first plan, which is normal after import).

## Known perf-relevant knob

`api_app_service_plan_sku` defaults to `"F1"` to match what's live today. F1 (Free) cannot enable
`always_on`, so the API cold-starts after ~20 minutes of inactivity. Set it to `"B1"` (~$13/mo) and
apply to remove that cold start — `always_on` flips on automatically in `appservice.tf` for any
non-F1 SKU.
