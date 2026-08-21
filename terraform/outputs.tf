output "load_balancer_ip" {
  description = "Point hisuiki.com's A record here. The api and cdn hosts are CNAMEs to the apex, so this one record serves all three. Managed certificates stay PROVISIONING until it resolves."
  value       = google_compute_global_address.this.address
}

output "site_url" {
  description = "Public URL of the frontend."
  value       = "https://${var.site_domain}"
}

output "api_url" {
  description = "Public base URL of the API. This is VITE_API_BASE_URL for the frontend build."
  value       = "https://${var.api_domain}"
}

output "cdn_asset_base_url" {
  description = "Public CDN base URL for static assets — matches CDN_BASE_URL / VITE_ASSET_BASE_URL."
  value       = "https://${var.cdn_domain}/${var.assets_prefix}"
}

output "oauth_callback_urls" {
  description = "Register these with the GitHub and Google OAuth clients before anyone tries to sign in."
  value = {
    github = "https://${var.api_domain}/api/auth/callback/github"
    google = "https://${var.api_domain}/api/auth/callback/google"
  }
}

output "web_service_url" {
  description = "Direct Cloud Run URL for the frontend; browsers use site_url."
  value       = google_cloud_run_v2_service.web.uri
}

output "api_service_url" {
  description = "Direct Cloud Run URL for the API; browsers use api_url."
  value       = google_cloud_run_v2_service.api.uri
}

output "database_instance_connection_name" {
  description = "PROJECT:REGION:INSTANCE — the socket path Cloud Run mounts, and what `cloud-sql-proxy` takes to run migrations from a workstation."
  value       = google_sql_database_instance.main.connection_name
}

output "assets_bucket" {
  description = "Bucket holding the site's markdown and images."
  value       = google_storage_bucket.assets.name
}

output "artifact_registry_repository" {
  description = "Docker repository the application images are pushed to."
  value       = "${google_artifact_registry_repository.containers.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.containers.repository_id}"
}

output "workload_identity_provider" {
  description = "Set as the GCP_WORKLOAD_IDENTITY_PROVIDER repository secret for the deploy workflow."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "deployer_service_account" {
  description = "Set as the GCP_DEPLOY_SERVICE_ACCOUNT repository secret for the deploy workflow."
  value       = google_service_account.deployer.email
}

output "wildcard_dns_authorization_record" {
  description = "Add this TXT record before the wildcard certificate can be issued. It stays in place for as long as the certificate is renewed."
  value = {
    name = google_certificate_manager_dns_authorization.hisuiki.dns_resource_record[0].name
    type = google_certificate_manager_dns_authorization.hisuiki.dns_resource_record[0].type
    data = google_certificate_manager_dns_authorization.hisuiki.dns_resource_record[0].data
  }
}
