# The Express/TypeScript API (server/), replacing the Linux App Service the old ASP.NET Core
# service ran on.
#
# The GitHub OAuth client secret lives in Secret Manager and is mounted as an environment variable
# at runtime, so — unlike the App Service setup, where the deploy workflow pushed the secret in as
# a plain app setting on every release — the value never passes through CI.

resource "google_service_account" "api" {
  account_id   = "blog-api"
  display_name = "Server API (Cloud Run)"
}

# Read/write, not read-only: proposals are applied to content objects by the patch workflow, and
# the API itself reads every page it renders.
resource "google_storage_bucket_iam_member" "api_assets" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret" "github_client_secret" {
  secret_id = "github-oauth-client-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "api_github_client_secret" {
  secret_id = google_secret_manager_secret.github_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_cloud_run_v2_service" "api" {
  name     = var.api_service_name
  location = var.region

  deletion_protection = false
  ingress             = "INGRESS_TRAFFIC_ALL"

  template {
    service_account = google_service_account.api.email

    scaling {
      min_instance_count = var.api_min_instances
      max_instance_count = 4
    }

    containers {
      image = var.api_image

      # Plain names, read directly by server/src/config.ts. These replaced the ASP.NET
      # "Section__Key" variables the C# service used — that spelling is a .NET configuration-binder
      # convention and carries no meaning in Node.
      env {
        name  = "GCS_BUCKET"
        value = google_storage_bucket.assets.name
      }

      env {
        name  = "GCS_PREFIX"
        value = var.assets_prefix
      }

      env {
        name  = "CDN_BASE_URL"
        value = "https://${var.cdn_custom_domain_host}"
      }

      # Doubles as the OAuth returnUrl allow-list, so the login flow can't be used as an open
      # redirect that leaks a session id.
      env {
        name  = "CORS_ALLOWED_ORIGINS"
        value = "https://${var.site_custom_domain_host}"
      }

      env {
        name  = "GITHUB_CLIENT_ID"
        value = var.github_client_id
      }

      env {
        name = "GITHUB_CLIENT_SECRET"
        value_source {
          secret_key_ref {
            secret  = google_secret_manager_secret.github_client_secret.secret_id
            version = "latest"
          }
        }
      }

      resources {
        limits = {
          cpu    = "1"
          memory = "512Mi"
        }
      }
    }
  }

  lifecycle {
    # deploy-api.yml owns the deployed image; Terraform owns everything else about the service.
    # Without this, every `terraform apply` would roll the service back to var.api_image and undo
    # the most recent deploy.
    ignore_changes = [
      template[0].containers[0].image,
      client,
      client_version,
    ]
  }
}

# The API is a public read/propose endpoint — the browser calls it directly, unauthenticated.
# Authorization is the app's own GitHub session check, not IAM.
resource "google_cloud_run_v2_service_iam_member" "public" {
  name     = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
