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

## Project structure

```
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
