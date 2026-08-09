# Server API — Linux App Service running the ASP.NET Core backend.
#
# NOTE: app_settings (BlobStorage__AccountKey, GitHub__ClientSecret, etc.) are injected by the
# deploy-server.yml GitHub Actions workflow via `az webapp config appsettings set`, not by
# Terraform. app_settings is ignored below so Terraform doesn't fight that pipeline.
#
# api_app_service_plan_sku defaults to "F1" (Free), matching the current deployment. Free tier
# has no "Always On" support, so the app unloads after ~20min idle and cold-starts on the next
# request — this is the primary cause of API-side slowness. Bump to "B1" (Basic, ~$13/mo) to
# enable always_on and remove cold starts.

resource "azurerm_resource_group" "api" {
  name     = var.api_resource_group_name
  location = "Canada Central"
}

resource "azurerm_service_plan" "api" {
  name                = "ASP-blogapigroup-b00d" # portal-generated name; import must match
  resource_group_name = azurerm_resource_group.api.name
  location             = azurerm_resource_group.api.location
  os_type              = "Linux"
  sku_name             = var.api_app_service_plan_sku
}

resource "azurerm_linux_web_app" "api" {
  name                = var.api_app_name
  resource_group_name = azurerm_resource_group.api.name
  location             = azurerm_service_plan.api.location
  service_plan_id      = azurerm_service_plan.api.id

  https_only = true

  site_config {
    always_on = var.api_app_service_plan_sku != "F1" # Free tier can't enable Always On
    application_stack {
      dotnet_version = "10.0"
    }
  }

  lifecycle {
    ignore_changes = [app_settings]
  }
}
