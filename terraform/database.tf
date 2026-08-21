# Postgres behind better-auth: accounts, sessions, and provider links.
#
# Deliberately lightweight. There is no VPC, no private services access peering, and no serverless
# connector — Cloud Run reaches the instance through the Cloud SQL *connector*, which authenticates
# with IAM and speaks TLS over Google's internal network to a unix socket inside the container.
# The instance has a public IP because the connector requires one, but with an empty authorized-
# networks list nothing on the internet can open a connection to it: reachability is granted by
# roles/cloudsql.client, not by an IP range.
#
# The alternative — private IP on a dedicated VPC — buys little here and costs a peering range, a
# network, and a much slower first apply.

resource "google_sql_database_instance" "main" {
  name             = var.db_instance_name
  database_version = "POSTGRES_17"
  region           = var.region

  # This holds the only copy of every account. Deleting it by accident is not recoverable, so unlike
  # the Cloud Run services it keeps Terraform's guard on.
  deletion_protection = true

  depends_on = [google_project_service.required]

  settings {
    tier              = var.db_tier
    availability_type = "ZONAL"
    disk_size         = 10
    disk_type         = "PD_HDD"
    disk_autoresize   = true

    # Cheap insurance on the one dataset that cannot be rebuilt from the bucket or the repo.
    backup_configuration {
      enabled                        = true
      start_time                     = "03:00"
      point_in_time_recovery_enabled = false
    }

    ip_configuration {
      ipv4_enabled = true
      # No authorized networks at all. The only way in is the connector, holding cloudsql.client.
      ssl_mode = "ENCRYPTED_ONLY"
    }

    database_flags {
      # better-auth stores timestamps in UTC and compares them there.
      name  = "timezone"
      value = "UTC"
    }

    insights_config {
      query_insights_enabled = true
    }
  }
}

resource "google_sql_database" "app" {
  name     = var.db_name
  instance = google_sql_database_instance.main.name
}

# Generated here rather than chosen by a human: the value goes straight into Secret Manager and
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

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "database_url" {
  secret = google_secret_manager_secret.database_url.id

  # The unix socket, not a host and port: the connector mounts the instance at
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

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret_version" "better_auth_secret" {
  secret      = google_secret_manager_secret.better_auth_secret.id
  secret_data = random_password.better_auth_secret.result
}

# Created empty: OAuth client secrets come from the GitHub and Google consoles and are added with
#   gcloud secrets versions add <id> --data-file=-
# Terraform owning a version would mean the secret passing through a tfvars file and the state in
# plain text, which is exactly what Secret Manager exists to avoid.
resource "google_secret_manager_secret" "github_client_secret" {
  secret_id = "github-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}

resource "google_secret_manager_secret" "google_client_secret" {
  secret_id = "google-oauth-client-secret"

  replication {
    auto {}
  }

  depends_on = [google_project_service.required]
}
