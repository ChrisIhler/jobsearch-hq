# Job Search HQ

A public portfolio page and a private command center for an AI-assisted job search.

**Live:** https://jobsearch-hq.ihlerconsulting.workers.dev · **Demo (fictional data):** https://jobsearch-hq.ihlerconsulting.workers.dev/demo

I'm Chris Ihler. I run my job search as a pipeline: scheduled Claude Code agents scan several hundred company job boards (Greenhouse, Ashby, Lever) plus LinkedIn and job-alert email, tailor a resume and cover letter for each role, and submit the applications whose forms need only facts already on file. Everything that needs a person (an account, an assessment, a video, a judgment call) is routed to me in two tiers. This app is where all of it lands.

## What it does

| Area | Public page `/` | Admin `/admin` (password) |
|---|---|---|
| Totals: overall, month, week, latest day | ✓ (toggle) | ✓ |
| Applications per day, automatic vs. manual | ✓ (toggle) | ✓ |
| Breakdown by role category | ✓ (toggle, per category) | ✓ |
| Company names | off by default | ✓ |
| Pipeline: applied → confirmed → interview → offer | off by default | ✓ |
| Exact titles, pay, notes, links | never | ✓ |
| Add / edit / filter roles and companies | | ✓ |
| Loose ends (no confirmation email, needs-you tiers, deadlines, missing feedback) | | ✓ |
| Interviews: research-brief requests, post-interview rating and feedback | | ✓ |
| "Request more access" form | ✓ (toggle) | inbox with approve/decline |

`/demo` renders the same page from a generated dataset of invented companies and is labeled as a demo on the page itself.

## How it fits together

```
 scheduled agents (7 am / noon)          evening agent (7 pm)
 ├─ scan job boards + LinkedIn           └─ email check + daily summary
 ├─ auto-apply in Chrome
 └─ read Gmail / Outlook ──► POST /api/events, /api/roles/bulk (Bearer token)
                                   │
                         Cloudflare Worker ──► D1 (SQLite)
                          │            │
                     /  public     /admin  (signed session cookie)
```

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the full picture.

## Stack

- **Cloudflare Workers** for hosting and the JSON API (no framework, no build step beyond Wrangler).
- **Cloudflare D1** (SQLite) for roles, companies, events, interviews, settings and access requests.
- **Vanilla JS + SVG** for the pages and charts; strict Content-Security-Policy (no third-party scripts).
- **node:test** for unit tests of the categorizer, visibility filter, event rules and loose-end logic.

## Quick start

```bash
npm install
cp .dev.vars.example .dev.vars          # set ADMIN_PASSWORD, SESSION_SECRET, API_TOKEN
npm run db:local                         # schema + seed into a local D1
npm run dev                              # http://localhost:8787
npm test
```

Deploying your own copy: [docs/DEPLOY.md](docs/DEPLOY.md). API reference: [docs/API.md](docs/API.md). Data model: [docs/DATA_MODEL.md](docs/DATA_MODEL.md). What's next: [docs/ROADMAP.md](docs/ROADMAP.md).

## Privacy by design

The public endpoint is built from an allow-list: `publicSummary()` in `src/lib.js` receives only category, stage, dates, submitter and company, and returns only the sections switched on in the admin's **Public visibility** tab. Titles, pay, notes, links and the needs-you list never reach it. Tests in `test/lib.test.js` check that.

## License

MIT. Built with Claude Code.
