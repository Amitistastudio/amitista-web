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

## Project structure

```
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
