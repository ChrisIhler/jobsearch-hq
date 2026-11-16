// Builds data/sample.sql from the fictional demo generator, so a new copy has something to look at.
// Usage: node scripts/build-sample.mjs > data/sample.sql
import { demoRows } from '../src/lib.js';
const q = (v) => (v === null || v === undefined || v === '' ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);
const titles = ['AI Implementation Specialist', 'Junior Software Engineer', 'Customer Success Manager', 'Implementation Consultant', 'Automation Engineer', 'Project Manager', 'Solutions Analyst', 'Account Manager', 'Frontend Developer', 'Operations Analyst'];
const rows = demoRows(new Date().toISOString().slice(0, 10), 30, 'Me');
const out = [];
for (const c of new Set(rows.map((r) => r.company))) out.push(`INSERT OR IGNORE INTO companies (name) VALUES (${q(c)});`);
rows.forEach((r, i) => {
  const title = `${titles[i % titles.length]} (sample ${i + 1})`;
  out.push(`INSERT OR IGNORE INTO roles (company_id, title, category, stage, tier, applied_date, applied_by, confirmed_at) VALUES ((SELECT id FROM companies WHERE name = ${q(r.company)}), ${q(title)}, ${q(r.category)}, ${q(r.stage)}, ${r.stage === 'queued' ? q(['auto', 'quick', 'long'][i % 3]) : 'NULL'}, ${q(r.applied_date)}, ${q(r.applied_by)}, ${q(r.confirmed_at)});`);
});
console.log(out.join('\n'));
