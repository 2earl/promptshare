# Prompt share's database (docs/DESIGN.md §7): prompts, shared sessions (entries encrypted by the
# Worker), security log. Restricted to the EU jurisdiction, which can only be chosen at creation.
#
# prevent_destroy: replacing it deletes every user's prompts and sessions. If a plan ever wants
# to replace it, stop and investigate instead of removing this guard.
resource "cloudflare_d1_database" "promptshare" {
  account_id   = var.account_id
  name         = "promptshare"
  jurisdiction = "eu"

  # Read replicas outside the EU would defeat the jurisdiction choice.
  read_replication = {
    mode = "disabled"
  }

  lifecycle {
    prevent_destroy = true
  }
}
