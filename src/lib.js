// Shared, side-effect-free helpers. Imported by the Worker and by the tests.

export const CATEGORIES = [
  'AI & Automation',
  'Software Engineering',
  'Implementation & Onboarding',
  'Customer Success & Accounts',
  'Analyst & Finance',
  'Project, Program & Ops',
  'Support',
  'Other',
];

// Ordered rules: the first match wins, so more specific families come first.
const RULES = [
  ['AI & Automation', /\b(ai|a\.i\.|automation|automations|rpa|agentic|agent|generative|gtm engineer|llm|machine learning)\b/i],
  ['Software Engineering', /\b(engineer|developer|software|front[- ]?end|back[- ]?end|full[- ]?stack|swe|programmer|web dev)\b/i],
  ['Implementation & Onboarding', /\b(implementation|onboarding|solutions?|deployment|integration|delivery)\b/i],
  ['Customer Success & Accounts', /\b(customer success|client success|account|accounts|partner|partnerships|renewals?|engagement|client services)\b/i],
  ['Analyst & Finance', /\b(analyst|finance|financial|deal desk|fp&a|pricing)\b/i],
  ['Project, Program & Ops', /\b(project|program|operations|ops|coordinator|general manager|manager|strategy)\b/i],
  ['Support', /\b(support|specialist|technician|help ?desk)\b/i],
];

export function categorize(title = '') {
  for (const [cat, re] of RULES) if (re.test(title)) return cat;
  return 'Other';
}

export const STAGES = ['queued', 'applied', 'interview', 'offer', 'rejected', 'closed'];
export const TIERS = ['auto', 'quick', 'long']; // only meaningful while stage = queued

export const DEFAULT_VISIBILITY = {
  totals: true,          // headline counts (total, month, week, latest day)
  daily_chart: true,     // applications-per-day chart
  automation_split: true,// share submitted automatically vs by the owner
  categories: true,      // breakdown by role category
  hidden_categories: [], // categories removed from every public view
  companies: false,      // list of company names
  pipeline: false,       // applied / confirmed / interviews / offers (off by default on the live page)
  request_form: true,    // "Request more access" form
};

export function mergeVisibility(saved) {
  const v = { ...DEFAULT_VISIBILITY, ...(saved || {}) };
  if (!Array.isArray(v.hidden_categories)) v.hidden_categories = [];
  return v;
}

function weekStart(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

// Builds the public payload from full rows. Exact titles, pay, notes, links and
// the needs-you funnel never leave this function; only what the toggles allow.
export function publicSummary(rows, visibility, today = new Date().toISOString().slice(0, 10)) {
  const v = mergeVisibility(visibility);
  const hidden = new Set(v.hidden_categories);
  const visible = rows.filter((r) => !hidden.has(r.category));
  const applied = visible.filter((r) => r.applied_date && r.stage !== 'queued');
  const dates = applied.map((r) => r.applied_date).sort();
  const last = dates[dates.length - 1] || today;
  const out = { generated_at: new Date().toISOString(), visibility: v };

  if (v.totals) {
    const ws = weekStart(last);
    out.totals = {
      total: dates.length,
      month: dates.filter((d) => d.slice(0, 7) === last.slice(0, 7)).length,
      week: dates.filter((d) => d >= ws && d <= last).length,
      latest_day: dates.filter((d) => d === last).length,
      latest_date: dates.length ? last : null,
      week_start: ws,
      first_date: dates[0] || null,
    };
  }
  if (v.daily_chart) {
    const m = new Map();
    for (const r of applied) {
      const o = m.get(r.applied_date) || { date: r.applied_date, auto: 0, manual: 0 };
      if (r.applied_by === 'Claude') o.auto++; else o.manual++;
      m.set(r.applied_date, o);
    }
    out.daily = [...m.values()].sort((a, b) => (a.date < b.date ? -1 : 1));
  }
  if (v.automation_split) {
    const auto = applied.filter((r) => r.applied_by === 'Claude').length;
    out.automation = { auto, manual: applied.length - auto };
  }
  if (v.categories) {
    const c = new Map();
    for (const r of applied) c.set(r.category, (c.get(r.category) || 0) + 1);
    out.categories = [...c.entries()].map(([category, count]) => ({ category, count })).sort((a, b) => b.count - a.count);
  }
  if (v.companies) {
    const c = new Map();
    for (const r of applied) {
      const o = c.get(r.company) || { company: r.company, applications: 0, categories: new Set() };
      o.applications++; o.categories.add(r.category); c.set(r.company, o);
    }
    out.companies = [...c.values()]
      .map((o) => ({ company: o.company, applications: o.applications, categories: [...o.categories] }))
      .sort((a, b) => a.company.localeCompare(b.company));
  }
  if (v.pipeline) {
    const count = (s) => visible.filter((r) => r.stage === s).length;
    out.pipeline = {
      queued: count('queued'),
      applied: applied.length,
      confirmed: applied.filter((r) => r.confirmed_at).length,
      interview: visible.filter((r) => r.stage === 'interview' || r.stage === 'offer' || r.interviews > 0).length,
      offer: count('offer'),
    };
  }
  out.request_form = !!v.request_form;
  return out;
}

export function cleanText(s, max = 300) {
  return String(s ?? '').replace(/[\u0000-\u001f\u007f]/g, ' ').trim().slice(0, max);
}

export function isEmail(s) {
  return /^[^\s@]{1,64}@[^\s@]{1,190}\.[^\s@]{2,}$/.test(s);
}

export const EVENT_KINDS = ['confirmation', 'interview_invite', 'assessment', 'rejection', 'offer', 'follow_up', 'note'];

// What an incoming event does to its role.
export function stageAfterEvent(stage, kind) {
  if (kind === 'offer') return 'offer';
  if (kind === 'rejection') return 'rejected';
  if (kind === 'interview_invite' && ['queued', 'applied'].includes(stage)) return 'interview';
  if (kind === 'confirmation' && stage === 'queued') return 'applied';
  return stage;
}

// Loose ends: things that need a nudge, newest risk first.
export function looseEnds(roles, interviews, today = new Date().toISOString().slice(0, 10)) {
  const out = [];
  const daysAgo = (d) => Math.round((Date.parse(today) - Date.parse(d.slice(0, 10))) / 864e5);
  for (const r of roles) {
    if (r.stage === 'queued' && r.tier === 'quick') out.push({ kind: 'needs_you_quick', role: r, detail: r.next_step || 'Quick step needed' });
    if (r.stage === 'queued' && r.tier === 'long') out.push({ kind: 'needs_you_long', role: r, detail: r.next_step || 'Longer step needed' });
    if (r.stage === 'applied' && !r.confirmed_at && r.applied_date && daysAgo(r.applied_date) >= 2) out.push({ kind: 'no_confirmation', role: r, detail: `No confirmation email ${daysAgo(r.applied_date)} days after applying` });
    if (r.deadline && r.stage === 'queued' && daysAgo(r.deadline) >= -3) out.push({ kind: 'deadline', role: r, detail: `Deadline ${r.deadline}` });
  }
  for (const i of interviews) {
    if (i.prep_status === 'requested') out.push({ kind: 'prep_pending', interview: i, detail: 'Research brief requested, not ready yet' });
    if (i.scheduled_at && i.scheduled_at.slice(0, 10) < today && i.outcome === 'pending' && !i.feedback) out.push({ kind: 'feedback_missing', interview: i, detail: 'Interview happened; add how it went' });
  }
  const order = ['deadline', 'feedback_missing', 'prep_pending', 'needs_you_quick', 'needs_you_long', 'no_confirmation'];
  return out.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

// Deterministic fictional dataset for the public demo. Every company is invented.
export function demoRows(today = new Date().toISOString().slice(0, 10), days = 45, owner = 'Chris') {
  const companies = ['Northwind Labs', 'Bluefin Analytics', 'Cedar & Pine Software', 'Harborlight AI', 'Quillstone', 'Lumen Freight', 'Pinecrest Health Tech', 'Orbitline', 'Saltwater Systems', 'Tallgrass Cloud', 'Ridgeway Payments', 'Copperleaf CRM', 'Meridian Robotics', 'Foxglove Media', 'Granite Peak Data', 'Silverbirch Learning', 'Kestrel Logistics', 'Alder Street Studio', 'Brightwater Fintech', 'Juniper Ops'];
  const titles = ['AI Implementation Specialist', 'Junior Software Engineer', 'Customer Success Manager', 'Implementation Consultant', 'Automation Engineer', 'Project Manager', 'Solutions Analyst', 'Account Manager', 'Frontend Developer', 'Operations Analyst'];
  let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  const rows = []; const end = Date.parse(today);
  for (let d = days; d >= 0; d--) {
    const date = new Date(end - d * 864e5).toISOString().slice(0, 10);
    const n = 3 + Math.floor(rnd() * 9);
    for (let k = 0; k < n; k++) {
      const title = titles[Math.floor(rnd() * titles.length)];
      const age = d;
      const r = { company: companies[Math.floor(rnd() * companies.length)], category: categorize(title), applied_date: date, applied_by: rnd() < 0.68 ? 'Claude' : owner, stage: 'applied', confirmed_at: rnd() < 0.9 ? date : null, interviews: 0 };
      const x = rnd();
      if (age > 5 && x < 0.16) { r.stage = 'interview'; r.interviews = 1 + Math.floor(rnd() * 3); }
      else if (age > 14 && x < 0.2) { r.stage = 'offer'; r.interviews = 3; }
      else if (age > 7 && x < 0.38) r.stage = 'rejected';
      rows.push(r);
    }
  }
  for (let q = 0; q < 14; q++) rows.push({ company: companies[q], category: categorize(titles[q % titles.length]), stage: 'queued', applied_date: null, applied_by: null, interviews: 0 });
  return rows;
}
