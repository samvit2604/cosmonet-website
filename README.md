# Cosmonet website

Cosmonet’s 40-page marketing website runs as one Node.js service. It serves the built HTML, CSS and assets, saves enquiries in SQLite on a persistent disk, and sends two queued emails through Resend: a team notification and a visitor confirmation. Cloudflare Turnstile protects the production form.

The page shows a receipt only after the enquiry and both email jobs have been saved. Email delivery runs separately; a receipt confirms storage, not inbox delivery.

## Local development

Use Node.js 24.x and Python 3.10 or newer.

```sh
npm ci
npm run dev
```

Open http://localhost:3000/. The development command loads `.env` through dotenv and builds the static files before starting Node. Start from `.env.example`, use `SITE_URL=http://localhost:3000`, and keep local data in `.data`. Run `npm run build` after changes to the static website files, then refresh the browser.

If npm stalls while reading a cloud-only `package.json` in a parent folder on macOS, use `npm --prefix . run dev` from this repository. This selects the project directly. To use another port, set both values, for example `PORT=3018 SITE_URL=http://localhost:3018 npm --prefix . run dev`.

Without mail and verification credentials, the site remains browsable and the form shows its email fallback. The automated tests supply mocks; real credentials are not needed to test the form. A Python static file server cannot run the enquiry API.

`npm start` serves the existing `dist/` build and starts the API and email worker. It does not rebuild the site.

## Production

Follow [the Resend and Render setup guide](docs/RESEND_SETUP.md). The deployment uses one paid Render **Web Service**, Node.js 24.x, and a 1 GB persistent disk mounted at `/var/data`.

| Setting | Value |
| --- | --- |
| Build command | `npm ci --omit=dev && python3 build.py --production` |
| Start command | `npm start` |
| Health check | `/healthz` |
| Runtime data directory | `DATA_DIR=/var/data` |

Set the production origin and server credentials in Render. The production build validates `SITE_URL`; it does not embed email secrets. Production startup rejects missing required mail, verification and operational settings. Only availability information and the public Turnstile site key are returned by `/api/form-config`.

SQLite data, its email queue and backups must live on the persistent disk. Files outside the mount are ephemeral. This deployment runs one instance and has brief interruptions during deploys; it is not a high-availability setup. See the guide for backups, queue monitoring and recovery.

## Enquiry behavior

The browser submits JSON to this service’s `/api/leads` endpoint. The server validates the fields and consent, checks origin and abuse limits, verifies Turnstile, and stores the enquiry and two email jobs together. It returns the saved reference without waiting for Resend or SMTP delivery.

Unchanged retries reuse the same request ID, including after an uncertain timeout. If details change after an uncertain result, the user must explicitly confirm sending a new enquiry. Errors preserve the entered details, verification resets after each attempt, and overlapping clicks are blocked.

Email jobs have independent delivery states and stable provider idempotency keys. Transient failures are retried within a bounded window. Terminal failures retain the enquiry for operator review. The sender, recipient, templates and Reply-To behavior are documented in [EMAIL_TEMPLATES.md](docs/EMAIL_TEMPLATES.md).

## Checks

```sh
npm run build
npm run check
npm test
npm run test:build
npm run test:browser
```

`npm test` runs the Node backend checks; `npm run test:build` runs the Python build checks. The browser suite needs the Playwright development dependency and an installed Chromium/Chrome browser. Install a browser once with `npx playwright install chromium`, or select an existing installation using `PLAYWRIGHT_MODULE=/absolute/path/to/playwright` and `PLAYWRIGHT_CHANNEL=chrome`.

Browser and backend tests use synthetic data and mocked external services. They do not send real enquiries, verify DNS or mailbox delivery, or establish live provider capacity. A controlled production-domain email test remains necessary after real credentials are configured.

## Source history and ownership

This repository began as a public frontend export captured on 3 November 2026. `SHA256SUMS` records the original captured files. Later website and server changes intentionally differ from that historical manifest.

Branding, text and assets remain subject to their owners’ rights; no new license is granted.
