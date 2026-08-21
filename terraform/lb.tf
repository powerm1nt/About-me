# One global external Application Load Balancer fronting all three hostnames:
#
#   hisuiki.com      -> hisuiki-web Cloud Run   (the React frontend)
#   api.hisuiki.com  -> hisuiki-api Cloud Run   (Express /api)
#   cdn.hisuiki.com  -> assets bucket           (markdown + images, /static/...)
#
# DNS: point hisuiki.com's A record at google_compute_global_address.this. The api and cdn hosts are
# CNAMEs to the apex, so that single record carries all three — but the managed certificate covers
# all three names and cannot be issued until each one resolves here. A certificate stuck in
# FAILED_NOT_VISIBLE means DNS was still pointing elsewhere when Google first tried; fix the record,
# then bump var.cert_version to force a fresh issue rather than waiting on Google's own retry.

resource "google_compute_global_address" "this" {
  name       = "hisuiki-lb-ip"
  depends_on = [google_project_service.required]
}

# ── Assets: cdn.hisuiki.com ───────────────────────────────────────────────────────────────────

resource "google_compute_backend_bucket" "assets" {
  name        = "hisuiki-assets-backend"
  bucket_name = google_storage_bucket.assets.name
  enable_cdn  = true

  cdn_policy {
    cache_mode = "CACHE_ALL_STATIC"
    # Images and published markdown change rarely, and an edit rewrites the object under a new
    # generation — so a long edge TTL costs little staleness. Invalidate on release if it matters.
    default_ttl = 3600
    max_ttl     = 86400
    client_ttl  = 3600
  }
}

# ── Frontend: hisuiki.com ─────────────────────────────────────────────────────────────────────

resource "google_compute_region_network_endpoint_group" "web" {
  name                  = "hisuiki-web-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.web.name
  }
}

# The frontend is a built React bundle: hashed assets are immutable and index.html must never be
# cached at the edge. Express sets exactly those headers per file, so the CDN follows them.
# No timeout_sec on either backend service: one fronting a serverless NEG rejects the field. The
# request timeout that actually applies is the Cloud Run service's own, which defaults to 300s.
resource "google_compute_backend_service" "web" {
  name                  = "hisuiki-web-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL"
  enable_cdn            = true

  cdn_policy {
    cache_mode        = "USE_ORIGIN_HEADERS"
    negative_caching  = false
    serve_while_stale = 60

    cache_key_policy {
      include_host         = true
      include_protocol     = true
      include_query_string = true
    }
  }

  backend {
    group = google_compute_region_network_endpoint_group.web.id
  }
}

# ── API: api.hisuiki.com ──────────────────────────────────────────────────────────────────────

resource "google_compute_region_network_endpoint_group" "api" {
  name                  = "hisuiki-api-neg"
  network_endpoint_type = "SERVERLESS"
  region                = var.region

  cloud_run {
    service = google_cloud_run_v2_service.api.name
  }
}

# No CDN in front of the API at all. Separating the origins made this possible: when the two shared
# a hostname the API had to opt out of caching response by response, and one missing header would
# have put a signed-in user's data in a shared cache. Here there is no cache to leak into.
resource "google_compute_backend_service" "api" {
  name                  = "hisuiki-api-backend"
  protocol              = "HTTP"
  load_balancing_scheme = "EXTERNAL"
  enable_cdn            = false

  backend {
    group = google_compute_region_network_endpoint_group.api.id
  }
}

# ── Routing ───────────────────────────────────────────────────────────────────────────────────

resource "google_compute_url_map" "this" {
  name            = "hisuiki-url-map"
  default_service = google_compute_backend_service.web.id

  host_rule {
    hosts        = [var.site_domain]
    path_matcher = "site"
  }

  host_rule {
    hosts        = [var.api_domain]
    path_matcher = "api"
  }

  host_rule {
    hosts        = [var.cdn_domain]
    path_matcher = "assets"
  }

  path_matcher {
    name            = "site"
    default_service = google_compute_backend_service.web.id
  }

  path_matcher {
    name            = "api"
    default_service = google_compute_backend_service.api.id
  }

  path_matcher {
    name            = "assets"
    default_service = google_compute_backend_bucket.assets.id
  }
}

# The name carries a version suffix because a managed certificate cannot be updated in place and
# create_before_destroy needs a free name to build the replacement under — with a fixed name the
# replacement collides with the certificate it is meant to replace and the apply fails with a 409.
resource "google_compute_managed_ssl_certificate" "this" {
  name = "hisuiki-cert-v${var.cert_version}"

  managed {
    domains = [var.site_domain, var.api_domain, var.cdn_domain]
  }

  lifecycle {
    create_before_destroy = true
  }
}

# Two certificate sources, one at a time. While var.wildcard_cert_active is false the proxy keeps
# the classic three-name certificate that is already serving traffic; flipping it to true swaps in
# the Certificate Manager map holding the wildcard. Doing that before the wildcard reports ACTIVE
# would take HTTPS down for the whole site, which is exactly why it is a deliberate second step.
resource "google_compute_target_https_proxy" "this" {
  name    = "hisuiki-https-proxy"
  url_map = google_compute_url_map.this.id

  ssl_certificates = var.wildcard_cert_active ? [] : [google_compute_managed_ssl_certificate.this.id]
  certificate_map = var.wildcard_cert_active ? (
    "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.this.id}"
  ) : null
}

resource "google_compute_global_forwarding_rule" "https" {
  name       = "hisuiki-https"
  target     = google_compute_target_https_proxy.this.id
  port_range = "443"
  ip_address = google_compute_global_address.this.address
}

# --- HTTP -> HTTPS redirect -------------------------------------------------

resource "google_compute_url_map" "redirect" {
  name = "hisuiki-http-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_target_http_proxy" "redirect" {
  name    = "hisuiki-http-proxy"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "http" {
  name       = "hisuiki-http"
  target     = google_compute_target_http_proxy.redirect.id
  port_range = "80"
  ip_address = google_compute_global_address.this.address
}
