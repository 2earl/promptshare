# Attaches promptshare.cc to the Worker. Cloudflare creates the DNS record and certificate itself.
# The Worker script is created by the deploy workflow, not by Terraform.
resource "cloudflare_workers_custom_domain" "promptshare" {
  account_id = var.account_id
  zone_id    = local.zone_id
  hostname   = var.zone_name
  service    = var.worker_name
}
