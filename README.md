<<<<<<< HEAD
# Amitista Studio — Web

The marketing site, client portal, and lightweight API surface for **Amitista Studio**, a development studio building websites, applications, interfaces, and game servers.

<p>
  <img alt="React" src="https://img.shields.io/badge/React-19-149ECA?logo=react&logoColor=white&labelColor=20232a" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646CFF?logo=vite&logoColor=white&labelColor=20232a" />
  <img alt="Tailwind CSS" src="https://img.shields.io/badge/Tailwind_CSS-4-38BDF8?logo=tailwindcss&logoColor=white&labelColor=20232a" />
  <img alt="Node" src="https://img.shields.io/badge/Node-%E2%89%A518-339933?logo=node.js&logoColor=white&labelColor=20232a" />
  <img alt="License" src="https://img.shields.io/badge/License-Proprietary-lightgrey?labelColor=20232a" />
</p>

<p>
  <img alt="Lint: oxlint" src="https://img.shields.io/badge/lint-oxlint-EA580C?labelColor=20232a" />
  <img alt="SSR: prerendered" src="https://img.shields.io/badge/SSR-prerendered-6D28D9?labelColor=20232a" />
  <img alt="CI" src="https://github.com/Amitistastudio/amitista-web/actions/workflows/ci.yml/badge.svg" />
</p>

## Contents

- [Overview](#overview)
- [Tech stack](#tech-stack)
- [Project structure](#project-structure)
- [Getting started](#getting-started)
- [Scripts](#scripts)
- [Environment variables](#environment-variables)
- [Deployment](#deployment)

## Overview

This repo is a React + Vite single-page app that is prerendered to static HTML per-route for SEO, plus a set of small Node/Python services (contact relay, admin API, API gateway) that sit behind it in production. It covers the public site (home, services, process, work, docs, FAQ, status, careers) as well as an admin dashboard and a lightweight public API.

## Tech stack

| Layer | Choice |
| --- | --- |
| UI | React 19, Tailwind CSS 4 |
| Build | Vite 8 (Rolldown), `@vitejs/plugin-react` |
| Rendering | Custom SSR entry (`src/entry-server.jsx`) + build-time prerender script |
| 3D / shaders | [`ogl`](https://github.com/oframe/ogl) (used by the `Silk` background) |
| Icons | `lucide-react` |
| Linting | `oxlint` |
| Backend services | Node & Python, deployed separately (see [`deploy/`](deploy)) |
=======
# Amitista Studio — website

The source for [amitista.com](https://amitista.com), Amitista Studio's public
site: a React + Vite front end, prerendered to static HTML, with a small set
of build scripts for fonts, images, sitemaps and other site-generation tasks.

## Stack

- [React 19](https://react.dev/) + [Vite](https://vitejs.dev/)
- [Tailwind CSS 4](https://tailwindcss.com/) (via `@tailwindcss/vite`)
- Prerendering to static HTML for every route (`scripts/prerender.mjs`)
- [oxlint](https://oxc.rs/) for linting

## Getting started

Requires Node 20+.

```sh
npm install
npm run dev
```

This starts the Vite dev server. A couple of routes proxy to local backend
services during development (see the `server.proxy` block in
[vite.config.js](vite.config.js)) — those services aren't part of this
repository's front-end build and don't need to be running for most UI work.

### Environment variables

Copy `.env.example` to `.env` and fill in what you need. The front end reads:

| Variable | Purpose |
| --- | --- |
| `VITE_CONTACT_ENDPOINT` | Where the contact form submits to (defaults to `/api/contact`) |
| `VITE_APPLY_ENDPOINT` | Where the "apply" form submits to (defaults to `/api/apply`) |
| `VITE_TURNSTILE_SITEKEY` | Cloudflare Turnstile site key for form spam protection |

None of these are required to run or build the site locally; forms simply
won't submit anywhere without matching backend endpoints.

## Scripts

| Command | Does |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (also regenerates the sitemap, prerenders every route, emits the static API responses, precompresses assets, and scans `dist/` for accidentally-leaked secrets) |
| `npm run preview` | Preview the production build locally |
| `npm run lint` | Run oxlint |
| `npm run fonts` | Fetch and subset the site's web fonts |
| `npm run images` | Derive responsive image sizes from source images |
| `npm run icons` | Derive favicons/app icons from the source logo |
>>>>>>> 76091f9bf717f375a1890fdc49ba3a3ceae9d4aa

## Project structure

```
<<<<<<< HEAD
├── src/
│   ├── components/     UI components (shared, admin, api, docs, legal, web1)
│   ├── content/        Static content & copy (services, team, FAQ, docs, etc.)
│   ├── lib/            Client-side utilities (search, status, forms, routing)
│   ├── pages/          Route-level page components
│   ├── entry-server.jsx  SSR render entry
│   └── main.jsx         Client entry
├── scripts/            Build-time tooling (sitemap, fonts, images, prerender, secrets scan)
├── public/             Static assets served as-is
├── deploy/             Ops: nginx, Cloudflare, admin-api, api-gateway, contact-relay, backups…
└── dist/               Build output (generated)
```

## Getting started

**Prerequisites:** Node.js ≥ 18

```bash
# install dependencies
npm install

# start the dev server
npm run dev

# build for production (also generates the sitemap, prerenders routes,
# emits the API, precompresses assets, and checks for leaked secrets)
npm run build

# preview a production build locally
npm run preview
```

## Scripts

| Command | Description |
| --- | --- |
| `npm run dev` | Start the Vite dev server |
| `npm run build` | Production build (sitemap → build → prerender → API → compress → secrets check) |
| `npm run preview` | Serve the built output locally |
| `npm run lint` | Run `oxlint` |
| `npm run sitemap` | Regenerate `sitemap.xml` |
| `npm run fonts` | Fetch and subset webfonts |
| `npm run images` | Derive responsive image variants |
| `npm run icons` | Derive app icons |
| `npm run landmask` | Derive the landmass/world map data |
| `npm run partner` | Fetch partner data and re-derive images |
| `npm run api` | Emit the static API output |
| `npm run check:secrets` | Scan `dist/` for accidentally leaked secrets |

## Environment variables

Copy `.env.example` to `.env` and fill in values as needed for local development (e.g. Turnstile keys, relay endpoints used by the contact/admin proxies in `vite.config.js`).

## Deployment

Production infrastructure lives in [`deploy/`](deploy) and is service-oriented:

- **`nginx` / `cloudflare` / `firewall`** — edge & reverse proxy configuration
- **`admin-api` / `api-gateway` / `contact-relay` / `ai-relay`** — backend services (tested in CI, see `.github/workflows/ci.yml`)
- **`firestore`** — data layer
- **`backup` / `autodeploy` / `healthcheck` / `errorwatch` / `perf-monitor` / `logrotate` / `initcwnd` / `mta-sts`** — operational tooling

See `deploy/deploy.sh` / `deploy/deploy-local.sh` for the deployment entry points.
=======
src/
  components/   Shared UI components
  pages/        Route-level page components
  content/      Static copy/content used by pages
  lib/          Client-side helpers
  App.jsx       Route table
scripts/        Node scripts used at build time (sitemap, prerender, fonts, images, secret scanning...)
public/         Static assets served as-is
brand/          Source brand assets (logo, icon originals)
deploy/         Production deployment and operations configuration for amitista.com
```

`deploy/` describes how the live site and its backend services are deployed
and operated — it isn't needed to build or run the front end locally.

## Contributing

Contributions are welcome — see [CONTRIBUTING.md](CONTRIBUTING.md) for how to
get set up, and please follow the [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

Found a security issue? Please don't open a public issue — see
[SECURITY.md](SECURITY.md) for how to report it privately.

## License

This project's source code is licensed under the [MIT License](LICENSE).

The Amitista name, wordmark and logo (including everything under
[brand/](brand/) and the logo/icon files in [public/](public/)) are **not**
covered by that license and may not be reused to represent your own project
or organization.
>>>>>>> 76091f9bf717f375a1890fdc49ba3a3ceae9d4aa
