# One global external Application Load Balancer fronting the shared buckets and company Cloud Run
# service, replacing the Azure Front Door profile that used to do the same job:
#
#   nwrks-cdn.public.prod.nuka.works  -> assets bucket  (markdown + images, /static/...)
#   blog.nuka.works                    -> web bucket     (the built React frontend)
#   nuka.works                         -> IAP-protected Cloud Run website
#
# Point all hostnames' A/AAAA records at google_compute_global_address.this before applying —
# the managed certificate can't be issued until DNS resolves to this IP.

resource "google_compute_global_address" "this" {
  name = "nwrks-lb-ip"
}

resource "google_compute_backend_bucket" "assets" {
  name        = "nwrks-assets-backend"
  bucket_name = google_storage_bucket.assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode = "CACHE_ALL_STATIC"
    # Content changes only when a proposal is merged, and the deploy workflow invalidates the
    # cache when that happens — so a long TTL here costs nothing in staleness.
    default_ttl = 3600
    max_ttl     = 86400
    client_ttl  = 3600
  }
}

resource "google_compute_backend_bucket" "web" {
  name        = "nwrks-web-backend"
  bucket_name = google_storage_bucket.web.name
  enable_cdn  = true

  cdn_policy {
    cache_mode = "CACHE_ALL_STATIC"
    # index.html itself must not be cached at the edge: it's the only file whose name doesn't
    # change between builds, so a cached copy would keep serving hashed asset URLs that no longer
    # exist. Vite's other output is content-hashed and safe to cache for a year.
    default_ttl = 0
    max_ttl     = 31536000
    client_ttl  = 0
  }
}

resource "google_compute_url_map" "this" {
  name            = "nwrks-url-map"
  default_service = google_compute_backend_bucket.web.id

  host_rule {
    hosts        = [var.cdn_custom_domain_host]
    path_matcher = "assets"
  }

  host_rule {
    hosts        = [var.site_custom_domain_host]
    path_matcher = "site"
  }

  host_rule {
    hosts        = [var.company_site_custom_domain_host]
    path_matcher = "company-site"
  }

  path_matcher {
    name            = "assets"
    default_service = google_compute_backend_bucket.assets.id
  }

  path_matcher {
    name            = "site"
    default_service = google_compute_backend_bucket.web.id
  }

  path_matcher {
    name            = "company-site"
    default_service = google_compute_backend_service.company_site.id
  }
}

# The name carries a version suffix because a managed certificate cannot be updated in place and
# create_before_destroy needs a free name to build the replacement under — with a fixed name the
# replacement collides with the certificate it is meant to replace and the apply fails with a 409.
#
# Bump var.cert_version to force a reissue. That is the remedy when a certificate is stuck in
# FAILED_NOT_VISIBLE, which is what happens when it first tried to validate before the domains'
# DNS pointed at the load balancer: Google's own retry is slow to clear that state, and a fresh
# certificate validates immediately once DNS is correct.
resource "google_compute_managed_ssl_certificate" "this" {
  name = "nwrks-cert-v${var.cert_version}"

  managed {
    domains = [var.cdn_custom_domain_host, var.site_custom_domain_host]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Keep the active blog/assets certificate attached while Google provisions the apex-domain
# certificate. This separates certificate lifecycles and prevents a nuka.works addition from
# interrupting either existing hostname.
resource "google_compute_managed_ssl_certificate" "company" {
  name = "nwrks-company-cert-v${var.company_cert_version}"

  managed {
    domains = [var.company_site_custom_domain_host]
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "google_compute_target_https_proxy" "this" {
  name    = "nwrks-https-proxy"
  url_map = google_compute_url_map.this.id
  ssl_certificates = [
    google_compute_managed_ssl_certificate.this.id,
    google_compute_managed_ssl_certificate.company.id,
  ]
}

resource "google_compute_global_forwarding_rule" "https" {
  name       = "nwrks-https"
  target     = google_compute_target_https_proxy.this.id
  port_range = "443"
  ip_address = google_compute_global_address.this.address
}

# --- HTTP -> HTTPS redirect -------------------------------------------------

resource "google_compute_url_map" "redirect" {
  name = "nwrks-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "nwrks-http-proxy"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name       = "nwrks-http"
  target     = google_compute_target_http_proxy.redirect.id
  port_range = "80"
  ip_address = google_compute_global_address.this.address
}
