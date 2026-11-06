# Resend and Render production setup

This deployment uses one Node.js 24.x Render **Web Service**, SQLite on a persistent disk, Resend for email, and Cloudflare Turnstile for verification. The same service serves the website, accepts enquiries and runs its email worker.

An enquiry is acknowledged only after its record and two email jobs have been committed together. The worker sends the team notification and visitor confirmation separately. Website requests do not wait for email delivery.

## 1. Verify a sending domain

In Resend, add and verify a domain you own. Use `notify.cosmonet.ai` for this deployment, then add the DNS records shown for that exact domain. Wait for verification before setting the production sender. Follow [Resend’s domain guide](https://resend.com/docs/dashboard/domains/introduction).

Use:

```text
RESEND_FROM=Cosmonet <enquiries@notify.cosmonet.ai>
LEADS_TO=hello@cosmonet.ai
```

Create a Resend API key with sending access for the verified domain and store it as `RESEND_API_KEY` in Render. Never add it to HTML, browser JavaScript, a committed environment file or build output.

The sending subdomain is separate from the existing team mailbox. Keep the root domain’s mailbox/MX configuration in place; do not replace it to set up this sending subdomain. Replies to the team notification go to the visitor; replies to the confirmation go to `LEADS_TO`. The templates are in [EMAIL_TEMPLATES.md](EMAIL_TEMPLATES.md).

## 2. Configure Turnstile

Create a Cloudflare Turnstile widget for the exact production hostname(s). Add the final custom domain, and include a Render hostname only if the form will intentionally accept enquiries there.

Save its public key as `TURNSTILE_SITE_KEY` and its matching secret as `TURNSTILE_SECRET_KEY` in the Render service. This application verifies tokens on the server and checks the `contact` action. Production requires Turnstile and rejects the public test keys.

The site key may be sent to the browser. The secret stays on the server. See [Cloudflare’s server-side validation guide](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/).

## 3. Create the Render Web Service

Connect the repository and intended branch using `render.yaml`, or enter the equivalent settings manually:

| Setting | Value |
| --- | --- |
| Service type | Web Service |
| Runtime | Node.js 24.x |
| Instance | `0.5c-512mb` paid instance, 0.5 CPU / 512 MB |
| Build command | `npm ci --omit=dev && python3 build.py --production` |
| Start command | `npm start` |
| Health check path | `/healthz` |
| Persistent disk | 1 GB, mounted at `/var/data` |

Use these environment settings:

| Variable | Value or purpose |
| --- | --- |
| `NODE_ENV` | `production` |
| `SITE_URL` | Final HTTPS origin, such as `https://cosmonet.ai` |
| `DATA_DIR` | `/var/data` |
| `RESEND_API_KEY` | Secret sending API key |
| `RESEND_FROM` | `Cosmonet <enquiries@notify.cosmonet.ai>` |
| `LEADS_TO` | `hello@cosmonet.ai` |
| `TURNSTILE_SITE_KEY` | Public widget site key |
| `TURNSTILE_SECRET_KEY` | Secret widget verification key |
| `HASH_SECRET` | Separate random secret, at least 32 characters |
| `OPS_TOKEN` | Separate random secret, at least 32 characters |
| `RESEND_WEBHOOK_SECRET` | Optional signing secret for the webhook described below |
| `EMAIL_WORKER_ENABLED` | Leave enabled normally; set `false` during a database recovery review |
| `LEAD_RETENTION_DAYS` | Optional retention window; defaults to 180 days for records without pending email jobs |

Generate `HASH_SECRET` and `OPS_TOKEN` separately with a cryptographic generator, for example `openssl rand -hex 32`. Save their values in Render’s environment settings. Keep `HASH_SECRET` stable across restarts and deployments because it is used for request comparison and abuse-control identifiers. Protect the operational token and rotate it if exposed.

Enter Render values without surrounding quote characters. In a local dotenv file, quote a sender value containing spaces. `SITE_URL` must be an origin without a page path, query or fragment. It controls canonical URLs and accepted form origins. If an additional hostname will serve the form, configure its HTTPS origin in `ADDITIONAL_ORIGINS` as well as Render and Turnstile; keep that list limited to intended aliases.

The production build validates `SITE_URL` and prepares `dist/`; it does not need or embed email secrets. Production startup requires the server settings and a writable persistent data directory. Invalid or missing required settings fail startup rather than exposing a form that pretends to work.

`GET /api/form-config` returns only form availability, the public site key and client behavior settings. It never returns mail, verification, hash or operational secrets. In local development without credentials, the website stays browsable and the form provides the email fallback.

## 4. Understand the disk and deployment boundary

`DATA_DIR=/var/data` keeps `enquiries.sqlite`, its SQLite side files and local backups on the attached disk. Only files beneath the mount survive a redeploy or restart. Do not put the database in `dist/`, the repository, or an unmounted temporary directory.

Render attaches this disk to a single running instance. This setup therefore has brief deployment interruptions and cannot scale to multiple instances sharing that disk. It does not provide high availability. Move to a shared database such as PostgreSQL only when measured traffic, recovery or availability needs justify that change. See [Render’s persistent disk documentation](https://render.com/docs/disks).

Run disk operations from the live service’s Render Shell or SSH session. The disk is unavailable to build steps, pre-deploy commands and separate one-off jobs.

## 5. Monitor the application and mail queue

The public endpoints serve different purposes:

- `GET /healthz`: process liveness and shutdown state; used by Render.
- `GET /readyz`: whether the form configuration and database are ready.
- `GET /api/form-config`: browser configuration without secrets.

Readiness does not establish that an email has been delivered. Monitor the queue and Resend separately.

From the service shell, inspect counts with:

```sh
npm run queue:status
```

The authenticated endpoint `GET /api/ops/status` accepts `Authorization: Bearer [OPS_TOKEN]` and returns operational counts without enquiry content. Keep this token server-side; do not put it in a public monitoring page or browser script.

Each accepted enquiry consumes two email sends. Check Resend’s current sending limits and account quota, queue counts and oldest pending work, failed jobs, disk usage and application logs. Tests against mocks do not establish live Resend throughput or mailbox placement.

Transient transport errors are retried with backoff and provider delay handling. Provider quota/rate errors pause sending. Once the account or quota issue has been resolved, inspect the queue and resume delivery deliberately:

```sh
npm run queue:resume -- --confirm
```

Resend keeps idempotency keys for 24 hours. This application bounds automatic email retries to 23 hours and an attempt limit; exhausted or permanent failures are retained for manual review together with the lead. Review the provider records before resending uncertain or terminal failures. Avoid resetting job status or assigning a fresh provider key blindly. See [Resend’s idempotency documentation](https://resend.com/docs/dashboard/emails/idempotency-keys).

A full queue or storage failure returns a friendly failure instead of a successful receipt. The browser keeps the entered details and request ID for an unchanged retry. Changed details after an uncertain response require explicit confirmation as a new enquiry.

## 6. Back up and test recovery

The running service makes a consistent SQLite backup daily and keeps seven local copies. These copies share the application disk, so they do not protect against loss of that disk or account. Arrange a separate offsite copy and verify that it can be restored.

For an additional consistent backup, use the application command with a new absolute destination filename:

```sh
npm run backup -- /absolute/backupfile.sqlite
```

This uses SQLite’s backup API. Keep the destination outside `dist/` and any publicly served directory. Copying only the live database file can miss changes in its write-ahead log; use the backup command rather than copying the open database. Transfer the completed backup to the offsite location through your secured operational process.

Practice recovery in a separate environment first. For a production recovery:

1. Preserve a fresh consistent backup of the current state, then stop the service.
2. Set `EMAIL_WORKER_ENABLED=false` before starting against a restored database.
3. Restore the known consistent backup as `enquiries.sqlite` while the application is stopped. Do not carry stale SQLite side files from the previous database into the restored database.
4. Start with the worker disabled and validate the restored records and operational counts.
5. Reconcile queued and processing jobs with Resend’s records. A backup may show a job as unattempted even though it was sent after that backup was taken. Provider idempotency may already have expired, so do not assume that replaying the restored queue is safe.
6. Resolve uncertain jobs before enabling the worker and restarting normal delivery. Check the worker-enabled flag and queue counts in operational status.

An old backup does not guarantee exactly-once email recovery. Keep the worker disabled until uncertain sends have been reviewed.

## 7. Optional delivery-event webhook

For delivery visibility, create a Resend webhook pointing to:

```text
https://cosmonet.ai/api/resend/webhook
```

Use the actual `SITE_URL` origin. Subscribe to `email.sent`, `email.delivered`, `email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed` and `email.suppressed`. Copy that endpoint’s signing secret to `RESEND_WEBHOOK_SECRET`, and redeploy/restart the service with it set.

The endpoint verifies the Svix signature against the raw request body before recording supported events. Keep the signing secret on the server. Without that secret the endpoint is disabled. Follow [Resend’s webhook verification guide](https://resend.com/docs/webhooks/verify-webhooks-requests).

A provider acceptance records that Resend accepted the email. A delivered event records provider delivery information; it does not prove primary-inbox placement or that the recipient read the message. Review bounces and complaints before further sends.

## 8. Production acceptance test

After the real keys and DNS are configured, use one controlled enquiry from a mailbox you own:

1. Confirm HTTPS, the intended origin, `/healthz`, `/readyz` and Turnstile verification.
2. Check that invalid fields, missing consent and expired verification cannot create an enquiry.
3. Submit once and retain the server reference. Confirm that the enquiry and two jobs exist, then check both emails and their spam folders.
4. Verify From, Reply-To, subjects, references, content and HTML/plain-text rendering.
5. Confirm that repeating the unchanged request does not create another lead or pair of jobs.
6. Check queue counts and, if configured, signed delivery-event updates.
7. Restart/redeploy and verify that the saved enquiry, queue and backups remain available.
8. Take a consistent backup and complete a recovery rehearsal away from production.

Real DNS verification, CAPTCHA acceptance and mailbox delivery remain pending until this controlled test is performed. The automated backend and browser suites use mocks and send no real mail.

## Local verification commands

```sh
npm ci
npm run build
npm run check
npm test
npm run test:build
npm run test:browser
```

`npm run dev` loads `.env` and serves the Node API on port 3000 by default. `npm start` uses the existing build. The browser suite needs a Playwright browser; use `npx playwright install chromium` once, or select an existing Playwright installation and Chrome as described in the README.
