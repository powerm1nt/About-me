# Azure Front Door (Standard) fronting two origins on the same profile/endpoint:
#   - default-route      -> blob storage (static assets), custom domain nwrks-cdn.public.prod.nuka.works
#   - blog-route          -> Static Web App (Blazor WASM frontend), custom domain blog.nuka.works
#
# Neither route is linked to the bare *.azurefd.net default domain (link_to_default_domain = false) —
# only the custom domains resolve. Requests to the bare azurefd.net hostname will 404 by design.

resource "azurerm_cdn_frontdoor_profile" "this" {
  name                = var.front_door_profile_name
  resource_group_name = azurerm_resource_group.assets.name
  sku_name            = "Standard_AzureFrontDoor"
}

resource "azurerm_cdn_frontdoor_endpoint" "this" {
  name                     = var.front_door_endpoint_name
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
}

# --- Custom domains --------------------------------------------------------

resource "azurerm_cdn_frontdoor_custom_domain" "cdn" {
  name                     = "nwrks-cdn-public-prod"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  host_name                = var.cdn_custom_domain_host

  tls {
    certificate_type    = "ManagedCertificate"
    minimum_tls_version = "TLS12"
  }
}

resource "azurerm_cdn_frontdoor_custom_domain" "site" {
  name                     = "blog-nuka-works"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  host_name                = var.site_custom_domain_host

  tls {
    certificate_type    = "ManagedCertificate"
    minimum_tls_version = "TLS12"
  }
}

# --- Static assets: blob storage origin ------------------------------------

resource "azurerm_cdn_frontdoor_origin_group" "assets" {
  name                     = "default-origin-group-56eb63dc" # portal-generated name; import must match
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  health_probe {
    interval_in_seconds = 100
    path                = "/"
    protocol            = "Http"
    request_type        = "HEAD"
  }

  load_balancing {
    additional_latency_in_milliseconds = 50
    sample_size                        = 4
    successful_samples_required        = 3
  }
}

resource "azurerm_cdn_frontdoor_origin" "assets" {
  name                          = "default-origin"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.assets.id

  host_name                      = azurerm_storage_account.assets.primary_blob_host
  origin_host_header              = azurerm_storage_account.assets.primary_blob_host
  http_port                       = 80
  https_port                      = 443
  priority                        = 1
  weight                          = 1000
  enabled                         = true
  certificate_name_check_enabled  = true
}

resource "azurerm_cdn_frontdoor_route" "assets" {
  name                          = "default-route"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.assets.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.assets.id]

  supported_protocols    = ["Http", "Https"]
  patterns_to_match       = ["/*"]
  forwarding_protocol     = "MatchRequest"
  https_redirect_enabled  = true
  link_to_default_domain  = false

  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.cdn.id]
}

# --- Frontend: Static Web App origin ----------------------------------------

resource "azurerm_cdn_frontdoor_origin_group" "site" {
  name                     = "blog-origin-group"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  health_probe {
    interval_in_seconds = 60
    path                = "/"
    protocol            = "Https"
    request_type        = "GET"
  }

  load_balancing {
    additional_latency_in_milliseconds = 50
    sample_size                        = 4
    successful_samples_required        = 3
  }
}

resource "azurerm_cdn_frontdoor_origin" "site" {
  name                          = "blog-static-webapp"
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.site.id

  host_name                      = var.static_web_app_hostname
  origin_host_header              = var.static_web_app_hostname
  http_port                       = 80
  https_port                      = 443
  priority                        = 1
  weight                          = 1000
  enabled                         = true
  certificate_name_check_enabled  = true
}

resource "azurerm_cdn_frontdoor_route" "site" {
  name                          = "blog-route"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.site.id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.site.id]

  supported_protocols    = ["Http", "Https"]
  patterns_to_match       = ["/*"]
  forwarding_protocol     = "HttpsOnly"
  https_redirect_enabled  = true
  link_to_default_domain  = false

  cdn_frontdoor_custom_domain_ids = [azurerm_cdn_frontdoor_custom_domain.site.id]
}
