import { test } from 'node:test';
import assert from 'node:assert/strict';
import { categorize, publicSummary, mergeVisibility, stageAfterEvent, looseEnds, demoRows, isEmail } from '../src/lib.js';

test('categorize puts each title in the most specific family', () => {
  assert.equal(categorize('AI Implementation Engineer'), 'AI & Automation');
  assert.equal(categorize('Junior Full Stack Developer'), 'Software Engineering');
  assert.equal(categorize('Implementation Specialist'), 'Implementation & Onboarding');
  assert.equal(categorize('Customer Success Manager'), 'Customer Success & Accounts');
  assert.equal(categorize('Finance Analyst, Advertising'), 'Analyst & Finance');
  assert.equal(categorize('Program Manager II'), 'Project, Program & Ops');
  assert.equal(categorize('Barista'), 'Other');
});

const rows = [
  { company: 'Acme', category: 'Software Engineering', stage: 'applied', applied_date: '2026-11-14', applied_by: 'Claude', confirmed_at: '2026-11-14', interviews: 0 },
  { company: 'Acme', category: 'Customer Success & Accounts', stage: 'interview', applied_date: '2026-11-15', applied_by: 'Chris', interviews: 1 },
  { company: 'Globex', category: 'Support', stage: 'applied', applied_date: '2026-11-15', applied_by: 'Claude', interviews: 0 },
  { company: 'Initech', category: 'Other', stage: 'queued', applied_date: null, applied_by: null, interviews: 0 },
];

test('public summary never includes titles, pay or notes', () => {
  const s = JSON.stringify(publicSummary(rows.map((r) => ({ ...r, title: 'SECRET TITLE', pay: '$999', notes: 'private' })), { companies: true }));
  assert.ok(!s.includes('SECRET TITLE') && !s.includes('$999') && !s.includes('private'));
});

test('company names stay hidden unless switched on', () => {
  assert.equal(publicSummary(rows, {}).companies, undefined);
  assert.equal(publicSummary(rows, { companies: true }).companies.length, 2);
});

test('hidden categories drop out of every public number', () => {
  const s = publicSummary(rows, { hidden_categories: ['Support'] });
  assert.equal(s.totals.total, 2);
  assert.ok(!s.categories.some((c) => c.category === 'Support'));
});

test('totals and pipeline count correctly', () => {
  const s = publicSummary(rows, { pipeline: true });
  assert.deepEqual([s.totals.total, s.totals.latest_day, s.totals.week], [3, 2, 3]);
  assert.deepEqual(s.pipeline, { queued: 1, applied: 3, confirmed: 1, interview: 1, offer: 0 });
  assert.deepEqual(s.automation, { auto: 2, manual: 1 });
});

test('turning a section off removes it', () => {
  const s = publicSummary(rows, { totals: false, daily_chart: false });
  assert.equal(s.totals, undefined); assert.equal(s.daily, undefined);
});

test('mergeVisibility fills defaults and repairs bad input', () => {
  const v = mergeVisibility({ hidden_categories: 'nope' });
  assert.deepEqual(v.hidden_categories, []); assert.equal(v.companies, false);
});

test('events move a role forward but never backward', () => {
  assert.equal(stageAfterEvent('applied', 'interview_invite'), 'interview');
  assert.equal(stageAfterEvent('interview', 'confirmation'), 'interview');
  assert.equal(stageAfterEvent('interview', 'offer'), 'offer');
  assert.equal(stageAfterEvent('applied', 'rejection'), 'rejected');
});

test('loose ends flag missing confirmations and missing feedback', () => {
  const items = looseEnds(
    [{ stage: 'applied', applied_date: '2026-11-10', confirmed_at: null }, { stage: 'queued', tier: 'quick' }],
    [{ scheduled_at: '2026-11-12T10:00', outcome: 'pending', feedback: null, prep_status: 'none' }],
    '2026-11-15');
  assert.deepEqual(items.map((i) => i.kind).sort(), ['feedback_missing', 'needs_you_quick', 'no_confirmation']);
});

test('demo data is deterministic and fictional', () => {
  const a = demoRows('2026-11-15'), b = demoRows('2026-11-15');
  assert.deepEqual(a, b);
  assert.ok(!a.some((r) => /amazon|openai|anthropic|google/i.test(r.company)));
});

test('isEmail', () => {
  assert.ok(isEmail('a@b.co')); assert.ok(!isEmail('nope')); assert.ok(!isEmail('a@b'));
});
