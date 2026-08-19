# AGENTS.md

Working rules for humans and coding agents in this repository. Read this before making changes.

## What this is

`about-me` is the personal site behind `blog.nuka.works`. It has three parts:

| Part      | Location    | Stack                                                          |
| --------- | ----------- | -------------------------------------------------------------- |
| Frontend  | `src/`      | React 19 + TypeScript, Vite, SCSS. Root pnpm package.           |
| API       | `server/`   | Express 5 + TypeScript. Its own pnpm package.                   |
| Infra     | `terraform/`| Google Cloud: combined Cloud Run app, assets bucket, global ALB + Cloud CDN, Secret Manager, Workload Identity Federation. |

Content (markdown pages, images) does not live in git. It sits in the assets bucket under the
`static/` prefix and is edited through the API or the `patches/` flow described below.

The API remains a separate workspace package so its dependencies (`express`,
`@google-cloud/storage`, `octokit`) never reach the browser bundle. Production packages both builds
into one Cloud Run image: Express serves the Vite output and same-origin `/api` routes.

## Layout

```
src/Common/Components/   Reusable UI (AppModal, Skeleton, PageEditor, ...)
src/Common/Theme/        app.scss: the whole visual system, including :root palette tokens
src/Modules/             Page-level features (FileViewer, Header, Footer)
src/Services/            Router, auth, api client, palette, paths, config
server/src/routes/       Express route handlers
server/src/services/     Storage, GitHub, markdown rendering
```

## Commands

Package manager is pnpm (pinned via `packageManager`). Run from the repo root:

```
pnpm install
pnpm dev          # Vite dev server
pnpm build        # tsc --noEmit && vite build
pnpm typecheck
pnpm lint         # eslint .; pnpm lint:fix to autofix
```

For the API: `pnpm --filter aboutme-server dev` (tsx watch), `... build`, `... typecheck`.

There is no test suite. Verification therefore means: `pnpm typecheck`, `pnpm lint`, and a real
`pnpm build` before you commit. If a change is visual, say plainly that it was not confirmed in a
browser rather than implying it was.

## Branching and git workflow

Two long-lived branches:

- `develop`: where work lands.
- `main`: what deploys. Receives `develop` through merge commits subjected
  `Merge branch 'develop' into main: <topic>`.

CI pushes `chore: bump build number to N [skip ci]` commits directly to `main` on every deploy, so
`main` is routinely ahead of `develop`. Always `git fetch` and fast-forward before merging or
pushing, or the push is rejected.

### Hotfixes go to both branches

A hotfix exists because production is currently wrong, and `main` is the deploying branch. A fix
parked on `develop` until the next release merge fixes nothing for visitors.

So: **when the user asks to push a hotfix, commit and push it on both branches.** Land the commit
on one branch, push, then cherry-pick that same commit onto the other and push that too. Confirm
both branches are in sync with `origin` afterwards. Cherry-picking (rather than only merging)
keeps both branches carrying the fix immediately, so neither the next deploy from `main` nor the
next feature merge from `develop` can silently drop or revert it.

Normal feature work still follows the plain `develop` to `main` merge flow.

### Commit messages

Subject convention is `Area::Component:: Summary`, for example:

```
Web::FileViewer:: Replay the Metro entrance animation once the page has loaded
Web::Theming:: Hotfix: restore text-shadow on h1-h6 titles
Infra::IAM:: Grant CI bucket-level read on both buckets
Server::Services::BlobStorageService: Use the object prefix from config
```

Areas in use: `Web`, `Server`, `Infra`, `CI`, `Common`, and `+` combinations such as
`Web+Server::` or `Infra::CloudRun+CDN::`.

Use colons rather than dashes or em dashes as separators in commit messages. Hotfixes carry a
`Hotfix:` marker after the component.

Explain why in the body, not just what. Agents end commit messages with:

```
Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>
```

Commit and push only when asked.

## Theming: never hardcode a color

The palette is derived at runtime. `src/Services/palette.ts` samples the current wallpaper for its
dominant hue and overall luminance, then rewrites the `--color-*` custom properties through one
shared saturation/lightness ramp, checking every derived color against WCAG relative luminance and
nudging it lighter until it clears the minimum ratio for its role. A wallpaper bright enough to
wash out text also gets a scrim.

Consequences for any change that touches color:

- Style against the `--color-*` tokens. A literal hex or `rgba()` in a rule will not follow the
  wallpaper, and will visibly disagree with the tokens around it on a non-default photo.
- Every token needs a static fallback in the `:root` block of `src/Common/Theme/app.scss`. Palette
  sampling resolves to null on failure (404, CORS-tainted canvas), which deliberately leaves the
  static palette in place.
- New tokens belong in `buildPaletteVars()` alongside the existing ones, built from the same
  `hue` and `scale()` ramp so they desaturate consistently with everything else.
- Text roles are checked against the dark chrome luminance, not the wallpaper, because that is
  what they actually sit on. Keep alpha values when refactoring a surface: changing them changes
  contrast for the text on top.

Animations follow the Metro entrance idiom (`metro-enter`: slide in from the right). CSS
mount-time animations only replay if the node is actually remounted, so React `key` values are
load-bearing for them. Respect `prefers-reduced-motion`.

## Deploy pipelines

| Workflow            | Trigger                                       | Effect                                     |
| ------------------- | --------------------------------------------- | ------------------------------------------ |
| `build-check.yml`   | push to `develop`, PRs into `develop`/`main`  | Compile only, no credentials               |
| `deploy-web.yml`    | push to `main` (ignores `patches/`, Terraform)| Bumps `version.json`, builds and deploys the combined Cloud Run image |
| `apply-patches.yml` | push to `main` adding `patches/**/*.patch`    | Applies content patches to the assets bucket |
| `check-patches.yml` | `pull_request_target` on patch PRs            | Validates visitor-proposed content patches |

Deploys authenticate through Workload Identity Federation, never a service-account key.

`patches/` holds content proposals from the site's "propose changes" feature. They are inert data
applied to bucket objects: never execute patch content, and note that proposal PRs come from forks.

## Infrastructure notes

- Terraform state lives in `gs://nwrks-tfstate-prod`. Apply with
  `terraform -chdir=terraform apply -var project_id=<project>`.
- Do not change `assets_prefix`. Objects sit under `static/` so that published markdown keeps the
  exact public paths it had before the Azure migration. Changing it breaks every existing link.
- `blog.nuka.works` and `/api` share the blog Cloud Run backend. Cloud CDN uses origin cache
  headers, so API routes must stay private/no-store unless the response is intentionally public.
- The old Azure stack was decommissioned in August 2026. `scripts/migrate-azure-to-gcp.sh` is kept
  for its historical record of the migration; it no longer has live resources to act on.

## House rules

- Match the surrounding code: this codebase comments the *why* behind non-obvious decisions, and
  new code is expected to do the same.
- `dist/` is build output and is gitignored. Never commit it.
- Do not add dependencies (including dev dependencies) for a small fix without asking.
- Secrets come from Secret Manager or repository secrets. Never commit one, and never put a real
  value in `.env.example`.
- Report outcomes honestly: if a check was skipped or could not run here, say which and why.
