# Deploying to Vercel

Vector Engine deploys as a static Vite application. The C++ engine is already compiled to WebAssembly and is copied into the production output by Vite.

## Dashboard deployment

1. Push the repository to GitHub, GitLab, or Bitbucket.
2. Import the repository in Vercel.
3. Keep the project Root Directory at the repository root.
4. Vercel reads `vercel.json`; no build or output overrides are required.
5. Deploy.

The committed configuration uses:

| Setting | Value |
|---|---|
| Framework | Vite |
| Install command | `npm ci` |
| Build command | `npm run build` |
| Output directory | `apps/web/dist` |
| Node.js | 22.x or newer (`.nvmrc` pins 24 locally) |

Repository settings you must keep:

- **Root Directory**: repository root.
- **Framework Preset**: Vite (already in `vercel.json`; no dashboard override).
- **Build & Output Settings**: leave the dashboard defaults untouched so `vercel.json` wins.
- **Environment variables**: none required. The build is fully static and reads no secrets.

Do not set the Root Directory to `apps/web`. The root workspace owns the lockfile, deployment configuration, schema import, and WebAssembly verification step.

`.vercelignore` keeps the upload small: native `engine/` sources, tests, Playwright specs, docs, and local build output are not sent to Vercel, while `package.json`, `package-lock.json`, `scripts/`, `schemas/`, and `apps/web` (including `public/wasm`) stay available to the build.

## CLI deployment

Authenticate once and deploy from the repository root:

```bash
npx vercel          # preview deployment
npx vercel --prod   # production deployment
```

The first run links the project (`.vercel/` is git-ignored) and prints both URLs.

## WebAssembly delivery

The deployment serves:

```text
/wasm/vector_engine.js
/wasm/vector_engine.wasm
```

`vercel.json` supplies the `application/wasm` content type, same-origin resource policy, and revalidation caching for the stable WebAssembly filenames. The root build verifies the JavaScript factory and WebAssembly magic header before running Vite.

## Routing

The SPA rewrite sends application routes to `index.html`. Vercel serves existing static files such as `/assets/*` and `/wasm/*` directly. Fingerprinted Vite assets receive immutable one-year caching, while the HTML document and stable WebAssembly filenames revalidate.

## Security headers

The deployment adds a restrictive Content Security Policy compatible with Emscripten, blob-backed SVG previews, CodeMirror styles, and future local workers. Ajv compiles the JSON Schema into a standalone module during the build, and Emscripten disables dynamic JavaScript execution, so the policy does not require unrestricted `unsafe-eval`. The configuration also disables framing, MIME sniffing, camera, microphone, and geolocation access.

## Preview of the production build

Reproduce the deployed output locally before shipping:

```bash
npm run build
npm run verify:deployment
npm run preview --workspace @vector-engine/web
```

`verify:deployment` checks the Vercel output directory, the SPA fallback, the
WebAssembly MIME type and magic header, the CSP, and that the minified
stylesheet still contains all 11 monitor-resolution breakpoints (from 1280 px to
5120 px, see [responsive breakpoints](responsive-breakpoints.md)).

## Verification after deployment

Check the following URLs, replacing the domain with the deployment URL:

```text
https://your-project.vercel.app/
https://your-project.vercel.app/wasm/vector_engine.js
https://your-project.vercel.app/wasm/vector_engine.wasm
```

The status bar should display `C++23 · WebAssembly`. Export a PNG and verify that the downloaded file opens correctly. Resize the window or open the deployment on a 1366×768 laptop, a 1920×1080 monitor, and a 21:9 ultrawide screen: the four workspace columns must stay readable and the canvas must keep its minimum width.

Useful HTTP checks:

```bash
curl -I https://your-project.vercel.app/
curl -I https://your-project.vercel.app/wasm/vector_engine.wasm
```

The WebAssembly response should return `200` with `Content-Type: application/wasm`.
