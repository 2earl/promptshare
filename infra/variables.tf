variable "account_id" {
  description = "Cloudflare account that owns the 2earl Workers. The gateway can bind only to Workers in its own account."
  type        = string
  # Cloudflare account IDs are identifiers, not credentials.
  default = "304c2b77d734c688c8309d5a535f561a"
}
