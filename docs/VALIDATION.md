# Resend enquiry service validation

Local verification completed on 6 November 2026. External CAPTCHA and email services were mocked. No real emails were sent and no Render deployment was performed.

| Check | Result |
| --- | --- |
| Backend suite | 70/70 tests passed with `node --test test/*.test.js`, the command behind `npm test` |
| Build suite | 6/6 Python tests passed |
| Website check | 40 pages, 3,983 local references, JavaScript syntax and public build isolation passed |
| Browser scenarios | 31/31 groups passed, including 20 email examples and 10/50 simultaneous forms |
| Built website with Express | 33 checks across six desktop/mobile page states passed |
| Development startup | `npm --prefix . run dev` started; health returned 200; missing keys safely disabled sending; SIGINT shutdown completed |
| Render blueprint | Passed Render's published JSON schema |
| Production dependency audit | No known vulnerabilities reported by the audit at verification time |

The backend suite covers validation, origin restrictions, CAPTCHA failures/timeouts, durable rate limits, request conflicts and duplicate retries, queue limits, transaction rollback, storage failures, provider timeouts and response limits, retry deadlines, quota pauses, graceful shutdown, signed webhook verification and reordering, and operational log privacy.

Real SQLite tests kill a child process after a committed enquiry, reopen its WAL database and confirm that the lead and both email jobs survive. Other cases cover concurrent connections, expired lease fencing, immutable email snapshots, consistent backups, concurrent backup destinations, simulated backup write failure cleanup, and private storage paths/permissions. Simulated write faults do not establish behavior under every physical disk or host failure.

The final browser smoke serves the actual `dist/` through Express and calls the real configuration and enquiry endpoints using isolated SQLite. One submission returned a server reference and saved exactly one lead plus two queued jobs. Home graphics, software video, mobile layout and security policy passed with no page errors, policy violations, failed asset responses or unexpected external network. Only Turnstile was mocked, and no email worker was started. The HTTP loopback fixture removes only the policy's HTTPS upgrade directive; the other production directives remain active.

## Local traffic tests

The load harness uses real Express and SQLite, synthetic enquiries, raised abuse limits, mocked CAPTCHA/Resend and zero send cadence for the test only.

| Scenario | Result |
| --- | --- |
| 100 new enquiries, concurrency 5 | All saved; response p95 72 ms |
| 1,000 new enquiries, concurrency 50 | All saved; response p95 235 ms |
| 100 unchanged retries, concurrency 100 | One original reference; no extra enquiries |
| 100 conflicting retries, concurrency 50 | All rejected with 409 |
| Reopen database after requests | All 1,100 enquiries retained |
| Drain saved email queue | 2,200 jobs; 2,200 unique mocked acceptances; no failed jobs |

These measurements describe this local harness. Production keeps its protective rate limits and a default 600 ms interval between sends, subject to Resend's actual account limits. The results do not establish Render capacity, live provider throughput, inbox placement or an availability guarantee. One persistent disk supports one application instance and has deployment interruptions.

Generated reports are `test-results/api-load.json`, `test-results/form-browser.json` and `test-results/express-browser.json`. Backend, browser and load commands are documented in the README; the final Express smoke report records its exact scope.

## Before launch

Follow [RESEND_SETUP.md](RESEND_SETUP.md): configure the Render Web Service and persistent disk, final HTTPS origin, Resend sender/domain and API key, Turnstile keys and operational secrets. Then submit from a mailbox you control on the real website and verify the team notification, visitor confirmation, From/Reply-To, spam folders, restart persistence and monitoring. Configure signed delivery events if required and complete an offsite backup/recovery rehearsal.

A form receipt confirms that the enquiry and its email jobs were saved. Resend acceptance and delivery events are separate later states. DNS verification and real mailbox delivery remain unverified until the controlled production test.
