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

variable "shared_assets_prefix" {
  description = "Object-name prefix reserved for the NukaWorks company site in the shared assets bucket."
  type        = string
  default     = "shared_assets"
}

variable "cdn_custom_domain_host" {
  description = "Custom domain that serves static assets through the CDN."
  type        = string
  default     = "nwrks-cdn.public.prod.nuka.works"
}

variable "site_custom_domain_host" {
  description = "Custom domain that serves the combined blog frontend and /api through Cloud CDN."
  type        = string
  default     = "blog.nuka.works"
}

variable "company_site_custom_domain_host" {
  description = "Apex custom domain serving the NukaWorks company frontend."
  type        = string
  default     = "nuka.works"
}

variable "api_service_name" {
  description = "Cloud Run service name for the combined blog frontend and API."
  type        = string
  default     = "blog-api"
}

variable "company_service_name" {
  description = "Cloud Run service name for the IAP-protected NukaWorks company website and API."
  type        = string
  default     = "website"
}

variable "iap_access_members" {
  description = "Google identities allowed through IAP to view nuka.works."
  type        = set(string)
  default     = ["domain:nuka.works"]
}

variable "api_image" {
  description = <<-EOT
    Container image for the blog. Terraform only sets the initial value: deploy-web.yml pushes a
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

variable "cert_version" {
  description = <<-EOT
    Suffix on the managed certificate's name. Bump it to force a reissue — the certificate is
    replaced before the old one is removed, so the load balancer never sits without one.
  EOT
  type        = number
  default     = 1
}

variable "company_cert_version" {
  description = "Suffix on the managed certificate dedicated to the NukaWorks apex domain."
  type        = number
  default     = 1
}

variable "github_client_id" {
  description = <<-EOT
    Client id of the GitHub OAuth app behind the "propose changes" sign-in.

    Terraform owns this rather than the deploy workflow. The Cloud Run service definition lists the
    container's environment in full, so anything set out-of-band with `gcloud run deploy
    --update-env-vars` is removed by the next `terraform apply` — which silently broke sign-in until
    the next deploy re-added it. An OAuth client id is public (it travels in the authorize URL the
    browser follows), so unlike the client secret there is no reason to keep it out of the config.
  EOT
  type        = string
  default     = "Ov23libBcHbgZHkrxg6D"
}

variable "github_repository" {
  description = "owner/name of the GitHub repository allowed to deploy via Workload Identity Federation."
  type        = string
  default     = "powerm1nt/About-me"
}

variable "company_github_repository" {
  description = "owner/name of the NukaWorks company repository allowed to deploy via Workload Identity Federation."
  type        = string
  default     = "NukaWorks/Website"
}

variable "db_instance_name" {
  description = "Cloud SQL instance holding accounts and sessions."
  type        = string
  default     = "nwrks-pg-prod"
}

variable "db_name" {
  description = "Database within the Cloud SQL instance."
  type        = string
  default     = "aboutme"
}

variable "db_user" {
  description = "Database role the API connects as. Its password is generated and kept in Secret Manager."
  type        = string
  default     = "app"
}

variable "db_tier" {
  description = <<-EOT
    Cloud SQL machine type. The shared-core tier is enough for an authentication database serving one
    site; move to a dedicated-core tier before it carries anything latency-sensitive.
  EOT
  type        = string
  default     = "db-f1-micro"
}

variable "google_client_id" {
  description = <<-EOT
    Client id of the Google OAuth client used for sign-in. Public, like the GitHub one: it travels in
    the authorize URL the browser follows. The matching secret is added to Secret Manager by hand.
  EOT
  type        = string
  default     = ""
}

variable "site_owner_emails" {
  description = <<-EOT
    Comma-separated email addresses allowed to moderate: delete anyone's photo or comment. Matched on
    the address rather than the provider, so the same person moderates whichever way they signed in.
  EOT
  type        = string
  default     = ""
}
