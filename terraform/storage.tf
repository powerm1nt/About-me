# The bucket behind the assets CDN: published markdown and every image the site serves.
#
# It already exists — the content was copied here from the retired NukaWorks Prod project before
# this stack was written — so it is adopted by the import block below rather than created.

import {
  to = google_storage_bucket.assets
  id = "hisuiki-assets-prod"
}

resource "google_storage_bucket" "assets" {
  name     = var.assets_bucket_name
  location = var.bucket_location

  # Required for the allUsers IAM binding below; ACLs can't express public-read under uniform access.
  uniform_bucket_level_access = true

  # Page history reads object generations directly: the editor saves markdown here with the author
  # and message in custom metadata, and the history view diffs one generation against the previous
  # one. Turning this off silently empties that feature.
  versioning {
    enabled = true
  }

  # Without these, every superseded generation is kept and paid for forever.
  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 90
    }

    action {
      type = "Delete"
    }
  }

  # A page edited repeatedly in one sitting would otherwise leave a generation per save.
  lifecycle_rule {
    condition {
      num_newer_versions = 50
    }

    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["https://${var.site_domain}", "https://${var.api_domain}"]
    method          = ["GET", "HEAD"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

# legacyObjectReader, not objectViewer: the latter carries storage.objects.list, which would let
# anyone GET the bucket root for an index of every object. Serving only needs storage.objects.get.
resource "google_storage_bucket_iam_member" "assets_public" {
  bucket = google_storage_bucket.assets.name
  role   = "roles/storage.legacyObjectReader"
  member = "allUsers"
}

resource "google_storage_bucket" "data" {
  name     = "hisuiki-data-prod"
  location = var.bucket_location

  uniform_bucket_level_access = true

  versioning {
    enabled = true
  }

  lifecycle_rule {
    condition {
      days_since_noncurrent_time = 90
    }
    action {
      type = "Delete"
    }
  }

  lifecycle_rule {
    condition {
      num_newer_versions = 50
    }
    action {
      type = "Delete"
    }
  }

  cors {
    origin          = ["https://${var.site_domain}", "https://${var.api_domain}"]
    method          = ["GET", "HEAD", "PUT"]
    response_header = ["Content-Type"]
    max_age_seconds = 3600
  }
}

resource "google_storage_bucket_iam_member" "api_data" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.api.email}"
}

resource "google_storage_bucket_iam_member" "api_data_bucket" {
  bucket = google_storage_bucket.data.name
  role   = "roles/storage.legacyBucketReader"
  member = "serviceAccount:${google_service_account.api.email}"
}
