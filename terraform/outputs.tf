output "front_door_default_hostname" {
  description = "Bare *.azurefd.net hostname. Not routable — no route links to it (link_to_default_domain = false)."
  value       = azurerm_cdn_frontdoor_endpoint.this.host_name
}

output "cdn_asset_base_url" {
  description = "Public CDN base URL for static assets — matches BlobStorage:CdnBaseUrl / AssetBaseUrl in appsettings."
  value       = "https://${var.cdn_custom_domain_host}/${var.storage_container_name}"
}

output "site_url" {
  description = "Public URL of the Blazor WASM frontend."
  value       = "https://${var.site_custom_domain_host}"
}

output "api_default_hostname" {
  description = "Default azurewebsites.net hostname of the Server API."
  value       = azurerm_linux_web_app.api.default_hostname
}

output "storage_account_primary_blob_host" {
  value = azurerm_storage_account.assets.primary_blob_host
}
