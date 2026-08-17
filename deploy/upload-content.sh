#!/usr/bin/env bash
#
# Uploads local content (markdown + images) to the site's Cloud Storage bucket.
#
# Day to day this isn't needed: pages are edited through the site's own "propose changes" flow,
# and apply-patches.yml writes the merged result to the bucket. This is the manual escape hatch —
# seeding a fresh bucket, or pushing a file that was never authored through a proposal.
#
# Authentication is whatever `gcloud auth login` established; there is no storage key to pass
# around, which is why this replaced the shared-key PowerShell scripts it grew out of.
#
# Usage:
#   deploy/upload-content.sh [source-dir]      # defaults to the repo root
#
set -euo pipefail

GCS_BUCKET="${GCS_BUCKET:-nwrks-assets-prod}"
GCS_PREFIX="${GCS_PREFIX:-static}"
URL_MAP="${GCP_URL_MAP:-nwrks-url-map}"

SOURCE="${1:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"

log() { printf '\033[1;36m==>\033[0m %s\n' "$*"; }

command -v gcloud >/dev/null || { echo "google-cloud-cli is not installed." >&2; exit 1; }

DEST="gs://$GCS_BUCKET/$GCS_PREFIX"

log "Uploading markdown from $SOURCE to $DEST"
while IFS= read -r -d '' file; do
  rel="${file#"$SOURCE"/}"
  gcloud storage cp "$file" "$DEST/$rel" \
    --content-type="text/markdown" \
    --cache-control="public, max-age=60"
  printf '   OK  %s\n' "$rel"
done < <(find "$SOURCE" \
  \( -path '*/node_modules' -o -path '*/.git' -o -path '*/dist' -o -path '*/patches' \) -prune -o \
  -type f \( -name '*.md' -o -name '*.mdx' \) -print0)

if [ -d "$SOURCE/public" ]; then
  log "Uploading static assets from $SOURCE/public"
  # Images are content-addressed by name and change rarely, so they get the long CDN TTL that
  # markdown deliberately doesn't.
  gcloud storage rsync "$SOURCE/public" "$DEST" --recursive \
    --cache-control="public, max-age=86400"
fi

log "Invalidating CDN cache"
gcloud compute url-maps invalidate-cdn-cache "$URL_MAP" --path "/$GCS_PREFIX/*" --async

log "Done. Assets are live at https://nwrks-cdn.public.prod.nuka.works/$GCS_PREFIX/"
