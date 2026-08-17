# Terraform — NukaWorks infra (Google Cloud)

Everything the site runs on, in one project:

| Resource                                | What it does                                                    |
| --------------------------------------- | --------------------------------------------------------------- |
| `google_storage_bucket.assets`          | The site's markdown and images, under the `static/` prefix       |
| `google_storage_bucket.web`             | The built React frontend                                         |
| Global external ALB + Cloud CDN         | Serves both buckets, one hostname each, with managed TLS         |
| `google_cloud_run_v2_service.api`       | The Express/TypeScript `server/` API                             |
| Secret Manager                          | Holds the GitHub OAuth client secret                             |
| Workload Identity Federation            | Lets GitHub Actions deploy without a service-account key         |

Host routing:

- `nwrks-cdn.public.prod.nuka.works` → assets bucket
- `blog.nuka.works` → web bucket
- The API is reached at its own Cloud Run URL (`api_url` output), called cross-origin by the
  frontend. CORS is configured from `CORS_ALLOWED_ORIGINS` on the service, which doubles as the
  OAuth returnUrl allow-list.

## Why objects sit under `static/`

The Azure setup this replaced served content from a blob container named `static`, so its public
path was `/static/blog/welcome.md`. GCS has no containers, so the container name became an object
prefix — which reproduces that path byte-for-byte. That is the reason every image and link inside
already-published markdown survived the migration untouched. Changing `assets_prefix` would break
all of them.

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

1. **DNS.** Point both hostnames at the `load_balancer_ip` output with A records. `nuka.works` is on
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
   | `CLOUDFLARE_ZONE_ID`              | Cloudflare zone for `nuka.works`          |
   | `CLOUDFLARE_API_TOKEN`            | Token with cache-purge permission         |

   | GitHub variable        | Value                                        |
   | ---------------------- | -------------------------------------------- |
   | `GCP_PROJECT_ID`       | Project id                                    |
   | `GCP_REGION`           | `northamerica-northeast1` (or your `region`)  |
   | `GCP_WEB_BUCKET`       | `web_bucket` output                           |
   | `GCP_ASSETS_BUCKET`    | `assets_bucket` output                        |
   | `GCP_ASSETS_PREFIX`    | `static`                                      |
   | `GCP_URL_MAP`          | `nwrks-url-map`                               |
   | `API_BASE_URL`         | `api_url` output                              |
   | `ASSET_BASE_URL`       | `cdn_asset_base_url` output                   |

4. **Migrate the old content** (once), then decommission Azure:

   ```bash
   az login
   gcloud auth login && gcloud config set project <project-id>
   scripts/migrate-azure-to-gcp.sh --dry-run   # inspect first
   scripts/migrate-azure-to-gcp.sh
   ```

## What Terraform deliberately doesn't own

- **The deployed API image.** `deploy-server.yml` pushes a new digest per release, so
  `template[0].containers[0].image` is in `ignore_changes` — otherwise every `terraform apply`
  would roll the service back to `var.api_image` and undo the latest deploy.
- **Secret values.** Only the container, per above.
- **Bucket contents.** Frontend builds and merged content patches are written by CI.
- **DNS.** `nuka.works` lives on Cloudflare (`hank.ns.cloudflare.com` / `meadow.ns.cloudflare.com`).

## Cost knob

`api_min_instances` defaults to `0`: nothing is billed while the API is idle, but the first request
after a quiet period pays a cold start — the same trade the old F1 App Service plan forced. Set it
to `1` to keep one instance warm and remove that latency.
