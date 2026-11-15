// Static checks on the HTML so SEO/accessibility/tracking hooks don't silently break.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const app = fs.readFileSync(path.join(root, 'js/app.js'), 'utf8');

test('index.html has SEO and Open Graph tags', () => {
  for (const re of [/<title>[^<]{20,}<\/title>/, /name="description"/, /rel="canonical"/, /property="og:title"/, /property="og:image"/, /name="twitter:card"/, /application\/ld\+json/, /<html lang="en">/]) assert.match(html, re);
});
test('OG image exists and is a 1200x630 PNG', () => {
  const buf = fs.readFileSync(path.join(root, 'assets/og-image.png'));
  assert.equal(buf.toString('ascii', 1, 4), 'PNG');
  assert.equal(buf.readUInt32BE(16), 1200);
  assert.equal(buf.readUInt32BE(20), 630);
});
test('every form control in index.html has a matching label', () => {
  const ids = [...html.matchAll(/<(?:input|select)[^>]*\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.ok(ids.length > 15);
  ids.forEach((id) => assert.match(html, new RegExp('for="' + id + '"'), 'missing label for #' + id));
});
test('every element id referenced by app.js exists in index.html', () => {
  const refs = new Set([...app.matchAll(/\$\('#([a-z0-9-]+)'\)/gi)].map((m) => m[1]));
  refs.forEach((id) => assert.match(html, new RegExp('id="' + id + '"'), 'missing #' + id));
});
test('ids in index.html are unique', () => {
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
  assert.equal(new Set(ids).size, ids.length);
});
test('page is clearly labelled fictional and has a skip link', () => {
  assert.match(html, /fictional brand/i);
  assert.match(html, /class="skip-link"/);
});
test('tracking: core GA4-style events are wired', () => {
  ['page_view', 'experiment_impression', 'cta_click', 'plan_quote', 'roi_calculated', 'form_start', 'form_error', 'generate_lead'].forEach((e) => assert.match(app, new RegExp("'" + e + "'")));
});
