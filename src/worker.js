// JobSearch HQ — Cloudflare Worker: public portfolio page, private admin, JSON API.
import { categorize, publicSummary, mergeVisibility, cleanText, isEmail, STAGES, TIERS, CATEGORIES, EVENT_KINDS, stageAfterEvent, looseEnds, demoRows } from './lib.js';
import publicHtml from './public.html';
import adminHtml from './admin.html';
import appCss from './app.css';
import publicJs from './public.js.txt';
import adminJs from './admin.js.txt';

const SESSION_COOKIE = 'jhq_session';
const SESSION_HOURS = 24 * 14;

const SECURITY_HEADERS = {
  'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src https://fonts.gstatic.com; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
};

function respond(body, type, extra = {}) {
  return new Response(body, { headers: { 'Content-Type': type, ...SECURITY_HEADERS, ...extra } });
}
function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', ...SECURITY_HEADERS, ...extra } });
}
const bad = (msg, status = 400) => json({ error: msg }, status);

// ---------- auth ----------
const enc = new TextEncoder();
async function hmac(secret, msg) {
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(msg));
  return btoa(String.fromCharCode(...new Uint8Array(sig))).replace(/=+$/, '').replace(/\+/g, '-').replace(/\//g, '_');
}
async function sha(s) {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}
async function safeEqual(a, b) {
  const [x, y] = await Promise.all([sha(a), sha(b)]);
  let d = 0; for (let i = 0; i < x.length; i++) d |= x[i] ^ y[i];
  return d === 0;
}
function getCookie(req, name) {
  const m = (req.headers.get('Cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}
async function makeSession(env) {
  const exp = Date.now() + SESSION_HOURS * 3600e3;
  return `${exp}.${await hmac(env.SESSION_SECRET, String(exp))}`;
}
async function isAdmin(req, env) {
  const auth = req.headers.get('Authorization') || '';
  if (env.API_TOKEN && auth.startsWith('Bearer ') && (await safeEqual(auth.slice(7), env.API_TOKEN))) return true;
  const c = getCookie(req, SESSION_COOKIE);
  if (!c) return false;
  const [exp, sig] = c.split('.');
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

// ---------- data ----------
async function getVisibility(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'visibility'").first();
  return mergeVisibility(row ? JSON.parse(row.value) : null);
}

async function companyId(env, name) {
  const n = cleanText(name, 120);
  if (!n) throw new Error('company is required');
  await env.DB.prepare('INSERT OR IGNORE INTO companies (name) VALUES (?)').bind(n).run();
  const r = await env.DB.prepare('SELECT id FROM companies WHERE name = ? COLLATE NOCASE').bind(n).first();
  return r.id;
}

const ROLE_FIELDS = ['title', 'category', 'stage', 'tier', 'applied_date', 'applied_by', 'ats', 'location', 'pay', 'next_step', 'deadline', 'url', 'notes', 'confirmed_at'];

function normalizeRole(input, partial = false) {
  const r = {};
  for (const f of ROLE_FIELDS) if (input[f] !== undefined) r[f] = input[f] === null ? null : cleanText(input[f], f === 'notes' || f === 'next_step' ? 1000 : 300);
  if (!partial && !r.title) throw new Error('title is required');
  if (r.stage !== undefined && r.stage !== null && !STAGES.includes(r.stage)) throw new Error('stage must be one of ' + STAGES.join(', '));
  if (r.tier !== undefined && r.tier && !TIERS.includes(r.tier)) throw new Error('tier must be one of ' + TIERS.join(', '));
  if (r.category !== undefined && r.category && !CATEGORIES.includes(r.category)) throw new Error('unknown category');
  for (const d of ['applied_date', 'deadline', 'confirmed_at']) if (r[d] && !/^\d{4}-\d{2}-\d{2}$/.test(r[d])) throw new Error(d + ' must be YYYY-MM-DD');
  if (r.url && !/^https?:\/\//i.test(r.url)) throw new Error('url must start with http(s)://');
  if (!partial) {
    r.category = r.category || categorize(r.title);
    r.stage = r.stage || (r.applied_date ? 'applied' : 'queued');
  }
  return r;
}

const ROLE_SELECT = `SELECT r.*, c.name AS company FROM roles r JOIN companies c ON c.id = r.company_id`;

async function listRoles(env, url) {
  const where = [], args = [];
  const p = url.searchParams;
  if (p.get('stage')) { where.push('r.stage = ?'); args.push(p.get('stage')); }
  if (p.get('tier')) { where.push('r.tier = ?'); args.push(p.get('tier')); }
  if (p.get('category')) { where.push('r.category = ?'); args.push(p.get('category')); }
  if (p.get('company_id')) { where.push('r.company_id = ?'); args.push(Number(p.get('company_id'))); }
  if (p.get('from')) { where.push('r.applied_date >= ?'); args.push(p.get('from')); }
  if (p.get('to')) { where.push('r.applied_date <= ?'); args.push(p.get('to')); }
  if (p.get('q')) { where.push('(r.title LIKE ? OR c.name LIKE ? OR r.notes LIKE ?)'); const q = '%' + p.get('q') + '%'; args.push(q, q, q); }
  const sql = `${ROLE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY COALESCE(r.applied_date, r.deadline, '9999') DESC, r.id DESC LIMIT 2000`;
  const { results } = await env.DB.prepare(sql).bind(...args).all();
  return results;
}

async function upsertRole(env, body) {
  const cid = await companyId(env, body.company);
  const r = normalizeRole(body);
  const cols = ['company_id', ...Object.keys(r)];
  const vals = [cid, ...Object.values(r)];
  const updates = Object.keys(r).filter((k) => k !== 'title').map((k) => `${k} = excluded.${k}`).concat("updated_at = datetime('now')");
  const sql = `INSERT INTO roles (${cols.join(',')}) VALUES (${cols.map(() => '?').join(',')})
    ON CONFLICT(company_id, title) DO UPDATE SET ${updates.join(', ')} RETURNING id`;
  const row = await env.DB.prepare(sql).bind(...vals).first();
  return row.id;
}

// ---------- router ----------
export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const { pathname: path } = url;
    const m = req.method;
    try {
      // static
      if (m === 'GET' && path === '/') return respond(publicHtml, 'text/html; charset=utf-8');
      if (m === 'GET' && path === '/demo') return respond(publicHtml, 'text/html; charset=utf-8');
      if (m === 'GET' && path === '/admin') return respond(adminHtml, 'text/html; charset=utf-8', { 'X-Robots-Tag': 'noindex' });
      if (m === 'GET' && path === '/app.css') return respond(appCss, 'text/css; charset=utf-8', { 'Cache-Control': 'public, max-age=300' });
      if (m === 'GET' && path === '/public.js') return respond(publicJs, 'text/javascript; charset=utf-8', { 'Cache-Control': 'public, max-age=300' });
      if (m === 'GET' && path === '/admin.js') return respond(adminJs, 'text/javascript; charset=utf-8', { 'Cache-Control': 'no-store' });
      if (m === 'GET' && path === '/robots.txt') return respond('User-agent: *\nDisallow: /admin\nDisallow: /api/\n', 'text/plain');
      if (m === 'GET' && path === '/healthz') return json({ ok: true });

      // public API
      if (m === 'GET' && path === '/api/public') {
        const { results } = await env.DB.prepare(`SELECT r.category, r.stage, r.applied_date, r.applied_by, r.confirmed_at, c.name AS company, (SELECT COUNT(*) FROM interviews i WHERE i.role_id = r.id) AS interviews FROM roles r JOIN companies c ON c.id = r.company_id`).all();
        return json(publicSummary(results, await getVisibility(env)), 200, { 'Cache-Control': 'public, max-age=60' });
      }
      if (m === 'GET' && path === '/api/demo') {
        const all = { totals: true, daily_chart: true, automation_split: true, categories: true, companies: true, pipeline: true, request_form: true };
        return json({ ...publicSummary(demoRows(), all), demo: true }, 200, { 'Cache-Control': 'public, max-age=300' });
      }
      if (m === 'POST' && path === '/api/access-request') {
        const v = await getVisibility(env);
        if (!v.request_form) return bad('Requests are closed right now.', 403);
        const b = await req.json().catch(() => ({}));
        if (b.website) return json({ ok: true }); // honeypot
        const name = cleanText(b.name, 120), email = cleanText(b.email, 200), org = cleanText(b.org, 160), reason = cleanText(b.reason, 1500);
        if (!name || !isEmail(email) || !reason) return bad('Please give your name, a valid email and a short reason.');
        const recent = await env.DB.prepare("SELECT COUNT(*) AS n FROM access_requests WHERE email = ? AND created_at > datetime('now','-1 day')").bind(email).first();
        if (recent.n >= 3) return bad('Thanks, we already have your request.', 429);
        await env.DB.prepare('INSERT INTO access_requests (name, email, org, reason) VALUES (?,?,?,?)').bind(name, email, org, reason).run();
        return json({ ok: true });
      }

      // auth
      if (m === 'POST' && path === '/api/login') {
        const b = await req.json().catch(() => ({}));
        await new Promise((r) => setTimeout(r, 400));
        if (!env.ADMIN_PASSWORD || !(await safeEqual(String(b.password || ''), env.ADMIN_PASSWORD))) return bad('Wrong password.', 401);
        return json({ ok: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=${await makeSession(env)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}` });
      }
      if (m === 'POST' && path === '/api/logout') return json({ ok: true }, 200, { 'Set-Cookie': `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0` });
      if (m === 'GET' && path === '/api/session') return json({ admin: await isAdmin(req, env) });

      // admin API
      if (path.startsWith('/api/')) {
        if (!(await isAdmin(req, env))) return bad('Sign in required.', 401);
        if (m !== 'GET' && !req.headers.get('Authorization')) {
          // cookie-authenticated writes must come from this site
          const origin = req.headers.get('Origin');
          if (origin && origin !== url.origin) return bad('Cross-site request refused.', 403);
        }
        if (m === 'GET' && path === '/api/meta') return json({ categories: CATEGORIES, stages: STAGES, tiers: TIERS });
        if (m === 'GET' && path === '/api/roles') return json({ roles: await listRoles(env, url) });
        if (m === 'POST' && path === '/api/roles') return json({ id: await upsertRole(env, await req.json()) }, 201);
        if (m === 'POST' && path === '/api/roles/bulk') {
          const b = await req.json();
          const rows = Array.isArray(b) ? b : b.roles;
          if (!Array.isArray(rows) || rows.length > 500) return bad('Send up to 500 roles as an array.');
          const ids = []; for (const r of rows) ids.push(await upsertRole(env, r));
          return json({ upserted: ids.length });
        }
        let mm;
        if ((mm = path.match(/^\/api\/roles\/(\d+)$/)) && m === 'GET') {
          const id = Number(mm[1]);
          const role = await env.DB.prepare(`${ROLE_SELECT} WHERE r.id = ?`).bind(id).first();
          if (!role) return bad('Not found.', 404);
          const ev = await env.DB.prepare('SELECT * FROM events WHERE role_id = ? ORDER BY happened_at DESC, id DESC').bind(id).all();
          const iv = await env.DB.prepare('SELECT * FROM interviews WHERE role_id = ? ORDER BY scheduled_at DESC').bind(id).all();
          return json({ role, events: ev.results, interviews: iv.results });
        }
        if (m === 'POST' && path === '/api/events') {
          const b = await req.json();
          if (!EVENT_KINDS.includes(b.kind)) return bad('kind must be one of ' + EVENT_KINDS.join(', '));
          let roleId = Number(b.role_id) || null;
          if (!roleId) {
            if (!b.company || !b.title) return bad('Give role_id, or company and title.');
            const found = await env.DB.prepare('SELECT r.id FROM roles r JOIN companies c ON c.id = r.company_id WHERE c.name = ? COLLATE NOCASE AND r.title = ? COLLATE NOCASE').bind(cleanText(b.company, 120), cleanText(b.title)).first();
            roleId = found ? found.id : await upsertRole(env, { company: b.company, title: b.title, applied_date: b.happened_at ? String(b.happened_at).slice(0, 10) : null, applied_by: b.applied_by || null });
          }
          const role = await env.DB.prepare('SELECT stage, confirmed_at FROM roles WHERE id = ?').bind(roleId).first();
          if (!role) return bad('Role not found.', 404);
          const when = cleanText(b.happened_at || new Date().toISOString(), 40);
          // de-duplicate the same event arriving from two syncs
          const dup = await env.DB.prepare('SELECT id FROM events WHERE role_id = ? AND kind = ? AND substr(happened_at,1,10) = substr(?,1,10)').bind(roleId, b.kind, when).first();
          if (dup) return json({ id: dup.id, role_id: roleId, duplicate: true });
          const ev = await env.DB.prepare('INSERT INTO events (role_id, kind, happened_at, source, detail) VALUES (?,?,?,?,?) RETURNING id').bind(roleId, b.kind, when, cleanText(b.source, 60) || null, cleanText(b.detail, 2000) || null).first();
          const next = stageAfterEvent(role.stage, b.kind);
          const sets = []; const args = [];
          if (next !== role.stage) { sets.push('stage = ?'); args.push(next); }
          if (b.kind === 'confirmation' && !role.confirmed_at) { sets.push('confirmed_at = ?'); args.push(when.slice(0, 10)); }
          if (sets.length) await env.DB.prepare(`UPDATE roles SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...args, roleId).run();
          if (b.kind === 'interview_invite') await env.DB.prepare('INSERT INTO interviews (role_id, scheduled_at, round, format) VALUES (?,?,?,?)').bind(roleId, cleanText(b.scheduled_at, 40) || null, cleanText(b.round, 120) || null, cleanText(b.format, 60) || null).run();
          return json({ id: ev.id, role_id: roleId, stage: next }, 201);
        }
        if (m === 'GET' && path === '/api/interviews') {
          const { results } = await env.DB.prepare(`SELECT i.*, r.title, r.category, c.name AS company FROM interviews i JOIN roles r ON r.id = i.role_id JOIN companies c ON c.id = r.company_id ORDER BY COALESCE(i.scheduled_at, i.created_at) DESC`).all();
          return json({ interviews: results });
        }
        if (m === 'POST' && path === '/api/interviews') {
          const b = await req.json();
          if (!b.role_id) return bad('role_id is required');
          const row = await env.DB.prepare('INSERT INTO interviews (role_id, scheduled_at, round, format, interviewer) VALUES (?,?,?,?,?) RETURNING id').bind(Number(b.role_id), cleanText(b.scheduled_at, 40) || null, cleanText(b.round, 120) || null, cleanText(b.format, 60) || null, cleanText(b.interviewer, 200) || null).first();
          await env.DB.prepare("UPDATE roles SET stage = 'interview', updated_at = datetime('now') WHERE id = ? AND stage IN ('queued','applied')").bind(Number(b.role_id)).run();
          return json({ id: row.id }, 201);
        }
        if ((mm = path.match(/^\/api\/interviews\/(\d+)$/)) && m === 'PATCH') {
          const b = await req.json(); const sets = []; const args = [];
          const allowed = { scheduled_at: 40, round: 120, format: 60, interviewer: 200, prep_status: 20, prep_notes: 20000, outcome: 20, feedback: 5000 };
          for (const [k, max] of Object.entries(allowed)) if (b[k] !== undefined) { sets.push(k + ' = ?'); args.push(b[k] === null ? null : cleanText(b[k], max)); }
          if (b.rating !== undefined) { const n = b.rating === null || b.rating === '' ? null : Number(b.rating); if (n !== null && !(n >= 1 && n <= 5)) return bad('rating must be 1-5'); sets.push('rating = ?'); args.push(n); }
          if (b.prep_status && !['none', 'requested', 'ready'].includes(b.prep_status)) return bad('prep_status must be none, requested or ready');
          if (b.outcome && !['pending', 'advanced', 'rejected', 'offer', 'unknown'].includes(b.outcome)) return bad('unknown outcome');
          if (!sets.length) return bad('Nothing to update.');
          const id = Number(mm[1]);
          await env.DB.prepare(`UPDATE interviews SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...args, id).run();
          if (b.outcome === 'offer' || b.outcome === 'rejected') await env.DB.prepare(`UPDATE roles SET stage = ?, updated_at = datetime('now') WHERE id = (SELECT role_id FROM interviews WHERE id = ?)`).bind(b.outcome, id).run();
          return json({ ok: true });
        }
        if (m === 'GET' && path === '/api/loose-ends') {
          const roles = (await env.DB.prepare(`${ROLE_SELECT} WHERE r.stage IN ('queued','applied')`).all()).results;
          const ivs = (await env.DB.prepare(`SELECT i.*, r.title, c.name AS company FROM interviews i JOIN roles r ON r.id = i.role_id JOIN companies c ON c.id = r.company_id`).all()).results;
          return json({ items: looseEnds(roles, ivs) });
        }
        if (m === 'GET' && path === '/api/stats') {
          const { results } = await env.DB.prepare(`SELECT r.category, r.stage, r.applied_date, r.applied_by, r.confirmed_at, c.name AS company, (SELECT COUNT(*) FROM interviews i WHERE i.role_id = r.id) AS interviews FROM roles r JOIN companies c ON c.id = r.company_id`).all();
          const all = { totals: true, daily_chart: true, automation_split: true, categories: true, companies: false, pipeline: true, request_form: false };
          return json(publicSummary(results, all));
        }
        if ((mm = path.match(/^\/api\/roles\/(\d+)$/))) {
          const id = Number(mm[1]);
          if (m === 'DELETE') { await env.DB.prepare('DELETE FROM roles WHERE id = ?').bind(id).run(); return json({ ok: true }); }
          if (m === 'PATCH') {
            const b = await req.json();
            const r = normalizeRole(b, true);
            if (b.company) r.company_id = await companyId(env, b.company);
            if (r.title === '') return bad('title cannot be empty');
            const keys = Object.keys(r);
            if (!keys.length) return bad('Nothing to update.');
            await env.DB.prepare(`UPDATE roles SET ${keys.map((k) => k + ' = ?').join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...Object.values(r), id).run();
            return json({ role: await env.DB.prepare(`${ROLE_SELECT} WHERE r.id = ?`).bind(id).first() });
          }
        }
        if (m === 'GET' && path === '/api/companies') {
          const { results } = await env.DB.prepare(`SELECT c.*, COUNT(r.id) AS roles, SUM(r.stage <> 'queued') AS applied FROM companies c LEFT JOIN roles r ON r.company_id = c.id GROUP BY c.id ORDER BY c.name COLLATE NOCASE`).all();
          return json({ companies: results });
        }
        if (m === 'POST' && path === '/api/companies') {
          const b = await req.json();
          const id = await companyId(env, b.name);
          if (b.website || b.notes) await env.DB.prepare('UPDATE companies SET website = COALESCE(?, website), notes = COALESCE(?, notes) WHERE id = ?').bind(cleanText(b.website) || null, cleanText(b.notes, 1000) || null, id).run();
          return json({ id }, 201);
        }
        if ((mm = path.match(/^\/api\/companies\/(\d+)$/)) && m === 'PATCH') {
          const b = await req.json();
          await env.DB.prepare('UPDATE companies SET name = COALESCE(?, name), website = COALESCE(?, website), notes = COALESCE(?, notes) WHERE id = ?')
            .bind(cleanText(b.name, 120) || null, b.website === undefined ? null : cleanText(b.website), b.notes === undefined ? null : cleanText(b.notes, 1000), Number(mm[1])).run();
          return json({ ok: true });
        }
        if (path === '/api/visibility') {
          if (m === 'GET') return json(await getVisibility(env));
          if (m === 'PUT') {
            const v = mergeVisibility(await req.json());
            v.hidden_categories = v.hidden_categories.filter((c) => CATEGORIES.includes(c));
            await env.DB.prepare("INSERT INTO settings (key, value) VALUES ('visibility', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").bind(JSON.stringify(v)).run();
            return json(v);
          }
        }
        if (m === 'GET' && path === '/api/requests') {
          const { results } = await env.DB.prepare('SELECT * FROM access_requests ORDER BY created_at DESC LIMIT 500').all();
          return json({ requests: results });
        }
        if ((mm = path.match(/^\/api\/requests\/(\d+)$/)) && m === 'PATCH') {
          const b = await req.json();
          if (!['new', 'approved', 'declined'].includes(b.status)) return bad('status must be new, approved or declined');
          await env.DB.prepare('UPDATE access_requests SET status = ? WHERE id = ?').bind(b.status, Number(mm[1])).run();
          return json({ ok: true });
        }
        return bad('Not found.', 404);
      }
      return new Response('Not found', { status: 404, headers: { 'Content-Type': 'text/plain', ...SECURITY_HEADERS } });
    } catch (e) {
      return bad(e.message || 'Something went wrong.', /required|must|unknown|cannot/.test(e.message) ? 400 : 500);
    }
  },
};
