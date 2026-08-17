# Content upload — NukaWorks static assets

Infrastructure is provisioned by Terraform (see [`../terraform`](../terraform)). This folder holds
only the manual content-upload escape hatch.

## When you need this

You normally don't. Pages are edited through the site's own **Propose changes** flow: the editor
opens a pull request, and merging it runs `apply-patches.yml`, which writes the result straight to
the bucket. Reach for this script when there is no proposal to merge:

- seeding a brand-new bucket
- pushing a file that was never authored through the site
- restoring content after a bucket-level mistake

## Prerequisites

- [Google Cloud CLI](https://cloud.google.com/sdk/docs/install)
- `gcloud auth login` and `gcloud config set project <project-id>`
- Write access to the assets bucket (`roles/storage.objectAdmin`)

There is no key to pass in — the script uses your own logged-in credentials, which is why it
replaced the shared-key PowerShell scripts that lived here before.

## Usage

```bash
deploy/upload-content.sh              # uploads from the repo root
deploy/upload-content.sh ~/some/dir   # or from somewhere else
```

Overridable through the environment:

| Variable       | Default            | Meaning                              |
| -------------- | ------------------ | ------------------------------------ |
| `GCS_BUCKET`   | `nwrks-assets-prod` | Bucket holding the site's content    |
| `GCS_PREFIX`   | `static`           | Object-name prefix (see below)       |
| `GCP_URL_MAP`  | `nwrks-url-map`    | Load balancer URL map to invalidate  |

## Why the `static/` prefix

Objects live at `static/blog/welcome.md`, not `blog/welcome.md`. The old Azure setup served this
content from a container named `static`, making its public path `/static/blog/welcome.md`. Keeping
the name as a GCS object prefix reproduces that path exactly, so every image and link inside
already-published markdown kept resolving through the migration with no rewriting.

## What lands where

| What        | URL                                                        |
| ----------- | ---------------------------------------------------------- |
| Blog page   | `https://nwrks-cdn.public.prod.nuka.works/static/blog/index.md` |
| Static image| `https://nwrks-cdn.public.prod.nuka.works/static/cardboard.png` |
| Avatar      | `https://nwrks-cdn.public.prod.nuka.works/static/pfp.jpg`   |

Markdown is uploaded with `Cache-Control: public, max-age=60` and images with `max-age=86400`; the
script invalidates the CDN afterwards, so edits show up without waiting out either TTL.
