# The wildcard certificate for per-profile subdomains (emi.hisuiki.com and friends).
#
# This needs Certificate Manager rather than the classic managed certificate in lb.tf: a
# google_compute_managed_ssl_certificate cannot contain a wildcard domain at all. Certificate
# Manager can, but it proves domain ownership through DNS rather than by serving an HTTP challenge
# from the load balancer — which is why a TXT record has to exist before the certificate will issue.
#
# The apex is included deliberately. "*.hisuiki.com" matches one label, so it covers api, cdn, and
# every profile subdomain, but it does NOT cover hisuiki.com itself.

resource "google_certificate_manager_dns_authorization" "hisuiki" {
  name        = "hisuiki-dns-auth"
  domain      = var.site_domain
  description = "Proves control of hisuiki.com so a wildcard certificate can be issued."

  depends_on = [google_project_service.required]
}

resource "google_certificate_manager_certificate" "wildcard" {
  name        = "hisuiki-wildcard-cert"
  description = "Apex plus wildcard, covering profile subdomains."

  depends_on = [google_project_service.required]

  managed {
    domains = [var.site_domain, "*.${var.site_domain}"]
    dns_authorizations = [
      google_certificate_manager_dns_authorization.hisuiki.id,
    ]
  }
}

resource "google_certificate_manager_certificate_map" "this" {
  name = "hisuiki-cert-map"

  depends_on = [google_project_service.required]
}

# A single PRIMARY entry: the certificate covers every hostname this load balancer serves, so there
# is nothing to match per-host. Adding a profile subdomain later needs no change here.
resource "google_certificate_manager_certificate_map_entry" "primary" {
  name         = "hisuiki-primary"
  map          = google_certificate_manager_certificate_map.this.name
  matcher      = "PRIMARY"
  certificates = [google_certificate_manager_certificate.wildcard.id]
}
