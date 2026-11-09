# IDs the Worker needs in wrangler.jsonc. None of these are secrets.

output "d1_database_id" {
  description = "wrangler.jsonc → d1_databases[].database_id"
  value       = cloudflare_d1_database.promptshare.id
}

output "dnssec_ds" {
  description = "DS record for the registrar, if it isn't Cloudflare Registrar."
  value       = cloudflare_zone_dnssec.this.ds
}
