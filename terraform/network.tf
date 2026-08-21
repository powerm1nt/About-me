# The VPC the database lives on.
#
# Cloud SQL has no public IP: it is reachable only on a private address inside this network, so
# there is nothing on the internet to scan or brute-force. Cloud Run reaches it through Direct VPC
# egress — the service gets an interface on the subnet below and its Cloud SQL connector dials the
# private address from inside.
#
# The trade this makes is operational, not theoretical: nothing outside the VPC can open a
# connection any more, including `cloud-sql-proxy` on a workstation. Migrations therefore run from
# the migrate Cloud Run job (see cloudrun.tf), which is inside the network.

resource "google_compute_network" "main" {
  name                    = "hisuiki-net"
  auto_create_subnetworks = false

  depends_on = [google_project_service.required]
}

# Direct VPC egress hands every Cloud Run instance an address from this subnet, so it needs room for
# the peak instance count several times over rather than the handful a steady state uses.
resource "google_compute_subnetwork" "run" {
  name          = "hisuiki-run"
  region        = var.region
  network       = google_compute_network.main.id
  ip_cidr_range = "10.8.0.0/24"
}

# Private services access: Google runs the Cloud SQL instance in a network it owns and peers it to
# this one, drawing the instance's address from the range reserved here.
resource "google_compute_global_address" "private_services" {
  name          = "hisuiki-private-services"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = 16
  network       = google_compute_network.main.id
}

resource "google_service_networking_connection" "private_services" {
  network                 = google_compute_network.main.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services.name]

  depends_on = [google_project_service.required]
}
