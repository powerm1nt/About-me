variable "project_id" {
  description = "Google Cloud project ID hosting the whole site."
  type        = string
}

variable "region" {
  description = "Region for Cloud Run and other regional resources."
  type        = string
  default     = "northamerica-northeast1"
}

variable "bucket_location" {
  description = "Location for the GCS buckets. Multi-region ('US', 'EU') or a single region."
  type        = string
  default     = "US"
}

variable "assets_bucket_name" {
  description = "Globally-unique bucket holding the site's markdown and static assets."
  type        = string
  default     = "nwrks-assets-prod"
}

variable "assets_prefix" {
  description = <<-EOT
    Object-name prefix all content sits under. Matches the old Azure container name so every
    published asset URL (https://<cdn host>/static/...) stays byte-identical after the migration —
    changing it would break links inside already-published markdown.
  EOT
  type        = string
  default     = "static"
}

variable "web_bucket_name" {
  description = "Globally-unique bucket serving the built React frontend."
  type        = string
  default     = "nwrks-web-prod"
}

variable "cdn_custom_domain_host" {
  description = "Custom domain that serves static assets through the CDN."
  type        = string
  default     = "nwrks-cdn.public.prod.nuka.works"
}

variable "site_custom_domain_host" {
  description = "Custom domain that serves the React frontend."
  type        = string
  default     = "blog.nuka.works"
}

variable "api_service_name" {
  description = "Cloud Run service name for the Server API."
  type        = string
  default     = "blog-api"
}

variable "api_image" {
  description = <<-EOT
    Container image for the API. Terraform only sets the initial value: deploy-server.yml pushes a
    new digest on every release and Cloud Run's own revision history owns it from then on, which is
    why the image field is ignored below.
  EOT
  type        = string
  default     = "us-docker.pkg.dev/cloudrun/container/hello"
}

variable "api_min_instances" {
  description = <<-EOT
    Minimum warm Cloud Run instances. 0 costs nothing while idle but cold-starts the first request
    after a quiet period (the same trade the old F1 App Service plan forced); 1 removes cold starts
    for a small monthly cost.
  EOT
  type        = number
  default     = 0
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy via Workload Identity Federation."
  type        = string
  default     = "powerm1nt/About-me"
}
