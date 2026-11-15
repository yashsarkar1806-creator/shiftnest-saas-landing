/* Shiftnest landing page UI wiring (fictional brand). All data stays in the browser. */
(function () {
  'use strict';
  const L = window.ShiftnestLogic;
  const $ = (s, r) => (r || document).querySelector(s);
  const $$ = (s, r) => Array.from((r || document).querySelectorAll(s));
  const EXPERIMENT = 'hero_headline_v1';
  const params = new URLSearchParams(location.search);

  // ---------- storage helpers (fail-safe if storage is blocked) ----------
  const store = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) { /* ignore */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* ignore */ } }
  };
  function visitorId() {
    let id = store.get('sn_vid');
    if (!id) { id = 'v_' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36); store.set('sn_vid', id); }
    return id;
  }

  // ---------- attribution ----------
  const utmNow = L.parseUtm(location.search);
  if (Object.keys(utmNow).length) store.set('sn_utm', JSON.stringify(utmNow));
  let utm = {};
  try { utm = JSON.parse(store.get('sn_utm') || '{}'); } catch (e) { utm = {}; }

  // ---------- dataLayer + inspector ----------
  const logEl = $('#debug-log');
  let variant = 'A';
  function track(event, props) {
    const payload = Object.assign({ event, experiment_id: EXPERIMENT, experiment_variant: variant, ts: new Date().toISOString() }, utm, props || {});
    window.dataLayer.push(payload);
    if (logEl) {
      const li = document.createElement('li');
      li.textContent = JSON.stringify(payload);
      logEl.prepend(li);
    }
    return payload;
  }

  // ---------- A/B headline ----------
  const assignment = L.assignVariant(visitorId(), EXPERIMENT, params.get('variant'));
  variant = assignment.variant;
  const v = L.HEADLINE_VARIANTS[variant];
  $('#hero-headline').textContent = v.headline;
  $('#hero-sub').textContent = v.sub;
  document.documentElement.dataset.variant = variant;
  $('#debug-variant').textContent = 'Variant ' + variant + ' (' + v.angle + ', ' + assignment.source + ')';
  track('page_view', { page_type: 'landing' });
  track('experiment_impression', { assignment_source: assignment.source, headline_angle: v.angle });

  $$('[data-cta]').forEach((a) => a.addEventListener('click', () => track('cta_click', { cta_id: a.dataset.cta, cta_text: a.textContent.trim() })));

  // scroll depth + section views
  if ('IntersectionObserver' in window) {
    const seen = new Set();
    const io = new IntersectionObserver((entries) => entries.forEach((en) => {
      if (en.isIntersecting && !seen.has(en.target.id)) { seen.add(en.target.id); track('section_view', { section_id: en.target.id }); }
    }), { threshold: 0.4 });
    $$('main > section[id]').forEach((s) => io.observe(s));
  }

  // ---------- nav ----------
  const toggle = $('.nav-toggle');
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') === 'true';
    toggle.setAttribute('aria-expanded', String(!open));
    $('#nav-links').classList.toggle('open', !open);
  });
  $$('#nav-links a').forEach((a) => a.addEventListener('click', () => { toggle.setAttribute('aria-expanded', 'false'); $('#nav-links').classList.remove('open'); }));

  // ---------- hero mock ----------
  $('#mock-fix').addEventListener('click', () => {
    const cell = $('.mock-grid .warn');
    if (cell) { cell.textContent = 'Mei 3–11'; cell.className = 's c'; }
    $('#mock-status').textContent = 'Fixed: Mei covers Friday close, Tom stays at 30h.';
    track('demo_interaction', { element: 'hero_mock_autofix' });
  });

  // ---------- tabs (ARIA pattern with arrow keys) ----------
  $$('[data-tabs]').forEach((wrap) => {
    const tabs = $$('[role="tab"]', wrap);
    function select(t) {
      tabs.forEach((x) => {
        const on = x === t;
        x.setAttribute('aria-selected', String(on));
        x.tabIndex = on ? 0 : -1;
        document.getElementById(x.getAttribute('aria-controls')).hidden = !on;
      });
      t.focus();
      track('tab_select', { tab_id: t.id });
    }
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight') select(tabs[(i + 1) % tabs.length]);
        if (e.key === 'ArrowLeft') select(tabs[(i - 1 + tabs.length) % tabs.length]);
        if (e.key === 'Home') select(tabs[0]);
        if (e.key === 'End') select(tabs[tabs.length - 1]);
      });
    });
  });

  // ---------- pricing ----------
  const planForm = $('#plan-form');
  let currentQuote = null;
  function readPlanForm() {
    return {
      locations: Number($('#p-locations').value) || 1,
      staffPerLocation: Number($('#p-staff').value) || 1,
      currency: $('#p-currency').value,
      billing: $('input[name="billing"]:checked', planForm).value,
      addons: $$('input[name="addons"]:checked', planForm).map((i) => i.value),
      sso: $('input[name="sso"]', planForm).checked
    };
  }
  function renderPricing(fromUser) {
    const o = readPlanForm();
    const q = L.priceQuote(o);
    currentQuote = q;
    const fmt = (n) => L.formatMoney(n, o.currency);
    ['team', 'business'].forEach((p) => {
      const base = L.PLANS[p].price[o.currency] * (o.billing === 'annual' ? 1 - L.ANNUAL_DISCOUNT : 1);
      $('[data-price="' + p + '"]').innerHTML = fmt(Math.round(base * 100) / 100) + '<span>/location/mo</span>';
    });
    $$('.plan').forEach((el) => {
      const on = el.dataset.plan === q.plan;
      el.classList.toggle('recommended', on);
      el.setAttribute('aria-current', on ? 'true' : 'false');
    });
    const out = $('#quote');
    if (q.custom) {
      out.innerHTML = '<h3>Recommended: Enterprise</h3><p>For ' + q.locations + ' locations or SSO we build a custom quote. <a href="#demo" data-cta="quote_enterprise">Talk to sales</a>.</p>';
    } else {
      const rows = q.lines.map((l) => '<tr><td>' + l.label + '</td><td>' + fmt(l.amount) + '</td></tr>').join('');
      out.innerHTML = '<h3>Recommended: ' + q.planName + '</h3>' +
        '<table class="quote-table"><caption class="sr-only">Quote breakdown</caption><tbody>' + rows +
        (q.billing === 'annual' ? '<tr><td>Annual discount (20%)</td><td>−' + fmt(Math.round((q.listMonthly - q.monthly) * 100) / 100) + '</td></tr>' : '') +
        '</tbody><tfoot><tr><th scope="row">Per month</th><td>' + fmt(q.monthly) + '</td></tr>' +
        (q.billing === 'annual' ? '<tr><th scope="row">Billed yearly</th><td>' + fmt(q.billed) + ' <span class="save">you save ' + fmt(q.savingsPerYear) + '/yr</span></td></tr>' : '') +
        '</tfoot></table>';
    }
    if (fromUser) track('plan_quote', { plan: q.plan, currency: q.currency, billing: o.billing, locations: o.locations, value_monthly: q.monthly });
    renderRoi(false);
  }
  let pricingTimer;
  planForm.addEventListener('input', () => { clearTimeout(pricingTimer); pricingTimer = setTimeout(() => renderPricing(true), 250); });
  planForm.addEventListener('submit', (e) => e.preventDefault());

  // ---------- ROI ----------
  const roiForm = $('#roi-form');
  function renderRoi(fromUser) {
    const cur = $('#p-currency').value;
    const locs = Number($('#r-locations').value) || 1;
    // Software cost: price the same configuration at the ROI location count.
    const pf = readPlanForm();
    const q = L.priceQuote(Object.assign({}, pf, { locations: locs }));
    const software = q.custom ? null : q.monthly;
    $('#r-ot-val').textContent = $('#r-ot').value + '%';
    const r = L.roiEstimate({
      locations: locs,
      schedulingHoursPerWeek: $('#r-hours').value,
      managerHourlyCost: $('#r-rate').value,
      weeklyWageBill: $('#r-wages').value,
      overtimePct: $('#r-ot').value,
      noShowsPerWeek: $('#r-noshow').value,
      costPerNoShow: $('#r-noshow-cost').value,
      softwareMonthly: software || 0
    }, {
      timeSaved: (Number($('#a-time').value) || 0) / 100,
      overtimeCut: (Number($('#a-ot').value) || 0) / 100,
      noShowCut: (Number($('#a-ns').value) || 0) / 100
    });
    const fmt = (n) => L.formatMoney(Math.round(n), cur, 0);
    $('#roi-net').textContent = fmt(r.netMonthly);
    $('#roi-net').classList.toggle('neg', r.netMonthly < 0);
    $('#roi-sub').textContent = 'net saving per month · ' + fmt(r.netAnnual) + ' per year';
    $('#roi-hours').textContent = r.hoursSavedMonth + ' h / month';
    $('#roi-time').textContent = fmt(r.timeValue);
    $('#roi-ot').textContent = fmt(r.overtimeSaving);
    $('#roi-ns').textContent = fmt(r.noShowSaving);
    $('#roi-cost').textContent = software === null ? 'Custom (Enterprise)' : fmt(software) + ' (' + q.planName + ')';
    $('#roi-multiple').textContent = r.roiMultiple === null ? '—' : r.roiMultiple + '×';
    $('#roi-payback').textContent = r.paybackDays === null ? 'No payback at these inputs' : (r.paybackDays === 0 ? 'Immediate (free plan)' : r.paybackDays + ' days');
    const g = r.grossMonthly || 1;
    $('#bar-time').style.width = (r.timeValue / g * 100) + '%';
    $('#bar-ot').style.width = (r.overtimeSaving / g * 100) + '%';
    $('#bar-ns').style.width = (r.noShowSaving / g * 100) + '%';
    if (fromUser) track('roi_calculated', { currency: cur, locations: locs, net_monthly: r.netMonthly, roi_multiple: r.roiMultiple });
  }
  let roiTimer;
  roiForm.addEventListener('input', () => { renderRoi(false); clearTimeout(roiTimer); roiTimer = setTimeout(() => renderRoi(true), 600); });
  roiForm.addEventListener('submit', (e) => e.preventDefault());

  // ---------- lead form ----------
  const leadForm = $('#lead-form');
  const pl = Number($('#p-locations').value);
  leadForm.addEventListener('focusin', function once() { track('form_start', { form_id: 'demo_request' }); leadForm.removeEventListener('focusin', once); });
  leadForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const data = {
      name: $('#f-name').value, email: $('#f-email').value, company: $('#f-company').value,
      locations: $('#f-locations').value === '' ? NaN : Number($('#f-locations').value),
      industry: $('#f-industry').value, timeline: $('#f-timeline').value, consent: $('#f-consent').checked
    };
    const res = L.validateLead(data);
    ['name', 'email', 'company', 'locations', 'industry', 'consent'].forEach((k) => {
      const input = $('#f-' + k);
      const msg = res.errors[k] || res.warnings[k] || '';
      $('#e-' + k).textContent = msg;
      $('#e-' + k).classList.toggle('warn', !res.errors[k] && !!res.warnings[k]);
      input.setAttribute('aria-invalid', res.errors[k] ? 'true' : 'false');
    });
    const out = $('#form-result');
    if (!res.valid) {
      const first = Object.keys(res.errors)[0];
      $('#f-' + first).focus();
      out.textContent = 'Please fix ' + Object.keys(res.errors).length + ' field(s) above.';
      track('form_error', { form_id: 'demo_request', error_fields: Object.keys(res.errors).join(',') });
      return;
    }
    const s = L.leadScore(data);
    const routes = {
      sales_assist: 'A product specialist would call you within one business day to plan a multi-site rollout.',
      guided_trial: 'You’d get a guided 14-day Business trial with a setup call.',
      self_serve: 'You’d get instant access to the free Starter plan with an onboarding checklist.'
    };
    store.set('sn_lead_demo', JSON.stringify({ company: data.company, locations: data.locations, route: s.route, at: new Date().toISOString() }));
    out.innerHTML = '<strong>Thanks, ' + escapeHtml(data.name.trim().split(' ')[0]) + '!</strong> ' + routes[s.route] +
      ' <span class="note">(Demo only: nothing was sent. Lead score ' + s.score + '/100 → ' + s.route.replace('_', ' ') + ')</span>';
    track('generate_lead', { form_id: 'demo_request', lead_route: s.route, lead_score: s.score, locations: data.locations, industry: data.industry, quoted_plan: currentQuote && currentQuote.plan });
    leadForm.reset();
  });
  // prefill location count from pricing picker
  $('#f-locations').placeholder = 'e.g. ' + pl;

  function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  // ---------- FAQ tracking ----------
  $$('details.faq').forEach((d) => d.addEventListener('toggle', () => { if (d.open) track('faq_open', { question: $('summary', d).textContent }); }));

  // ---------- debug inspector ----------
  const panel = $('#debug-panel');
  const dbgBtn = $('#debug-toggle');
  function setDebug(on) { panel.hidden = !on; dbgBtn.setAttribute('aria-expanded', String(on)); dbgBtn.textContent = on ? 'Hide tracking events' : 'Show tracking events'; }
  dbgBtn.addEventListener('click', () => setDebug(panel.hidden));
  $('#debug-close').addEventListener('click', () => setDebug(false));
  $('#debug-reset').addEventListener('click', () => { store.del('sn_vid'); store.del('sn_utm'); location.href = location.pathname + '?debug=1'; });
  if (params.get('debug') === '1' || params.has('variant')) setDebug(true);

  renderPricing(false);
})();
