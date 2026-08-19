output "load_balancer_ip" {
  description = "Point all custom domains' A records here. Managed certificates stay PROVISIONING until they resolve to this address."
  value       = google_compute_global_address.this.address
}

output "cdn_asset_base_url" {
  description = "Public CDN base URL for static assets — matches BlobStorage:CdnBaseUrl / VITE_ASSET_BASE_URL."
  value       = "https://${var.cdn_custom_domain_host}/${var.assets_prefix}"
}

output "company_cdn_asset_base_url" {
  description = "Public CDN base URL reserved for NukaWorks company assets."
  value       = "https://${var.cdn_custom_domain_host}/${var.shared_assets_prefix}"
}

output "site_url" {
  description = "Public URL of the blog frontend."
  value       = "https://${var.site_custom_domain_host}"
}

output "company_site_url" {
  description = "Public URL of the NukaWorks company frontend."
  value       = "https://${var.company_site_custom_domain_host}"
}

output "api_url" {
  description = "Public same-origin base URL of the blog API, served through Cloud CDN."
  value       = "https://${var.site_custom_domain_host}/api"
}

output "blog_service_url" {
  description = "Direct Cloud Run URL for diagnostics; browsers use site_url and /api."
  value       = google_cloud_run_v2_service.api.uri
}

output "company_service_url" {
  description = "IAP-protected Cloud Run URL for the NukaWorks company website and API."
  value       = google_cloud_run_v2_service.company_site.uri
}

output "assets_bucket" {
  description = "Bucket holding the site's markdown and images."
  value       = google_storage_bucket.assets.name
}

output "web_bucket" {
  description = "Bucket serving the built frontend."
  value       = google_storage_bucket.web.name
}

output "workload_identity_provider" {
  description = "Set as the GCP_WORKLOAD_IDENTITY_PROVIDER repository secret for the deploy workflows."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Set as the GCP_DEPLOY_SERVICE_ACCOUNT repository secret for the deploy workflows."
  value       = google_service_account.deployer.email
}

output "artifact_registry_repository" {
  description = "Docker repository the API image is pushed to."
  value       = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}
