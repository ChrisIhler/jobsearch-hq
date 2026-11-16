// Pushes data/applications.json + data/funnel.json to a deployed JobSearch HQ via the bulk API.
// Usage: JHQ_URL=https://... JHQ_TOKEN=... node scripts/push.mjs
import { readFileSync } from 'node:fs';
const URL_ = process.env.JHQ_URL, TOKEN = process.env.JHQ_TOKEN;
if (!URL_ || !TOKEN) { console.error('Set JHQ_URL and JHQ_TOKEN'); process.exit(1); }
const tierMap = { 'Auto-ready': 'auto', 'Tier 1 - quick': 'quick', 'Tier 2 - takes time': 'long' };
const apps = JSON.parse(readFileSync(new URL('../data/applications.json', import.meta.url))).rows.map((a) => ({
  company: a.company, title: a.role || '(role not recorded)', stage: 'applied', applied_date: a.date, applied_by: a.applied_by, ats: a.ats || null }));
const funnel = JSON.parse(readFileSync(new URL('../data/funnel.json', import.meta.url))).rows.map((f) => ({
  company: f.company, title: f.role, stage: 'queued', tier: tierMap[f.tier], location: f.location_pay || null, next_step: f.next_step || null, deadline: f.deadline || null, url: f.link || null }));
const all = [...apps, ...funnel].filter((r) => r.company && r.company.trim());
for (let i = 0; i < all.length; i += 100) {
  const r = await fetch(URL_ + '/api/roles/bulk', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + TOKEN }, body: JSON.stringify(all.slice(i, i + 100)) });
  console.log(i, r.status, await r.text());
}
