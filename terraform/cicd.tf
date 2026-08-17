# Workload Identity Federation for GitHub Actions — the GCP counterpart of the Azure OIDC login
# the deploy workflows used. No service-account key is ever created or stored as a repo secret:
# Actions exchanges its own OIDC token for a short-lived GCP credential, and only for this repo.

resource "google_service_account" "deployer" {
  account_id   = "github-deployer"
  display_name = "GitHub Actions deployer"
}

resource "google_iam_workload_identity_pool" "github" {
  workload_identity_pool_id = "github-pool"
  display_name              = "GitHub Actions"
}

resource "google_iam_workload_identity_pool_provider" "github" {
  workload_identity_pool_id          = google_iam_workload_identity_pool.github.workload_identity_pool_id
  workload_identity_pool_provider_id = "github-provider"

  attribute_mapping = {
    "google.subject"       = "assertion.sub"
    "attribute.repository" = "assertion.repository"
  }

  # Without this, *any* GitHub repository's OIDC token would be accepted by the provider.
  attribute_condition = "assertion.repository == '${var.github_repository}'"

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account_iam_member" "github_impersonation" {
  service_account_id = google_service_account.deployer.name
  role               = "roles/iam.workloadIdentityUser"
  member             = "principalSet://iam.googleapis.com/${google_iam_workload_identity_pool.github.name}/attribute.repository/${var.github_repository}"
}

# --- What CI is allowed to do ----------------------------------------------

# Upload the built frontend, and apply merged content patches to the assets bucket.
resource "google_storage_bucket_iam_member" "deployer_web" {
  bucket = google_storage_bucket.web.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_storage_bucket_iam_member" "deployer_assets" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.deployer.email}"
}

# Push API images and deploy new Cloud Run revisions.
resource "google_artifact_registry_repository" "containers" {
  location      = var.region
  repository_id = "containers"
  format        = "DOCKER"
}

resource "google_artifact_registry_repository_iam_member" "deployer_push" {
  location   = google_artifact_registry_repository.containers.location
  repository = google_artifact_registry_repository.containers.name
  role       = "roles/artifactregistry.writer"
  member     = "serviceAccount:${google_service_account.deployer.email}"
}

resource "google_cloud_run_v2_service_iam_member" "deployer_admin" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.admin"
  member   = "serviceAccount:${google_service_account.deployer.email}"
}

# Deploying a revision means setting the service's runtime identity, which IAM treats as acting
# as that service account.
resource "google_service_account_iam_member" "deployer_acts_as_api" {
  service_account_id = google_service_account.api.name
  role               = "roles/iam.serviceAccountUser"
  member             = "serviceAccount:${google_service_account.deployer.email}"
}

# Invalidate the CDN after a frontend deploy or a content patch.
resource "google_project_iam_member" "deployer_cdn" {
  project = var.project_id
  role    = "roles/compute.loadBalancerAdmin"
  member  = "serviceAccount:${google_service_account.deployer.email}"
}
