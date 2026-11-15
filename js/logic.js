/*
 * Shiftnest landing page logic (fictional brand).
 * Pure functions shared by the browser (window.ShiftnestLogic) and Node tests (module.exports).
 * All prices, rates and savings assumptions are ILLUSTRATIVE / SYNTHETIC.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.ShiftnestLogic = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Regional price points (not FX conversions), per location per month, billed monthly.
  const PLANS = {
    starter:    { id: 'starter',    name: 'Starter',    maxLocations: 1,  maxStaffPerLocation: 15, price: { USD: 0,  AUD: 0,   INR: 0 } },
    team:       { id: 'team',       name: 'Team',       maxLocations: 10, maxStaffPerLocation: 60, price: { USD: 49, AUD: 75,  INR: 1999 } },
    business:   { id: 'business',   name: 'Business',   maxLocations: 50, maxStaffPerLocation: 200, price: { USD: 89, AUD: 135, INR: 3499 } },
    enterprise: { id: 'enterprise', name: 'Enterprise', maxLocations: Infinity, maxStaffPerLocation: Infinity, price: null }
  };
  const ADDONS = {
    payroll:  { id: 'payroll',  name: 'Payroll export',        price: { USD: 10, AUD: 15, INR: 399 } },
    forecast: { id: 'forecast', name: 'AI demand forecasting', price: { USD: 20, AUD: 30, INR: 799 } },
    sms:      { id: 'sms',      name: 'SMS shift alerts',      price: { USD: 6,  AUD: 9,  INR: 249 } }
  };
  const CURRENCIES = { USD: { symbol: '$', locale: 'en-US' }, AUD: { symbol: 'A$', locale: 'en-AU' }, INR: { symbol: '₹', locale: 'en-IN' } };
  const ANNUAL_DISCOUNT = 0.2;
  const WEEKS_PER_MONTH = 52 / 12;

  function assertCurrency(c) {
    if (!CURRENCIES[c]) throw new Error('Unsupported currency: ' + c);
  }

  function toInt(n, min) {
    const v = Math.floor(Number(n));
    if (!Number.isFinite(v)) return min;
    return Math.max(min, v);
  }

  /** Smallest plan that fits the team. Forecasting is included free on Business. */
  function recommendPlan(locations, staffPerLocation, needs) {
    const L = toInt(locations, 1);
    const S = toInt(staffPerLocation, 1);
    const n = needs || {};
    if (L > PLANS.business.maxLocations || S > PLANS.business.maxStaffPerLocation || n.sso) return 'enterprise';
    if (n.forecast && L >= 3) return 'business';
    if (L <= PLANS.starter.maxLocations && S <= PLANS.starter.maxStaffPerLocation && !n.payroll && !n.forecast && !n.sms) return 'starter';
    if (L <= PLANS.team.maxLocations && S <= PLANS.team.maxStaffPerLocation) return 'team';
    return 'business';
  }

  /**
   * Price quote. Returns monthly-equivalent and billed totals.
   * opts: { locations, staffPerLocation, currency, billing: 'monthly'|'annual', addons: ['payroll',...], plan? }
   */
  function priceQuote(opts) {
    const o = opts || {};
    const currency = o.currency || 'USD';
    assertCurrency(currency);
    const locations = toInt(o.locations, 1);
    const staff = toInt(o.staffPerLocation, 1);
    const addons = (o.addons || []).filter((a) => ADDONS[a]);
    const needs = { payroll: addons.includes('payroll'), forecast: addons.includes('forecast'), sms: addons.includes('sms'), sso: !!o.sso };
    const planId = o.plan || recommendPlan(locations, staff, needs);
    const plan = PLANS[planId];
    if (!plan) throw new Error('Unknown plan: ' + planId);
    if (!plan.price) {
      return { plan: planId, planName: plan.name, currency, custom: true, locations, monthly: null, billed: null, lines: [] };
    }
    const lines = [{ label: plan.name + ' × ' + locations + ' location' + (locations > 1 ? 's' : ''), amount: plan.price[currency] * locations }];
    addons.forEach((a) => {
      if (a === 'forecast' && planId === 'business') {
        lines.push({ label: ADDONS[a].name + ' (included)', amount: 0 });
      } else {
        lines.push({ label: ADDONS[a].name + ' × ' + locations, amount: ADDONS[a].price[currency] * locations });
      }
    });
    const listMonthly = lines.reduce((s, l) => s + l.amount, 0);
    const annual = o.billing === 'annual';
    const monthly = round2(annual ? listMonthly * (1 - ANNUAL_DISCOUNT) : listMonthly);
    const billed = annual ? round2(monthly * 12) : monthly;
    return {
      plan: planId, planName: plan.name, currency, custom: false, locations, billing: annual ? 'annual' : 'monthly',
      lines, listMonthly: round2(listMonthly), monthly, billed,
      savingsPerYear: annual ? round2(listMonthly * 12 - billed) : 0,
      perLocationMonthly: round2(monthly / locations)
    };
  }

  /**
   * ROI estimate (illustrative assumptions, editable in the UI).
   * inputs: locations, schedulingHoursPerWeek (per location), managerHourlyCost,
   *         weeklyWageBill (per location), overtimePct (0-100), noShowsPerWeek (per location), costPerNoShow,
   *         softwareMonthly
   * assumptions: { timeSaved: 0.6, overtimeCut: 0.15, noShowCut: 0.25 }
   */
  const DEFAULT_ASSUMPTIONS = Object.freeze({ timeSaved: 0.6, overtimeCut: 0.15, noShowCut: 0.25 });
  function roiEstimate(inputs, assumptions) {
    const i = inputs || {};
    const a = Object.assign({}, DEFAULT_ASSUMPTIONS, assumptions || {});
    const num = (v) => { const x = Number(v); return Number.isFinite(x) && x > 0 ? x : 0; };
    const L = toInt(i.locations, 1);
    const hoursSavedMonth = num(i.schedulingHoursPerWeek) * a.timeSaved * WEEKS_PER_MONTH * L;
    const timeValue = hoursSavedMonth * num(i.managerHourlyCost);
    const overtimeMonth = num(i.weeklyWageBill) * Math.min(num(i.overtimePct), 100) / 100 * WEEKS_PER_MONTH * L;
    const overtimeSaving = overtimeMonth * a.overtimeCut;
    const noShowSaving = num(i.noShowsPerWeek) * num(i.costPerNoShow) * a.noShowCut * WEEKS_PER_MONTH * L;
    const gross = timeValue + overtimeSaving + noShowSaving;
    const software = num(i.softwareMonthly);
    const net = gross - software;
    const roiMultiple = software > 0 ? gross / software : null;
    const paybackDays = software > 0 && gross > 0 ? (software / gross) * 30 : (software === 0 ? 0 : null);
    return {
      hoursSavedMonth: round1(hoursSavedMonth),
      timeValue: round2(timeValue), overtimeSaving: round2(overtimeSaving), noShowSaving: round2(noShowSaving),
      grossMonthly: round2(gross), softwareMonthly: round2(software), netMonthly: round2(net), netAnnual: round2(net * 12),
      roiMultiple: roiMultiple === null ? null : round1(roiMultiple),
      paybackDays: paybackDays === null ? null : Math.ceil(paybackDays)
    };
  }

  // ---------- A/B headline experiment ----------
  const HEADLINE_VARIANTS = {
    A: { id: 'A', angle: 'time',    headline: 'Build next week’s roster in 10 minutes, not 4 hours.', sub: 'Shiftnest auto-fills shifts around availability, skills and labour budget, so store managers get their Sundays back.' },
    B: { id: 'B', angle: 'money',   headline: 'Cut overtime before it hits payroll.', sub: 'See labour cost against forecast sales as you schedule, and get warned before a shift tips anyone into overtime.' },
    C: { id: 'C', angle: 'people',  headline: 'Rosters your team actually likes.', sub: 'Staff swap shifts from their phone, managers approve in one tap, and nobody finds out about a change by text at 6am.' }
  };

  /** FNV-1a 32-bit hash, stable across browser and Node. */
  function fnv1a(str) {
    let h = 0x811c9dc5;
    for (let k = 0; k < str.length; k++) {
      h ^= str.charCodeAt(k);
      h = Math.imul(h, 0x01000193) >>> 0;
    }
    return h >>> 0;
  }

  /** Deterministic bucket for a visitor; an override (e.g. ?variant=B) wins if valid. */
  function assignVariant(visitorId, experiment, override, ids) {
    const keys = ids || Object.keys(HEADLINE_VARIANTS);
    if (override) {
      const o = String(override).toUpperCase();
      if (keys.includes(o)) return { variant: o, source: 'override' };
    }
    const bucket = fnv1a(String(experiment || 'hero_headline_v1') + ':' + String(visitorId || '')) % keys.length;
    return { variant: keys[bucket], source: 'hash' };
  }

  // ---------- Lead form ----------
  const FREE_EMAIL_DOMAINS = ['gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com', 'icloud.com', 'proton.me', 'protonmail.com', 'aol.com', 'live.com', 'rediffmail.com', 'yahoo.co.in'];
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function validateLead(form) {
    const f = form || {};
    const errors = {};
    const warnings = {};
    const name = String(f.name || '').trim();
    const email = String(f.email || '').trim().toLowerCase();
    const company = String(f.company || '').trim();
    const locations = Number(f.locations);
    if (name.length < 2) errors.name = 'Please enter your name.';
    if (!EMAIL_RE.test(email)) errors.email = 'Please enter a valid email address.';
    else if (FREE_EMAIL_DOMAINS.includes(email.split('@')[1])) warnings.email = 'A work email helps us set up your trial faster (personal emails are fine too).';
    if (company.length < 2) errors.company = 'Please enter your business name.';
    if (!Number.isInteger(locations) || locations < 1 || locations > 5000) errors.locations = 'Enter the number of locations (1–5000).';
    if (!['retail', 'hospitality', 'healthcare', 'warehousing', 'other'].includes(f.industry)) errors.industry = 'Please choose an industry.';
    if (!f.consent) errors.consent = 'Please tick the box so we can contact you.';
    return { valid: Object.keys(errors).length === 0, errors, warnings };
  }

  /** Lead score 0-100 used to route the fictional demo request (sales-assist vs self-serve). */
  function leadScore(form) {
    const f = form || {};
    let s = 0;
    const L = Number(f.locations) || 0;
    if (L >= 25) s += 40; else if (L >= 5) s += 30; else if (L >= 2) s += 15; else s += 5;
    const email = String(f.email || '').toLowerCase();
    if (EMAIL_RE.test(email) && !FREE_EMAIL_DOMAINS.includes(email.split('@')[1])) s += 25;
    if (f.industry === 'retail' || f.industry === 'hospitality') s += 20; else if (f.industry) s += 10;
    if (f.timeline === 'now') s += 15; else if (f.timeline === 'quarter') s += 8;
    s = Math.min(100, s);
    return { score: s, route: s >= 70 ? 'sales_assist' : s >= 40 ? 'guided_trial' : 'self_serve' };
  }

  // ---------- Attribution ----------
  function parseUtm(search) {
    const out = {};
    const q = String(search || '').replace(/^\?/, '');
    if (!q) return out;
    q.split('&').forEach((pair) => {
      const [k, v = ''] = pair.split('=');
      const key = decodeURIComponent(k || '').toLowerCase();
      if (/^utm_(source|medium|campaign|term|content)$/.test(key) || key === 'gclid' || key === 'fbclid') {
        out[key] = decodeURIComponent(v.replace(/\+/g, ' ')).slice(0, 100);
      }
    });
    return out;
  }

  function formatMoney(amount, currency, decimals) {
    assertCurrency(currency);
    const c = CURRENCIES[currency];
    const d = decimals === undefined ? (Number.isInteger(amount) ? 0 : 2) : decimals;
    return c.symbol + Number(amount).toLocaleString(c.locale, { minimumFractionDigits: d, maximumFractionDigits: d });
  }

  function round2(x) { return Math.round(x * 100) / 100; }
  function round1(x) { return Math.round(x * 10) / 10; }

  return {
    PLANS, ADDONS, CURRENCIES, ANNUAL_DISCOUNT, WEEKS_PER_MONTH, DEFAULT_ASSUMPTIONS, HEADLINE_VARIANTS, FREE_EMAIL_DOMAINS,
    recommendPlan, priceQuote, roiEstimate, fnv1a, assignVariant, validateLead, leadScore, parseUtm, formatMoney
  };
});
