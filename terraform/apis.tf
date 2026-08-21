# Services this stack needs. Enabled through Terraform rather than by hand so a fresh clone of the
# project reaches the same state, and left enabled on destroy — disabling an API is project-wide and
# would break anything else that happens to be using it.

locals {
  required_services = [
    "artifactregistry.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudresourcemanager.googleapis.com",
    "compute.googleapis.com",
    "iamcredentials.googleapis.com",
    "run.googleapis.com",
    "secretmanager.googleapis.com",
    "sqladmin.googleapis.com",
  ]
}

resource "google_project_service" "required" {
  for_each = toset(local.required_services)

  project            = var.project_id
  service            = each.value
  disable_on_destroy = false
}
