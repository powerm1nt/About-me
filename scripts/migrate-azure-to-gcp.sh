#!/usr/bin/env bash
#
# One-shot content migration: copies every object from the old Azure Blob container into the new
# Google Cloud Storage bucket, preserving paths so every published asset URL keeps working.
#
#   Azure:  https://<account>.blob.core.windows.net/static/blog/welcome.md
#   GCS:    gs://<bucket>/static/blog/welcome.md   →  https://<cdn host>/static/blog/welcome.md
#
# The Azure container name becomes the GCS object prefix, which is what keeps the public path
# identical on both sides — nothing inside already-published markdown has to be rewritten.
#
# Prerequisites (both are interactive, so run them yourself first):
#   az login
#   gcloud auth login && gcloud config set project <project-id>
#
# Usage:
#   scripts/migrate-azure-to-gcp.sh [--dry-run]
#
# Everything is configurable through the environment variables below.

set -euo pipefail

AZ_ACCOUNT="${AZ_ACCOUNT:-nwrks}"
AZ_CONTAINER="${AZ_CONTAINER:-static}"
GCS_BUCKET="${GCS_BUCKET:-nwrks-assets-prod}"
GCS_PREFIX="${GCS_PREFIX:-static}"

DRY_RUN=0
[ "${1:-}" = "--dry-run" ] && DRY_RUN=1

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }
die() { printf '\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

command -v az >/dev/null || die "azure-cli is not installed."
command -v gcloud >/dev/null || die "google-cloud-cli is not installed."

az account show >/dev/null 2>&1 || die "Not logged in to Azure. Run: az login"
gcloud auth list --filter=status:ACTIVE --format='value(account)' | grep -q . \
  || die "Not logged in to Google Cloud. Run: gcloud auth login"

PROJECT="$(gcloud config get-value project 2>/dev/null)"
[ -n "$PROJECT" ] && [ "$PROJECT" != "(unset)" ] \
  || die "No active GCP project. Run: gcloud config set project <project-id>"

# Owning the subscription does not imply data-plane access: listing blobs with --auth-mode login
# needs a "Storage Blob Data *" RBAC role, which a subscription owner does not get by default.
# Rather than make the operator go and grant themselves one for a single throwaway copy, fall back
# to --auth-mode key, where az fetches the account key over the management plane they *do* control.
AUTH_MODE="${AZ_AUTH_MODE:-}"
if [ -z "$AUTH_MODE" ]; then
  if az storage blob list --account-name "$AZ_ACCOUNT" --container-name "$AZ_CONTAINER" \
       --auth-mode login --query "[0].name" -o tsv >/dev/null 2>&1; then
    AUTH_MODE=login
  else
    AUTH_MODE=key
  fi
fi

log "Azure  : $AZ_ACCOUNT/$AZ_CONTAINER  (auth-mode: $AUTH_MODE)"
log "GCS    : gs://$GCS_BUCKET/$GCS_PREFIX  (project $PROJECT)"

# --- 1. Inventory ------------------------------------------------------------

log "Listing source blobs…"
mapfile -t BLOBS < <(az storage blob list \
  --account-name "$AZ_ACCOUNT" \
  --container-name "$AZ_CONTAINER" \
  --auth-mode "$AUTH_MODE" \
  --query "[].name" -o tsv)

[ "${#BLOBS[@]}" -gt 0 ] || die "No blobs found in $AZ_ACCOUNT/$AZ_CONTAINER — wrong account, or no read access."
log "Found ${#BLOBS[@]} objects."

if [ "$DRY_RUN" -eq 1 ]; then
  printf '  %s\n' "${BLOBS[@]}"
  log "Dry run — nothing copied."
  exit 0
fi

# --- 2. Download -------------------------------------------------------------

WORKDIR="$(mktemp -d)"
trap 'rm -rf "$WORKDIR"' EXIT

log "Downloading to $WORKDIR…"
az storage blob download-batch \
  --account-name "$AZ_ACCOUNT" \
  --source "$AZ_CONTAINER" \
  --destination "$WORKDIR" \
  --auth-mode "$AUTH_MODE" \
  --no-progress

# --- 3. Upload ---------------------------------------------------------------

# rsync rather than cp so re-running the migration is cheap and idempotent — only changed objects
# move on a second pass.
log "Uploading to gs://$GCS_BUCKET/$GCS_PREFIX…"
gcloud storage rsync "$WORKDIR" "gs://$GCS_BUCKET/$GCS_PREFIX" --recursive

# Two fixes in one pass over the markdown:
#
#  * Content type. gcloud guesses text/plain for .md/.mdx, which makes browsers download raw
#    markdown instead of letting the API read it as text.
#
#  * The real last-edited date. A page's "last edited" line comes from the object's timestamp, and
#    GCS sets that to the moment the migration wrote it — so without this every article would claim
#    it was edited on migration day. GCS won't let a caller set `updated`, so the true Azure value
#    is carried across as custom metadata and the API prefers it (see server/src/services/
#    storage.ts). A later edit rewrites the object and drops the custom value, at which point the
#    GCS timestamp is the honest answer again.
log "Fixing content types and preserving original edit dates…"
while IFS= read -r name; do
  case "$name" in
    *.md|*.mdx)
      modified="$(az storage blob show \
        --account-name "$AZ_ACCOUNT" --container-name "$AZ_CONTAINER" \
        --name "$name" --auth-mode "$AUTH_MODE" \
        --query "properties.lastModified" -o tsv 2>/dev/null)"

      gcloud storage objects update "gs://$GCS_BUCKET/$GCS_PREFIX/$name" \
        --content-type="text/markdown" --cache-control="public, max-age=60" \
        ${modified:+--custom-metadata="originalLastModified=$modified"} >/dev/null
      ;;
  esac
done < <(printf '%s\n' "${BLOBS[@]}")

# --- 4. Verify ---------------------------------------------------------------

DEST_COUNT="$(gcloud storage ls --recursive "gs://$GCS_BUCKET/$GCS_PREFIX/**" | grep -c . || true)"
log "Source: ${#BLOBS[@]} objects — destination: $DEST_COUNT objects."
[ "$DEST_COUNT" -ge "${#BLOBS[@]}" ] || die "Destination has fewer objects than the source — check the log above."

cat <<EOF

$(log "Content migration complete.")

Remaining manual steps (they need decisions or credentials this script shouldn't hold):

  1. terraform -chdir=terraform apply -var project_id=$PROJECT
  2. Point both DNS records at the load balancer IP that apply outputs:
       nwrks-cdn.public.prod.nuka.works
       blog.nuka.works
     The managed certificate stays PROVISIONING until they resolve.
  3. Store the GitHub OAuth client secret:
       gcloud secrets versions add github-oauth-client-secret --data-file=-
  4. Set the repository secrets/variables listed in terraform/README.md.
  5. Once the new site serves traffic AND you have confirmed it healthy, decommission the old
     Azure resources. Delete them individually — do NOT delete the resource groups wholesale.
     The "Default" group also holds jade-sqldb (a SQL server this site never used: there is no
     DbContext or connection string anywhere in Server/), and deleting the group destroys it too.

       az staticwebapp delete --name blog --resource-group Default --yes
       az afd profile delete --profile-name nwrks-cdn --resource-group Default --yes
       az webapp delete --name blog-api --resource-group blog-api_group
       az appservice plan delete --name ASP-blogapigroup-b00d \\
         --resource-group blog-api_group --yes

     The nwrks storage account is deliberately last and separate: it is the only remaining copy of
     the original content, so keep it until the GCS bucket has served traffic for a while. It also
     holds a second container ("jade") that this site does not use — check it before deleting.

       az storage account delete --name nwrks --resource-group Default --yes
EOF
