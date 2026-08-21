# Remote state, so the infra isn't hostage to one laptop's working directory.
#
# This bucket is deliberately NOT a resource in this configuration: Terraform can't hold the state
# describing the bucket that holds its own state. It was created once, out of band:
#
#   gcloud storage buckets create gs://hisuiki-tfstate-prod --location=US --uniform-bucket-level-access
#   gcloud storage buckets update gs://hisuiki-tfstate-prod --versioning
#
# Versioning is on so a corrupted or truncated state push can be rolled back to the prior object
# generation rather than reconstructed by hand from the live project.
#
# The retired NukaWorks Prod stack's final state is archived in this bucket under
# archive/nukaworks-prod/. It describes resources in a different project and is kept for reference
# only — never point a backend at it.

terraform {
  backend "gcs" {
    bucket = "hisuiki-tfstate-prod"
    prefix = "site"
  }
}
