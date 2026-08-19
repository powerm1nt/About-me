# The shared bucket behind the assets CDN holds public markdown and images for both sites. The blog
# frontend is part of its Cloud Run image, so no separate build-output bucket is needed.

resource "google_storage_bucket" "assets" {
  name     = var.assets_bucket_name
  location = var.bucket_location

  # Required for the allUsers IAM binding below; ACLs can't express public-read under uniform access.
  uniform_bucket_level_access = true

  # Content is authored through merged GitHub proposals, and every revision is reconstructable
  # from the repo's patches/ folder — versioning here would only duplicate that history.
  versioning {
    enabled = false
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
