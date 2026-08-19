# Terraform — shared NukaWorks web infrastructure (Google Cloud)

Everything the site runs on, in one project:

| Resource                                   | What it does                                                    |
| ------------------------------------------ | --------------------------------------------------------------- |
| `google_storage_bucket.assets`             | Shared content under the `static/` and `shared_assets/` prefixes |
| Global external ALB + Cloud CDN            | Serves assets and the public blog with managed TLS               |
| `google_cloud_run_v2_service.api`          | Combined `blog.nuka.works` React frontend and Express `/api`     |
| `google_cloud_run_v2_service.company_site` | IAP-protected `nuka.works` frontend and API                      |
| Serverless NEGs + global backend services  | Route both domains from the shared load balancer to Cloud Run    |
| Secret Manager                          | Holds the GitHub OAuth client secret                             |
| Workload Identity Federation            | Lets GitHub Actions deploy without a service-account key         |

Host routing:

- `nwrks-cdn.public.prod.nuka.works` → shared assets bucket
- `blog.nuka.works` → combined public blog Cloud Run service through Cloud CDN
- `nuka.works` → IAP-protected company Cloud Run service
- The blog API is same-origin at `https://blog.nuka.works/api`. CDN behavior follows Express's
  origin headers: public reads opt into short caching; auth and mutation routes are private/no-store.

## Shared asset namespaces

The Azure setup this replaced served content from a blob container named `static`, so its public
path was `/static/blog/welcome.md`. GCS has no containers, so the container name became an object
prefix — which reproduces that path byte-for-byte. That is the reason every image and link inside
already-published markdown survived the migration untouched. Changing `assets_prefix` would break
all of them. The company site uses `shared_assets/` in that same bucket so its uploads cannot
collide with blog content; Terraform creates `shared_assets/.keep` to establish that namespace.

## Remote state

State lives in `gs://nwrks-tfstate-prod` (prefix `site`), configured in `backend.tf`. That bucket is
intentionally not a resource here — Terraform cannot hold the state describing the bucket its own
state lives in — so it was created once, by hand:

```bash
gcloud storage buckets create gs://nwrks-tfstate-prod --location=US --uniform-bucket-level-access
gcloud storage buckets update gs://nwrks-tfstate-prod --versioning
```

Object versioning is on, so a bad state push can be rolled back to the previous generation instead
of being rebuilt by hand from the live project.

## Getting started

```bash
cd terraform
terraform init
terraform apply -var project_id=<your-project-id>
```

The provider needs Application Default Credentials (`gcloud auth application-default login`). If you
would rather not leave a credential file on disk, a short-lived token works for a single run:

```bash
export GOOGLE_OAUTH_ACCESS_TOKEN="$(gcloud auth print-access-token)"
```

Enable the APIs the first apply needs, if they aren't already:

```bash
gcloud services enable \
  compute.googleapis.com run.googleapis.com storage.googleapis.com \
  artifactregistry.googleapis.com secretmanager.googleapis.com \
  iamcredentials.googleapis.com
```

## After the first apply

1. **DNS.** Point all three hostnames at the `load_balancer_ip` output with A records. `nuka.works` is on
   Cloudflare and these must stay **DNS-only (grey cloud)** — an orange-clouded record proxies the
   request and Google's managed certificate can never complete its HTTP-01 challenge. The
   certificate sits in `PROVISIONING` until DNS resolves; that can take up to an hour after it does.

   ```bash
   gcloud compute ssl-certificates describe nwrks-cert --global \
     --format="value(managed.status, managed.domainStatus)"
   ```

2. **The OAuth client secret.** Terraform creates the secret container, never its value — putting a
   secret's contents in Terraform would write it to the state file in plaintext.

   ```bash
   gcloud secrets versions add github-oauth-client-secret --data-file=-
   ```

   Ordering gotcha: the Cloud Run service mounts this secret at `latest`, and Cloud Run resolves
   that mount at *deploy* time. On a from-scratch apply the container exists but has no version
   yet, so creating the service fails with `secret_key_ref ... versions/latest was not found`. That
   is not a broken configuration — add the version as above and re-run `terraform apply`, which
   creates the service on the second pass. Everything else in the apply is unaffected.

3. **Repository secrets and variables** for the deploy workflows:

   | GitHub secret                     | Value                                    |
   | --------------------------------- | ---------------------------------------- |
   | `GCP_WORKLOAD_IDENTITY_PROVIDER`  | `workload_identity_provider` output       |
   | `GCP_DEPLOY_SERVICE_ACCOUNT`      | `deployer_service_account` output         |
   | `GH_OAUTH_CLIENT_ID`              | GitHub OAuth app client id                |
   | `CLOUDFLARE_ZONE_ID`              | Cloudflare zone for `nuka.works` (blog workflow only) |
   | `CLOUDFLARE_API_TOKEN`            | Cache-purge token (blog workflow only)    |

   | GitHub variable        | Value                                        |
   | ---------------------- | -------------------------------------------- |
   | `GCP_PROJECT_ID`       | Project id                                    |
   | `GCP_REGION`           | `northamerica-northeast1` (or your `region`)  |
   | `GCP_CLOUD_RUN_SERVICE`| `blog-api`                                    |
   | `GCP_ASSETS_BUCKET`    | `assets_bucket` output                        |
   | `GCP_ASSETS_PREFIX`    | `static`                                      |
   | `GCP_URL_MAP`          | `nwrks-url-map`                               |
   | `ASSET_BASE_URL`       | `cdn_asset_base_url` output                   |

   For `NukaWorks/Website`, set `GCP_ASSETS_PREFIX` to `shared_assets`, `ASSET_BASE_URL` to the
   `company_cdn_asset_base_url` output, and `GCP_CLOUD_RUN_SERVICE` to `website`. The company deploy
   does not require Cloudflare secrets: the apex record is DNS-only and the frontend is served by
   Cloud Run rather than cached at the edge.

## Company-site Google SSO

The company frontend and API are served from one Cloud Run image. IAP is enabled directly on the
service, so both the load-balancer route and the default `run.app` URL require Google SSO before
returning application content. `iap_access_members` defaults to `domain:nuka.works`; add individual
Google accounts or groups to that set if access needs to extend beyond the Workspace domain.

Cloud CDN is intentionally disabled for the company Cloud Run backend because IAP and Cloud CDN
cannot protect/cache the same backend. The shared assets hostname remains CDN-backed and public;
company-owned files are isolated under `shared_assets/`.

### Historical content migration

   ```bash
   az login
   gcloud auth login && gcloud config set project <project-id>
   scripts/migrate-azure-to-gcp.sh --dry-run   # inspect first
   scripts/migrate-azure-to-gcp.sh
   ```

## What Terraform deliberately doesn't own

- **Deployed Cloud Run images.** The deploy workflows push a new digest per release, so
  `template[0].containers[0].image` is in `ignore_changes` — otherwise every `terraform apply`
  would roll the service back to `var.api_image` and undo the latest deploy.
- **Secret values.** Only the container, per above.
- **Bucket contents.** Merged content patches and company assets are written by CI.
- **DNS.** `nuka.works` lives on Cloudflare (`hank.ns.cloudflare.com` / `meadow.ns.cloudflare.com`).

## Cost knob

`api_min_instances` defaults to `0`: nothing is billed while either Cloud Run service is idle, but
the first request after a quiet period pays a cold start. Set it to `1` to keep one instance of each
service warm and remove that latency.
