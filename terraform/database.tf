# Postgres behind better-auth, and the secrets the API needs to use it.
#
# Accounts, sessions, and provider links live here. Page markdown and photo images stay in the
# assets bucket: the database holds identity and, in time, the metadata that points at those
# objects — never the objects themselves.

resource "google_project_service" "sqladmin" {
  project            = var.project_id
  service            = "sqladmin.googleapis.com"
  disable_on_destroy = false
}

resource "google_sql_database_instance" "main" {
  name             = var.db_instance_name
  database_version = "POSTGRES_17"
  region           = var.region

  # This holds the only copy of every account. Deleting it by accident is not a recoverable mistake,
  # so unlike the Cloud Run services it keeps Terraform's guard on.
  deletion_protection = true

  depends_on = [google_project_service.sqladmin]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_SSD"
    disk_autoresize   = true

    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = true
    }

    ip_configuration {
      # No public IP. Cloud Run reaches the instance over its unix socket through the Cloud SQL
      # connector, so there is nothing listening on the internet to be scanned or brute-forced.
      ipv4_enabled = false
      # The connector needs an authorised network path; private services access supplies it.
      private_network = google_compute_network.database.id
    }

    database_flags {
      # better-auth stores timestamps in UTC and compares them there.
      name  = "timezone"
      value = "UTC"
    }
  }
}

# A dedicated network for the instance's private IP. The default network is deliberately not used:
# a database should not be reachable from whatever else happens to be created in this project.
resource "google_compute_network" "database" {
  name                    = "${var.db_instance_name}-net"
  auto_create_subnetworks = false
}

resource "google_compute_global_address" "database_private_ip" {
  name          = "${var.db_instance_name}-private-ip"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.database.id
}

resource "google_service_networking_connection" "database" {
  network                 = google_compute_network.database.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.database_private_ip.name]
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

# Generated here rather than chosen by a human: the value is written straight into Secret Manager and
# never needs to be known by anyone. Rotating it means tainting this resource.
resource "random_password" "db" {
  length  = 32
  special = false
}

resource "google_sql_user" "app" {
  name     = var.db_user
  instance = google_sql_database_instance.main.name
  password = random_password.db.result
}

# ── Secrets ───────────────────────────────────────────────────────────────────────────────────
# The API reads DATABASE_URL as one string, so the assembled URL is the secret rather than the
# password alone. That also keeps the socket path out of the Cloud Run environment, where it would
# otherwise have to be templated alongside a separate password reference.

resource "google_secret_manager_secret" "database_url" {
  secret_id = "database-url"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id

  # The unix socket, not a host and port: on Cloud Run the connector mounts the instance at
  # /cloudsql/<connection name> and pg connects through it.
  secret_data = format(
    "postgresql://%s:%s@localhost/%s?host=/cloudsql/%s",
    google_sql_user.app.name,
    urlencode(random_password.db.result),
    google_sql_database.app.name,
    google_sql_database_instance.main.connection_name,
  )
}

# Signs session cookies. Rotating it signs everyone out, which is the intended blast radius.
resource "random_password" "better_auth_secret" {
  length  = 48
  special = false
}

resource "google_secret_manager_secret" "better_auth_secret" {
  secret_id = "better-auth-secret"

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_version" "better_auth_secret" {
  secret      = google_secret_manager_secret.better_auth_secret.id
  secret_data = random_password.better_auth_secret.result
}

# Created empty: the value comes from the Google Cloud console when the OAuth client is registered,
# and is added with `gcloud secrets versions add google-oauth-client-secret --data-file=-`. Terraform
# owning a version here would mean the secret passing through a tfvars file or the state in plain
# text, which is exactly what Secret Manager exists to avoid.
resource "google_secret_manager_secret" "google_client_secret" {
  secret_id = "google-oauth-client-secret"

  replication {
    auto {}
  }
}

# ── Access ────────────────────────────────────────────────────────────────────────────────────

resource "google_project_iam_member" "api_cloudsql_client" {
  project = var.project_id
  role    = "roles/cloudsql.client"
  member  = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_database_url" {
  secret_id = google_secret_manager_secret.database_url.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_better_auth_secret" {
  secret_id = google_secret_manager_secret.better_auth_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}

resource "google_secret_manager_secret_iam_member" "api_google_client_secret" {
  secret_id = google_secret_manager_secret.google_client_secret.id
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:${google_service_account.api.email}"
}
