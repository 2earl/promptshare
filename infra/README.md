# infra

Terraform for the Cloudflare resources around the `promptshare` Worker. Rationale:
[docs/DESIGN.md §9](../docs/DESIGN.md).

| File | Manages |
|---|---|
| `storage.tf` | D1 database `promptshare`, EU jurisdiction, protected from destroy |
| `zone.tf` | Reads the `promptshare.cc` zone; its TLS, HSTS, 0-RTT and DNSSEC settings |
| `worker.tf` | Custom domain `promptshare.cc` → Worker `promptshare` |

The Cloudflare token needs, on the `promptshare.cc` zone: Zone read, Zone Settings edit, DNSSEC
edit (Zone Settings covers it), and Workers Routes edit.

## How changes are applied

HCP Terraform (workspace `2earl-promptshare`) keeps the state only; Terraform runs in GitHub Actions
(`.github/workflows/infra.yml`), so a run never depends on HCP fetching the repository.

1. Open a PR that changes files here. The `check` job runs `terraform fmt`, `init` and
   `validate`, without secrets.
2. Merge. On `main`, the `plan` job waits for the owner's approval (environment `production`),
   then writes the plan to the run's summary.
3. If there are changes, the `apply` job waits for a second approval and applies only if a fresh
   plan is identical to the one reviewed. Apply is never automatic.

Credentials, in the repository's `production` environment: `TF_API_TOKEN` (an HCP Terraform team
token) and `CLOUDFLARE_INFRA_API_TOKEN`. Nothing in this directory may contain a secret.

## First deployment

1. Merge the PR that adds this directory and approve the `infra` run: it creates the D1 database.
   The `deploy` run it starts stops by itself while `wrangler.jsonc` has the placeholder ID.
2. A second PR puts the `d1_database_id` output into `wrangler.jsonc`. After merging it, approve
   the `deploy` run.

## Not managed here

Worker code, Worker secrets, D1 migrations: Wrangler, through `.github/workflows/deploy.yml`.
