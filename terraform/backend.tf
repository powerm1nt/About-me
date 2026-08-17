# Remote state, so the infra isn't hostage to one laptop's working directory.
#
# This bucket is deliberately NOT a resource in this configuration: Terraform can't hold the state
# describing the bucket that holds its own state. It was created once, out of band:
#
#   gcloud storage buckets create gs://nwrks-tfstate-prod --location=US --uniform-bucket-level-access
#   gcloud storage buckets update gs://nwrks-tfstate-prod --versioning
#
# Versioning is on so a corrupted or truncated state push can be rolled back to the prior object
# generation rather than reconstructed by hand from the live project.

terraform {
  backend "gcs" {
    bucket = "nwrks-tfstate-prod"
    prefix = "site"
  }
}
