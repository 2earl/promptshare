# The promptshare.cc zone already exists in the 2earl account. It is read, never created or
# destroyed, by this configuration, so a mistake here can't delete the domain.
data "cloudflare_zone" "promptshare" {
  filter = {
    name    = var.zone_name
    account = { id = var.account_id }
  }
}

locals {
  zone_id = data.cloudflare_zone.promptshare.id

  # Zone-wide settings, as login's for 2earl.com (2earl/login docs/DESIGN.md §9.1).
  zone_settings = {
    ssl                      = "strict"
    min_tls_version          = "1.2"
    tls_1_3                  = "on"
    always_use_https         = "on"
    automatic_https_rewrites = "on"
    # 0-RTT lets a network attacker replay the first request of a resumed TLS session; the site
    # takes form posts.
    "0rtt" = "off"
    # Off, unlike login: login's servers fetch /oauth/client.json (CIMD) and must not be
    # challenged. The site has no scripts to protect and rate-limits its forms itself.
    browser_check = "off"
    http3         = "on"
  }
}

resource "cloudflare_zone_setting" "this" {
  for_each = local.zone_settings

  zone_id    = local.zone_id
  setting_id = each.key
  value      = each.value
}

# HSTS for the whole zone. The Worker also sends its own header with preload; submitting the
# domain to the browser preload list is a separate, deliberate step.
resource "cloudflare_zone_setting" "security_header" {
  zone_id    = local.zone_id
  setting_id = "security_header"
  value = {
    strict_transport_security = {
      enabled            = true
      max_age            = 31536000
      include_subdomains = true
      preload            = false
      nosniff            = true
    }
  }
}

# DNSSEC. Cloudflare signs the zone; the DS record (output `dnssec_ds`) must be at the registrar
# for validation to start. With Cloudflare Registrar that happens automatically.
resource "cloudflare_zone_dnssec" "this" {
  zone_id = local.zone_id
  status  = "active"
}
