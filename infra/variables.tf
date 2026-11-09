variable "account_id" {
  description = "Cloudflare account that owns the 2earl Workers. The gateway can bind only to Workers in its own account."
  type        = string
  # Cloudflare account IDs are identifiers, not credentials.
  default = "304c2b77d734c688c8309d5a535f561a"
}

variable "zone_name" {
  description = "Prompt share's domain: the zone and the website's hostname."
  type        = string
  default     = "promptshare.cc"
}

variable "worker_name" {
  description = "Name of the Worker deployed by .github/workflows/deploy.yml (wrangler.jsonc \"name\")."
  type        = string
  default     = "promptshare"
}
