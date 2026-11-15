const test = require('node:test');
const assert = require('node:assert/strict');
const L = require('../js/logic.js');

test('recommendPlan: single small site with no add-ons is Starter', () => {
  assert.equal(L.recommendPlan(1, 10), 'starter');
});
test('recommendPlan: any paid add-on moves a single site to Team', () => {
  assert.equal(L.recommendPlan(1, 10, { payroll: true }), 'team');
});
test('recommendPlan: 16 staff at one site exceeds Starter', () => {
  assert.equal(L.recommendPlan(1, 16), 'team');
});
test('recommendPlan: forecasting with 3+ sites recommends Business', () => {
  assert.equal(L.recommendPlan(3, 20, { forecast: true }), 'business');
  assert.equal(L.recommendPlan(2, 20, { forecast: true }), 'team');
});
test('recommendPlan: 11-50 sites is Business, 51+ or SSO is Enterprise', () => {
  assert.equal(L.recommendPlan(11, 20), 'business');
  assert.equal(L.recommendPlan(50, 20), 'business');
  assert.equal(L.recommendPlan(51, 20), 'enterprise');
  assert.equal(L.recommendPlan(3, 20, { sso: true }), 'enterprise');
});
test('recommendPlan: staff above 60 per site needs Business', () => {
  assert.equal(L.recommendPlan(4, 61), 'business');
});

test('priceQuote: Team monthly in USD multiplies by locations', () => {
  const q = L.priceQuote({ locations: 4, staffPerLocation: 18, currency: 'USD', billing: 'monthly' });
  assert.equal(q.plan, 'team');
  assert.equal(q.monthly, 196);
  assert.equal(q.billed, 196);
  assert.equal(q.savingsPerYear, 0);
});
test('priceQuote: annual billing applies 20% and bills 12 months', () => {
  const q = L.priceQuote({ locations: 4, staffPerLocation: 18, currency: 'USD', billing: 'annual' });
  assert.equal(q.monthly, 156.8);
  assert.equal(q.billed, 1881.6);
  assert.equal(q.savingsPerYear, 470.4);
});
test('priceQuote: regional INR price points and add-ons', () => {
  const q = L.priceQuote({ locations: 2, staffPerLocation: 20, currency: 'INR', billing: 'monthly', addons: ['payroll', 'sms'] });
  assert.equal(q.plan, 'team');
  assert.equal(q.monthly, 2 * 1999 + 2 * 399 + 2 * 249);
});
test('priceQuote: forecasting is included free on Business', () => {
  const q = L.priceQuote({ locations: 4, staffPerLocation: 20, currency: 'AUD', billing: 'monthly', addons: ['forecast'] });
  assert.equal(q.plan, 'business');
  assert.equal(q.monthly, 4 * 135);
  assert.ok(q.lines.some((l) => /included/.test(l.label) && l.amount === 0));
});
test('priceQuote: Starter is free and Enterprise is custom', () => {
  assert.equal(L.priceQuote({ locations: 1, staffPerLocation: 5 }).monthly, 0);
  const e = L.priceQuote({ locations: 80, staffPerLocation: 30 });
  assert.equal(e.custom, true);
  assert.equal(e.monthly, null);
});
test('priceQuote: bad inputs are clamped and unknown currency throws', () => {
  const q = L.priceQuote({ locations: -3, staffPerLocation: 'abc' });
  assert.equal(q.locations, 1);
  assert.equal(q.plan, 'starter');
  assert.throws(() => L.priceQuote({ currency: 'EUR' }), /Unsupported currency/);
});
test('priceQuote: explicit plan override is honoured', () => {
  const q = L.priceQuote({ locations: 2, staffPerLocation: 10, plan: 'business', currency: 'USD' });
  assert.equal(q.monthly, 178);
});

test('roiEstimate: components match hand calculation', () => {
  const r = L.roiEstimate({ locations: 2, schedulingHoursPerWeek: 5, managerHourlyCost: 30, weeklyWageBill: 10000, overtimePct: 5, noShowsPerWeek: 2, costPerNoShow: 50, softwareMonthly: 200 },
    { timeSaved: 0.5, overtimeCut: 0.2, noShowCut: 0.5 });
  const w = 52 / 12;
  assert.equal(r.hoursSavedMonth, Math.round(5 * 0.5 * w * 2 * 10) / 10);
  assert.equal(r.timeValue, Math.round(5 * 0.5 * w * 2 * 30 * 100) / 100);
  assert.equal(r.overtimeSaving, Math.round(10000 * 0.05 * w * 2 * 0.2 * 100) / 100);
  assert.equal(r.noShowSaving, Math.round(2 * 50 * 0.5 * w * 2 * 100) / 100);
  assert.ok(Math.abs(r.grossMonthly - (r.timeValue + r.overtimeSaving + r.noShowSaving)) < 0.02);
  assert.ok(Math.abs(r.netMonthly - (r.grossMonthly - 200)) < 0.02);
});
test('roiEstimate: payback days and ROI multiple', () => {
  const r = L.roiEstimate({ locations: 1, schedulingHoursPerWeek: 0, weeklyWageBill: 0, noShowsPerWeek: 3, costPerNoShow: 100, softwareMonthly: 100 }, { noShowCut: 1 });
  // gross = 3*100*52/12 = 1300 → 13x, payback = 100/1300*30 = 2.3 → 3 days
  assert.equal(r.grossMonthly, 1300);
  assert.equal(r.roiMultiple, 13);
  assert.equal(r.paybackDays, 3);
});
test('roiEstimate: free plan pays back immediately; zero savings with cost has no payback', () => {
  assert.equal(L.roiEstimate({ locations: 1, schedulingHoursPerWeek: 2, managerHourlyCost: 20, softwareMonthly: 0 }).paybackDays, 0);
  const r = L.roiEstimate({ locations: 1, softwareMonthly: 50 });
  assert.equal(r.paybackDays, null);
  assert.equal(r.netMonthly, -50);
});
test('roiEstimate: negative and junk inputs are treated as zero; overtime capped at 100%', () => {
  const r = L.roiEstimate({ locations: 1, schedulingHoursPerWeek: -5, managerHourlyCost: 'x', weeklyWageBill: 1000, overtimePct: 500 }, { overtimeCut: 1 });
  assert.equal(r.timeValue, 0);
  assert.equal(r.overtimeSaving, Math.round(1000 * 52 / 12 * 100) / 100);
});
test('roiEstimate: default assumptions are the conservative published ones', () => {
  assert.deepEqual({ ...L.DEFAULT_ASSUMPTIONS }, { timeSaved: 0.6, overtimeCut: 0.15, noShowCut: 0.25 });
});

test('fnv1a: known test vectors', () => {
  assert.equal(L.fnv1a(''), 0x811c9dc5);
  assert.equal(L.fnv1a('a'), 0xe40c292c);
  assert.equal(L.fnv1a('foobar'), 0xbf9cf968);
});
test('assignVariant: deterministic per visitor and experiment', () => {
  const a = L.assignVariant('v_123', 'hero_headline_v1');
  const b = L.assignVariant('v_123', 'hero_headline_v1');
  assert.deepEqual(a, b);
  assert.equal(a.source, 'hash');
  assert.ok(['A', 'B', 'C'].includes(a.variant));
});
test('assignVariant: valid override wins (case-insensitive), invalid override ignored', () => {
  assert.deepEqual(L.assignVariant('v_1', 'x', 'b'), { variant: 'B', source: 'override' });
  assert.equal(L.assignVariant('v_1', 'x', 'Z').source, 'hash');
});
test('assignVariant: split is roughly even across 9,000 visitors', () => {
  const counts = { A: 0, B: 0, C: 0 };
  for (let i = 0; i < 9000; i++) counts[L.assignVariant('visitor-' + i, 'hero_headline_v1').variant]++;
  Object.values(counts).forEach((c) => assert.ok(c > 2700 && c < 3300, JSON.stringify(counts)));
});
test('HEADLINE_VARIANTS: each variant has a distinct angle and copy', () => {
  const vs = Object.values(L.HEADLINE_VARIANTS);
  assert.equal(new Set(vs.map((v) => v.angle)).size, vs.length);
  vs.forEach((v) => { assert.ok(v.headline.length > 10 && v.headline.length < 70); assert.ok(v.sub.length > 20); });
});

const good = { name: 'Asha Rao', email: 'asha@kettlecrumb.example', company: 'Kettle & Crumb', locations: 6, industry: 'hospitality', timeline: 'now', consent: true };
test('validateLead: a complete lead is valid with no warnings', () => {
  const r = L.validateLead(good);
  assert.equal(r.valid, true);
  assert.deepEqual(r.errors, {});
  assert.deepEqual(r.warnings, {});
});
test('validateLead: missing fields produce field-level errors', () => {
  const r = L.validateLead({ name: ' ', email: 'nope', company: '', locations: 0, industry: '', consent: false });
  assert.equal(r.valid, false);
  assert.deepEqual(Object.keys(r.errors).sort(), ['company', 'consent', 'email', 'industry', 'locations', 'name']);
});
test('validateLead: free email domain is a warning, not an error', () => {
  const r = L.validateLead({ ...good, email: 'Asha@Gmail.com' });
  assert.equal(r.valid, true);
  assert.ok(r.warnings.email);
});
test('validateLead: non-integer or huge location counts are rejected', () => {
  assert.ok(L.validateLead({ ...good, locations: 2.5 }).errors.locations);
  assert.ok(L.validateLead({ ...good, locations: 10000 }).errors.locations);
  assert.ok(L.validateLead({ ...good, locations: NaN }).errors.locations);
});
test('leadScore: routes big, urgent, work-email retail leads to sales', () => {
  assert.deepEqual(L.leadScore({ ...good, locations: 30 }), { score: 100, route: 'sales_assist' });
  assert.equal(L.leadScore({ ...good, locations: 1, email: 'a@gmail.com', timeline: 'exploring', industry: 'other' }).route, 'self_serve');
  assert.equal(L.leadScore({ ...good, locations: 3, email: 'a@gmail.com', timeline: 'quarter' }).route, 'guided_trial');
});

test('parseUtm: keeps utm_* and click IDs, decodes, ignores others', () => {
  const u = L.parseUtm('?utm_source=google&utm_medium=cpc&utm_campaign=roster%20app&utm_term=shift+scheduling&gclid=abc&foo=bar');
  assert.deepEqual(u, { utm_source: 'google', utm_medium: 'cpc', utm_campaign: 'roster app', utm_term: 'shift scheduling', gclid: 'abc' });
  assert.deepEqual(L.parseUtm(''), {});
});
test('formatMoney: locale-aware symbols and grouping', () => {
  assert.equal(L.formatMoney(1999, 'INR'), '₹1,999');
  assert.equal(L.formatMoney(1234567, 'INR'), '₹12,34,567');
  assert.equal(L.formatMoney(156.8, 'USD'), '$156.80');
  assert.equal(L.formatMoney(75, 'AUD'), 'A$75');
});
