# infra

Terraform for the Cloudflare resources around the `promptshare` Worker. Rationale:
[docs/DESIGN.md §9](../docs/DESIGN.md).

| File | Manages |
|---|---|
| `storage.tf` | D1 database `promptshare`, EU jurisdiction, protected from destroy |

Phase P2 adds the `promptshare.cc` zone settings and the custom domain.

## How changes are applied

1. Open a PR that changes files here. HCP Terraform (workspace `2earl-promptshare`, working
   directory `infra`) posts a speculative plan on the PR.
2. Merge. HCP queues a run on `main`.
3. The owner reviews the plan in HCP and confirms the apply. Apply is never automatic.

Credentials: `CLOUDFLARE_API_TOKEN` is a sensitive **environment** variable in the workspace (not a
Terraform variable). Nothing in this directory may contain a secret.

## First deployment

1. Merge the PR that adds this directory and confirm the HCP apply: it creates the D1 database.
   The `deploy` run it starts stops by itself while `wrangler.jsonc` has the placeholder ID.
2. A second PR puts the `d1_database_id` output into `wrangler.jsonc`. After merging it, approve
   the `deploy` run.

## Not managed here

Worker code, Worker secrets, D1 migrations: Wrangler, through `.github/workflows/deploy.yml`.
