# The shared bucket behind the assets CDN holds public markdown and images for both sites. The blog
# frontend is part of its Cloud Run image, so no separate build-output bucket is needed.

resource "google_storage_bucket" "assets" {
  name     = var.assets_bucket_name
  location = var.bucket_location

  # Required for the allUsers IAM binding below; ACLs can't express public-read under uniform access.
  uniform_bucket_level_access = true

  # Page history reads object generations directly: the editor saves markdown here with the author
  # and message in custom metadata, and the history view diffs one generation against the previous
  # one. This replaced reconstructing history from the repository's patches/ folder.
  versioning {
    enabled = true
  }

  # Without this every superseded generation is kept and paid for forever. Ninety days of history is
  # far more than the page history UI shows, and non-current versions only exist after an edit.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 90
    }

    action {
      type = "Delete"
    }
  }

  # A page edited repeatedly in one session would otherwise leave a generation per save.
  lifecycle_rule {
    condition {
      num_newer_versions = 50
    }

    action {
      type = "Delete"
    }
  }

  cors {
    origin = [
      "https://${var.site_custom_domain_host}",
      "https://${var.company_site_custom_domain_host}",
    ]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# legacyObjectReader, not objectViewer: the latter carries storage.objects.list, which let anyone
# GET the bucket root for an index of every object. Serving only needs storage.objects.get.
resource "google_storage_bucket_iam_member" "assets_public" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

# GCS has object prefixes rather than real directories. Keeping one marker object makes the
# company-owned shared_assets/ namespace explicit and visible to storage tooling before content is
# uploaded there.
resource "google_storage_bucket_object" "shared_assets_prefix" {
  bucket        = google_storage_bucket.assets.name
  name          = "${var.shared_assets_prefix}/.keep"
  content       = "NukaWorks company shared assets\n"
  content_type  = "text/plain"
  cache_control = "no-cache, max-age=0"
}
