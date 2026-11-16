# Architecture

## Components

| Piece | Where | Job |
|---|---|---|
| `src/worker.js` | Cloudflare Worker | Serves the pages, the public summary, the admin API and auth |
| `src/lib.js` | shared module | Pure functions: categorizer, public summary, event rules, loose ends, demo data. Unit-tested |
| `src/public.html`, `public.js.txt` | static, served by the Worker | Portfolio page and `/demo` |
| `src/admin.html`, `admin.js.txt` | static, served by the Worker | Admin console |
| D1 `jobsearch-db` | Cloudflare | All data (see DATA_MODEL.md) |
| Scheduled agents | Claude, outside this repo | Scan, apply, read email, push to the API |

The browser files use the `.txt` extension for scripts so Wrangler bundles them as text modules; the Worker serves them with a JavaScript content type.

## Request flow

1. `GET /` returns the page; the page calls `GET /api/public`.
2. The Worker reads the minimal columns from D1, loads the visibility settings and runs `publicSummary()`. The response is cached for 60 seconds.
3. `GET /admin` returns the console; it calls `GET /api/session`, and shows the sign-in form or loads data.
4. Writes from the console use a signed, HttpOnly, SameSite=Strict cookie, with an Origin check on top.
5. Agents use `Authorization: Bearer <API_TOKEN>`.

## Data in from automation

- **Applications:** after each run, the agent sends every submission and every queued role to `POST /api/roles/bulk`. It is an upsert on (company, title), so re-sending is safe.
- **Email sync:** the agent reads Gmail and Outlook through its connectors and sends `POST /api/events` with `kind` = `confirmation`, `interview_invite`, `assessment`, `rejection` or `offer`. Each event moves the role forward (`stageAfterEvent`), never backward, and duplicates on the same day are ignored. An interview invite also creates an interview record.
- **Interview prep:** when Chris presses **Request research brief**, the interview's `prep_status` becomes `requested`. The next agent run looks for those, researches the company and role, writes the brief into `prep_notes` with `PATCH /api/interviews/:id` and sets `prep_status = ready`.

The Worker never holds email or LinkedIn credentials. Mailbox and LinkedIn access stay with the agent's own connectors and the signed-in browser.

## Security

- Admin password, session secret and API token are Worker secrets, never in the repo.
- Constant-time comparisons for password and token; a fixed 400 ms delay on sign-in.
- CSP: scripts from self only; no inline scripts; `frame-ancestors 'none'`.
- The public form has a honeypot field, length limits and a per-email daily cap.
- `/admin` and `/api/` are `noindex` and disallowed in robots.txt.
