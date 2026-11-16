// Builds data/seed.sql from data/applications.json and data/funnel.json.
// Usage: node scripts/build-seed.mjs > data/seed.sql
import { readFileSync } from 'node:fs';
import { categorize } from '../src/lib.js';

const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const apps = JSON.parse(readFileSync(new URL('../data/applications.json', import.meta.url))).rows;
const funnel = JSON.parse(readFileSync(new URL('../data/funnel.json', import.meta.url))).rows;
const tierMap = { 'Auto-ready': 'auto', 'Tier 1 - quick': 'quick', 'Tier 2 - takes time': 'long' };

const out = [];
const companies = new Set([...apps.map((a) => a.company), ...funnel.map((f) => f.company)]);
for (const c of companies) out.push(`INSERT OR IGNORE INTO companies (name) VALUES (${q(c)});`);
const cid = (c) => `(SELECT id FROM companies WHERE name = ${q(c)} COLLATE NOCASE)`;
for (const a of apps) {
  out.push(`INSERT OR IGNORE INTO roles (company_id, title, category, stage, applied_date, applied_by, ats) VALUES (${cid(a.company)}, ${q(a.role || '(role not recorded)')}, ${q(categorize(a.role))}, 'applied', ${q(a.date)}, ${q(a.applied_by)}, ${q(a.ats)});`);
}
for (const f of funnel) {
  out.push(`INSERT OR IGNORE INTO roles (company_id, title, category, stage, tier, location, next_step, deadline, url) VALUES (${cid(f.company)}, ${q(f.role)}, ${q(categorize(f.role))}, 'queued', ${q(tierMap[f.tier])}, ${q(f.location_pay)}, ${q(f.next_step)}, ${q(f.deadline)}, ${q(f.link)});`);
}
console.log(out.join('\n'));
