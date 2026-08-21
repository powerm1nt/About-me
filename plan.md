# Hisuiki — handover

Written 21 Aug 2026, at the end of the session that migrated this project from `About-me` on
NukaWorks Prod to **Hisuiki** on its own GCP project. Read `AGENTS.md` first for the working rules;
this document is only about what is done, what is not, and what will bite you.

Hisuiki is a **media sharing and blogging platform**, not a personal site. That reframing is recent
and most of the product still behaves like the personal site it grew out of.

---

## 1. Read this before you deploy anything

### The migration history is a landmine

Production's `_prisma_migrations` table records two migrations under names that **no longer exist in
the repository**:

| In the database (old)              | In `server/prisma/migrations/` (new) |
| ---------------------------------- | ------------------------------------ |
| `20260821150237_account_issuer`     | `20260821190000_account_issuer`      |
| `20260821163017_cms`                | `20260821190100_cms`                 |

They were renamed because the originals were created with `date` in **local time** while Prisma's own
`migrate dev` used **UTC**, so they sorted *before* the `init` migration that creates the tables they
alter. Harmless against the existing database, fatal against an empty one.

The API now runs `prisma migrate deploy` at startup and **exits if it fails**. So the next deploy
will see two apparently-new migrations, fail to apply them (the columns already exist), and the
revision will never become ready. Cloud Run will keep serving the old revision, so this is not an
outage — but nothing will ship until it is fixed.

**Fix, before any deploy:**

1. Build and push a current image (see §4), then point the migration job at it:
   `gcloud run jobs update hisuiki-migrate --image <image> --region northamerica-northeast1 --project hisuiki`
2. For each renamed migration, override the job's args to
   `exec prisma migrate resolve --applied <new name>` and execute it.
3. Restore the job's args to `exec prisma migrate deploy`.

`resolve --applied` records a migration as done without running its SQL, which is what you want:
the schema is already correct. The two old rows can be left; they are inert.

### The database is unreachable from a workstation

Cloud SQL has **no public IP** — it lives on the `hisuiki-net` VPC and Cloud Run reaches it through
Direct VPC egress. `cloud-sql-proxy` on your machine cannot connect. Anything requiring SQL runs
either from the `hisuiki-migrate` Cloud Run job or from a container inside the VPC.

Local development uses its own Postgres in Docker and never touches this instance.

### Other outstanding items

- **Wildcard certificate is stuck.** `hisuiki-wildcard-cert` covers `hisuiki.com` and
  `*.hisuiki.com` but is `PROVISIONING`, blocked on DNS: `_acme-challenge.hisuiki.com` has the
  correct CNAME *plus* two stale TXT records. A name holding a CNAME may hold nothing else — the TXT
  records win, so Google reads the wrong tokens. **Delete the two TXT records**, then once the
  certificate is `ACTIVE`, set `wildcard_cert_active = true` and apply to move the load balancer onto
  it. Do not flip it before that: attaching an unissued certificate map drops HTTPS for every host.
- **Dangling DNS.** `nuka.works` and `nwrks-cdn.public.prod.nuka.works` still point at
  `34.120.73.20`, an address no longer reserved in any of the three projects. A released Google IP
  returns to the pool and can be reallocated — that is a subdomain-takeover setup. Delete or repoint
  those records.
- **Safe Browsing flagged the site as deceptive.** Cause was almost certainly the page declaring a
  canonical identity on another domain while offering GitHub/Google sign-in from a brand-new one.
  The metadata is fixed and deployed; a review still has to be requested in Google Search Console.

---

## 2. What exists and works

**Infrastructure** (project `hisuiki`, all Terraform in `terraform/`, state in
`gs://hisuiki-tfstate-prod`):

- `hisuiki.com` → `hisuiki-web` Cloud Run, `api.hisuiki.com` → `hisuiki-api`, `cdn.hisuiki.com` →
  the assets bucket through Cloud CDN. One image, two services, split by `APP_ROLE`.
- Cloud SQL Postgres 17 (`hisuiki-pg`), Enterprise edition, private IP only.
- `gs://hisuiki-assets-prod` — published markdown and images, versioned. Content was migrated here
  from the retired project and the old bucket deleted.
- CI deploys on push to `main` and is fully green: build, both services, CDN invalidation.

**Application:**

- Sign-in through better-auth: GitHub, Google, and email/password. GitHub is configured and working;
  Google's client secret is still Terraform's placeholder.
- Markdown pages read from the bucket; the editor writes back to it with the commit message stored in
  object metadata, and page history is reconstructed from object generations.
- A photo gallery at `/photos` with likes and comments — this predates the CMS model and still stores
  its data as **JSON in the bucket**, not in Postgres (see §3).

**Local development** — `docker compose -f docker-compose.dev.yml up`:

| URL                     | What                                       |
| ----------------------- | ------------------------------------------ |
| `http://localhost:5173` | the app (Vite, hot reload)                  |
| `http://localhost:5066` | the API directly                            |
| `http://localhost:8083` | dbgate, for Postgres                        |
| `http://localhost:4443` | fake-gcs-server                             |

Nothing in either stack can reach production: Postgres is local and object storage is an emulator,
seeded by `./scripts/seed-local-gcs.sh`. `docker compose up --build` runs the production-shaped
stack on 8080/8081, which reproduces the two-origin CORS and cookie behaviour that development hides.

---

## 3. The CMS: decided, built, and not built

### Decisions already made — do not relitigate without reason

| Decision | Why |
| -------- | --- |
| **Handle is its own column** on `Profile`, separate from display name and login | Emi's account can be named "Emi (powerm1nt)" while living at `emi.hisuiki.com` |
| **User CSS is scoped and sanitised**, not unrestricted | A stylesheet can exfiltrate content through attribute selectors and background requests, and cover the real UI to harvest clicks |
| **HTML goes through `sanitize-html`**, plus a per-post `<style>` block scoped to that post | Hand-rolled sanitising is how XSS ships |
| **Posts and articles are one `Post` model** | They differ only in whether there are attachments and a title; comments, likes, reposts and the feed apply identically |
| **Media lives at `hisuiki-data-prod/{user.id}/{file.id}{ext}`**, assets bucket keeps common site files | User uploads and site chrome have different lifecycles and different deletion rules |

### Built

- **Schema**, migrated and live: `Profile` (handle, headline, bio, `customCss`, `wallpaperPath`,
  `avatarPath`, `accentColor`, `headerLinks` JSON, `showProfileLink`), `Post`, `PostMedia`,
  `Comment`, `Like`, `Repost`, `ProfilePage` (with `isHome` to override the profile landing).
  Columns added to better-auth's `user` table are all nullable — it inserts rows knowing only its own
  fields.
- **`server/src/services/userContent.ts`** — `renderUserHtml` (allow-list, not block-list) and
  `scopeCss` (confines every selector to the author's container; drops `position: fixed`/`sticky`,
  `pointer-events`, `@import`, external `url()`). Covered by 15 tests:
  `pnpm --filter hisuiki-server test:security`. **Nothing calls either function yet.**

### Not built — the actual remaining work

Suggested order, because each depends on the ones above it.

1. **`hisuiki-data-prod` bucket** — add to `terraform/storage.tf`, versioned, private (served through
   the CDN or signed URLs, not `allUsers`). Give `hisuiki-api` `objectAdmin` on it.
2. **Profile and handle resolution** — settle a handle in settings, reserve `www`, `api`, `cdn`,
   `admin`, `static`; resolve the profile from the `Host` header so `emi.hisuiki.com` serves that
   user. `GET /api/photos` already takes an `?author=` filter, added in anticipation.
3. **Posts API** — create/edit/delete, with media upload writing into the data bucket, comments,
   likes, reposts. Render through `userContent.ts` and cache `renderedHtml`.
4. **Landing page** at `hisuiki.com`: `for-you` (feed of publications, the default), `explore`
   (discovery), `about` (what Hisuiki is). Today `/` renders `README.md` — Emi's personal page —
   which is why the site still reads as a personal site.
5. **Profile Settings** — reachable from the avatar in the header and from the
   "{user.name}'s profile" header entry (which the user can remove; that is what `showProfileLink`
   is for). Sections: profile, header links, customisation (CSS, wallpaper, accent), pages, and
   **advanced → delete account**.
6. **Header profile menu** — on the avatar: sign out / sign in, settings.
7. **Migrate Emi's content** — create the `powerm1nt` user with handle `emi`, move the existing
   markdown and photo posts to it as `Post` rows referencing bucket objects, and make
   `emi.hisuiki.com` the canonical home for it.
8. **Move the photo gallery's JSON store into Postgres.** `server/src/services/photos.ts` is the
   seam: the routes speak in posts, likes and comments and never learn where they live, so only that
   module's function bodies change. Write a one-shot script that reads `photos/index.json` and the
   social documents so nothing posted before the cutover is lost.

Also pending and unrelated to the CMS: the per-post `<style>` block is supported by the renderer but
no editor exposes it, and Google sign-in needs its real client secret.

---

## 4. Working notes that cost time to learn

- **The GitHub repository is `powerm1nt/Hisuiki`**, renamed from `About-me`. GitHub redirects the old
  name for git and the API, so nothing notices — except Workload Identity, which matches the real
  `repository` claim and fails with *"the given credential is rejected by the attribute condition"*.
- **There are two similar projects: `hisuiki` and `hisuika`.** `hisuika` is the unrelated JADE
  application. Check `gcloud config get project` before running anything.
- **Building images locally does not work.** This workstation is arm64, Cloud Run is amd64, and
  cross-building through QEMU segfaults during `pnpm build`. Use Cloud Build:
  `gcloud builds submit --config <config> --substitutions=_IMAGE=<image> --service-account=projects/hisuiki/serviceAccounts/<n>-compute@developer.gserviceaccount.com`.
  New GCP projects have no legacy Cloud Build service account, so `--service-account` is required
  even for a project owner. CI on GitHub runs amd64 natively and needs none of this.
- **Cloud Run resolves `secret_key_ref` when it creates a service** and refuses a secret with no
  versions. That is why Terraform owns a placeholder first version of each OAuth secret; real values
  are added as version 2 and the placeholder is disabled by hand (`lifecycle.ignore_changes` keeps
  Terraform from re-enabling it).
- **`timeout_sec` is rejected on a backend service fronting a serverless NEG.** Cloud Run's own
  request timeout applies instead.
- **Cloud SQL shared-core tiers only exist on the Enterprise edition**; new instances default to
  Enterprise Plus, which rejects `db-f1-micro` outright.
- **`sanitize-html` applies its allow-list *after* transforms**, so an attribute a transform adds is
  stripped again unless the allow-list names it. This silently undid `rel="noopener"` once.
- **Vite's proxy rewrites `Host`** when `changeOrigin` is set, so anything server-side that builds a
  URL from `req.get("host")` leaks the container name to the browser. Return paths, not absolute URLs.
- **Postgres 18 images** keep data in a major-version subdirectory and refuse to start when the old
  `/var/lib/postgresql/data` path is mounted.
- **Never let a container run `prisma generate` into a bind mount** — the output lands on the host
  owned by root and the next host-side generate fails with `EACCES`. The dev compose masks that path
  with an anonymous volume.

---

## 5. Verification

There is still no general test suite. Before committing:

```
pnpm typecheck && pnpm lint && pnpm build
pnpm --filter hisuiki-server typecheck
pnpm --filter hisuiki-server test:security   # the sanitiser's 15 checks
terraform -chdir=terraform fmt -check && terraform -chdir=terraform validate
```

The security checks are not optional for anything touching `userContent.ts`: they are the boundary
untrusted input crosses.

Say plainly when something was not verified in a browser. Much of what is described above was
confirmed with `curl` against the live services; the visual result of most of it was not.
