output "load_balancer_ip" {
  description = "Point both custom domains' A records here. The managed certificate stays PROVISIONING until they resolve to this address."
  value       = google_compute_global_address.this.address
}

output "cdn_asset_base_url" {
  description = "Public CDN base URL for static assets — matches BlobStorage:CdnBaseUrl / VITE_ASSET_BASE_URL."
  value       = "https://${var.cdn_custom_domain_host}/${var.assets_prefix}"
}

output "site_url" {
  description = "Public URL of the React frontend."
  value       = "https://${var.site_custom_domain_host}"
}

output "api_url" {
  description = "Cloud Run URL of the Server API — this is VITE_API_BASE_URL for the frontend build."
  value       = google_cloud_run_v2_service.api.uri
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
