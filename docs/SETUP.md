# Run your own Job Search HQ

About 15 minutes. You need a free Cloudflare account and Node.js 20+.

## 1. Get the code

```bash
git clone https://github.com/ChrisIhler/jobsearch-hq
cd jobsearch-hq
npm install
```

## 2. Make it yours

Edit the `[vars]` block in `wrangler.toml`:

| Variable | Shown as |
|---|---|
| `OWNER_NAME` | Page title, intro and footer |
| `OWNER_FIRST_NAME` | "Submitted by …" labels; the value stored for applications you submit yourself |
| `OWNER_LOCATION` | Line above the headline |
| `GITHUB_URL`, `LINKEDIN_URL` | Footer links |
| `REPO_URL` | "Read the code" link |

The intro paragraph on `src/public.html` describes Chris's own pipeline; rewrite it to describe yours.

## 3. Try it locally with sample data

```bash
cp .dev.vars.example .dev.vars     # set ADMIN_PASSWORD, SESSION_SECRET, API_TOKEN
npm run db:sample                  # fictional companies, so you can see every screen
npm run dev                        # http://localhost:8787 and /admin
```

## 4. Deploy

```bash
npx wrangler login
npx wrangler d1 create jobsearch-db        # put the printed id in wrangler.toml
npm run db:schema
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET
npx wrangler secret put API_TOKEN
npm run deploy
```

Your site is live at `https://jobsearch-hq.<your-subdomain>.workers.dev`. Sign in at `/admin`, open **Public visibility**, and choose what strangers can see before you share the link.

## 5. Add your applications

- **By hand:** Admin → Roles → **Add role**. Paste the posting link, set the stage and tier.
- **From a spreadsheet:** shape each row as `{company, title, stage, applied_date, applied_by, ...}` and send them to `POST /api/roles/bulk` (see [API.md](API.md)), or adapt `scripts/push.mjs`.
- **From an AI agent:** give your agent the API token and the [API reference](API.md). Every endpoint is an upsert or an append, so a run can re-send safely. `applied_by: "Claude"` marks an automatic submission; any other value counts as yours.

## 6. Keep it honest

The `/demo` page uses invented companies and says so on the page. Your live page shows only your real data, filtered by your visibility switches.
