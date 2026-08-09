variable "subscription_id" {
  description = "Azure subscription ID. Can also be supplied via ARM_SUBSCRIPTION_ID."
  type        = string
  default     = null
}

variable "location" {
  description = "Region for the storage/Front Door resource group."
  type        = string
  default     = "japaneast"
}

variable "resource_group_name" {
  description = "Resource group holding storage + Front Door (matches the existing 'Default' RG)."
  type        = string
  default     = "Default"
}

variable "storage_account_name" {
  description = "Globally-unique blob storage account name serving static assets."
  type        = string
  default     = "nwrks"
}

variable "storage_container_name" {
  description = "Blob container name holding public static assets."
  type        = string
  default     = "static"
}

variable "front_door_profile_name" {
  description = "Azure Front Door (Standard) profile name."
  type        = string
  default     = "nwrks-cdn"
}

variable "front_door_endpoint_name" {
  description = "Front Door endpoint name (hostname prefix on *.azurefd.net)."
  type        = string
  default     = "nwrks-cdn"
}

variable "cdn_custom_domain_host" {
  description = "Custom domain that serves static assets through the CDN."
  type        = string
  default     = "nwrks-cdn.public.prod.nuka.works"
}

variable "site_custom_domain_host" {
  description = "Custom domain that serves the Blazor WASM frontend (Static Web App origin)."
  type        = string
  default     = "blog.nuka.works"
}

variable "static_web_app_hostname" {
  description = "Default hostname of the Azure Static Web App hosting the Web frontend."
  type        = string
  default     = "orange-sky-0311fd600.7.azurestaticapps.net"
}

variable "api_resource_group_name" {
  description = "Resource group holding the Server API App Service."
  type        = string
  default     = "blog-api_group"
}

variable "api_app_name" {
  description = "App Service name for the Server API."
  type        = string
  default     = "blog-api"
}

variable "api_app_service_plan_sku" {
  description = "App Service Plan SKU for the API. F1 (free) has no Always On, so the API cold-starts after ~20min idle; B1 removes that at a small monthly cost."
  type        = string
  default     = "F1"
}
