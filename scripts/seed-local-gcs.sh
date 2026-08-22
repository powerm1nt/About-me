#!/usr/bin/env bash
# Copies the site's published content out of the real bucket into .local/gcs/, where the
# fake-gcs-server in the compose stacks serves it. Run once, then again whenever the live content
# has moved on enough to matter.
#
# This reads from Google Cloud using whatever credentials the host already has; nothing in the
# compose stack itself ever reaches production.
set -euo pipefail

BUCKET="${1:-hisuiki-assets-prod}"
DEST="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/.local/gcs/${BUCKET}"

if ! command -v gcloud >/dev/null 2>&1; then
  echo "gcloud is not installed; cannot copy the seed content." >&2
  exit 1
fi

mkdir -p "$DEST"
# fake-gcs-server derives its buckets from the directories under /data, so the data bucket has to
# exist even when it is empty — otherwise the first post fails with a 404 from the emulator.
mkdir -p "$(dirname "$DEST")/hisuiki-data-prod"
echo "Copying gs://${BUCKET} into ${DEST} ..."
gcloud storage rsync -r "gs://${BUCKET}" "$DEST"

echo
echo "Seeded $(find "$DEST" -type f | wc -l) objects."
echo "The compose stacks mount .local/gcs, so restart them to pick this up."
