# Deploy

```bash
npm install
npx wrangler login
npx wrangler d1 create jobsearch-db            # copy the id into wrangler.toml
npm run db:schema
npx wrangler secret put ADMIN_PASSWORD
npx wrangler secret put SESSION_SECRET          # any long random string
npx wrangler secret put API_TOKEN               # give this to your automation
npm run deploy
JHQ_URL=https://<your-worker>.workers.dev JHQ_TOKEN=<API_TOKEN> node scripts/push.mjs   # optional: load data/*.json
```

## Custom domain

Add the domain to Cloudflare (or point its nameservers there), then in the Worker's **Settings → Domains & Routes** add a custom domain such as `chrisihler.dev` or `jobs.chrisihler.dev`. HTTPS is automatic.

## Rotating secrets

`npx wrangler secret put ADMIN_PASSWORD` (or `API_TOKEN`) and redeploy is not needed; the new value is live at once. Changing `SESSION_SECRET` signs everyone out.
