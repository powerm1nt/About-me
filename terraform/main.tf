# Resource group + blob storage backing the "static" asset container served through Front Door.

resource "azurerm_resource_group" "assets" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_storage_account" "assets" {
  name                = var.storage_account_name
  resource_group_name = azurerm_resource_group.assets.name
  location            = azurerm_resource_group.assets.location

  account_tier             = "Standard"
  account_replication_type = "LRS"
  account_kind             = "StorageV2"

  # Required for the Front Door origin to read blobs anonymously.
  allow_nested_items_to_be_public = true
  https_traffic_only_enabled      = true
  min_tls_version                 = "TLS1_2"
}

resource "azurerm_storage_container" "static" {
  name                  = var.storage_container_name
  storage_account_id    = azurerm_storage_account.assets.id
  container_access_type = "blob"
}
