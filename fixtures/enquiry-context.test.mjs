import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const source = readFileSync(new URL('../scripts/enquiry-context.js', import.meta.url), 'utf8').replaceAll('export function', 'function');
const helpers = vm.runInNewContext(source + '\n({publicPageUrl,enquiryContext,readEnquiryContext,enquiryLink,enquiryMail,mountEnquiryContext})', { URL, URLSearchParams });
const context = { site: 'site:one', content: 'article:one', page: 'https://one.example/article/', button: 'services-footer' };
const copy = { heading: 'Where this enquiry began', page: 'Page', button: 'Link', actions: {
  'services-footer': 'Services in the footer', 'services-invitation': 'Services invitation',
  'services-link': 'Services link', 'enquiry-email': 'Email on the Services page'
} };
const query = value => '?' + new URLSearchParams(Object.entries(value).map(([key, value]) => [`g_from_${key}`, value]));

test('outgoing source removes query secrets and fragments while destination query and fragment survive', () => {
  const result = helpers.enquiryLink('../services/?topic=two%20words&x=%2f#contact', { ...context, page: context.page + '?token=private#draft' }, 'https://one.example/article/');
  assert.ok(result.startsWith('../services/?topic=two%20words&x=%2f&'));
  assert.ok(result.endsWith('#contact'));
  const parsed = new URL(result, context.page);
  assert.equal(parsed.searchParams.get('g_from_page'), context.page);
  assert.ok(!result.includes('private'));
  assert.equal(helpers.enquiryLink(result, context, context.page), result);
});

test('incoming context is complete and bounded, and rejects duplicate fields and query-bearing source pages', () => {
  assert.equal(helpers.readEnquiryContext(query(context)).page, context.page);
  for (const value of [query(context) + '&g_from_site=site:other', '?g_from_site=site:one', query({ ...context, page: context.page + '?secret=hidden' }), query({ ...context, page: context.page + '#draft' }), query({ ...context, site: 'x'.repeat(257) }), query({ ...context, button: 'bad button' })]) {
    assert.equal(helpers.readEnquiryContext(value), null, value);
  }
});

test('source URLs reject credentials, unsafe schemes and literal or encoded controls', () => {
  for (const page of ['javascript:alert(1)', 'https://user:secret@one.example/', 'https://one.example/\npath', 'https://one.example/%0d%0aBcc:other', 'https://one.example/%250d%250a', 'https://one.example/%25250a']) {
    assert.equal(helpers.enquiryContext({ ...context, page }), null, page);
  }
  assert.equal(helpers.readEnquiryContext(query({ ...context, site: 'site:one\r\nBcc:other' })), null);
  assert.equal(helpers.publicPageUrl('https://one.example/a%20b/'), 'https://one.example/a%20b/');
});

test('email preserves recipients, subject and authored body; adds readable context once without internal IDs', () => {
  const original = 'mailto:first@example.test,second@example.test?subject=An%20enquiry&body=My%20question%0ASecond%20line&cc=third%40example.test';
  const result = helpers.enquiryMail(original, context, copy);
  const parsed = new URL(result);
  assert.equal(parsed.pathname, 'first@example.test,second@example.test');
  assert.equal(parsed.searchParams.get('subject'), 'An enquiry');
  assert.equal(parsed.searchParams.get('cc'), 'third@example.test');
  const body = parsed.searchParams.get('body');
  assert.ok(body.startsWith('My question\nSecond line\n\nWhere this enquiry began\n'));
  assert.ok(body.endsWith('Link: Services in the footer'));
  assert.ok(body.includes(context.page));
  assert.ok(!body.includes('site:one') && !body.includes('article:one') && !body.includes('services-footer'));
  assert.equal(helpers.enquiryMail(result, context, copy), result);
});

test('missing labels, unknown action and ambiguous body leave the authored email untouched', () => {
  assert.equal(helpers.enquiryMail('mailto:one@example.test', context, null), null);
  assert.equal(helpers.enquiryMail('mailto:one@example.test', { ...context, button: 'unmapped' }, copy), null);
  assert.equal(helpers.enquiryMail('mailto:one@example.test?body=one&Body=two', context, copy), null);
  assert.equal(helpers.enquiryMail('mailto:one%0d%0aBcc:other@example.test', context, copy), null);
  assert.equal(new URL(helpers.enquiryMail('mailto:one@example.test?Body=Opening', context, copy)).searchParams.get('Body').startsWith('Opening\n\n'), true);
});

test('missing subject uses the configured source-page template while any authored subject survives', () => {
  const configured = { ...copy, subject: 'Enquiry from {page}' };
  const result = helpers.enquiryMail('mailto:one@example.test?body=My%20question', context, configured);
  assert.equal(new URL(result).searchParams.get('subject'), `Enquiry from ${context.page}`);
  assert.equal(helpers.enquiryMail(result, context, configured), result);
  for (const subject of ['subject=An%20authored%20subject', 'Subject=An%20authored%20subject', 'subject=']) {
    const retained = new URL(helpers.enquiryMail(`mailto:one@example.test?${subject}`, context, configured));
    const key = subject.startsWith('Subject') ? 'Subject' : 'subject';
    assert.equal(retained.searchParams.get(key), subject.endsWith('=') ? '' : 'An authored subject');
    assert.equal([...retained.searchParams.keys()].filter(key => key.toLowerCase() === 'subject').length, 1);
  }
});

test('invalid optional subject templates cannot add headers, unknown slots or repeated page placeholders', () => {
  for (const subject of [undefined, 'An enquiry', '{page} and {page}', '{page} {other}', 'Enquiry\r\nBcc: elsewhere {page}', 'x'.repeat(256) + '{page}']) {
    const result = new URL(helpers.enquiryMail('mailto:one@example.test', context, { ...copy, subject }));
    assert.equal(result.searchParams.has('subject'), false);
    assert.ok(result.searchParams.get('body').includes(context.page));
  }
});

function anchor(href, dataset = {}) {
  return { dataset, getAttribute: name => name === 'href' ? href : null, setAttribute(name, value) { assert.equal(name, 'href'); href = value; } };
}

function fixture({ services = false, search = '', labels = copy } = {}) {
  const destination = { site: 'site:two', content: 'page:services', url: 'https://two.example/services/' };
  const from = services ? destination : { site: context.site, content: context.content, url: context.page };
  const exact = anchor(destination.url + '?topic=design#enquire', { gazetteDestinationSite: destination.site, gazetteDestinationContent: destination.content, enquiryButton: 'services-invitation' });
  const wrongSite = anchor(destination.url, { gazetteDestinationSite: 'site:other', gazetteDestinationContent: destination.content });
  const wrongContent = anchor(destination.url, { gazetteDestinationSite: destination.site, gazetteDestinationContent: 'page:other' });
  const email = anchor('mailto:hello@example.test?subject=Hello&body=An%20authored%20opening');
  const globalContact = anchor('mailto:records@example.test');
  const root = {
    defaultView: { location: { href: from.url + search, search } },
    querySelector: selector => selector === '#enquiry-context' ? { textContent: JSON.stringify({ source: from, destination, copy: labels }) } : null,
    querySelectorAll: selector => selector === 'a[data-gazette-destination-content]' ? [exact, wrongSite, wrongContent] : selector === 'main .primary-action a[href^="mailto:"]' ? [email] : []
  };
  return { root, exact, wrongSite, wrongContent, email, globalContact };
}

test('controller uses exact destination coordinates; links work without email copy and emails stay untouched off Services', () => {
  const f = fixture({ labels: null });
  helpers.mountEnquiryContext(f.root);
  assert.ok(f.exact.getAttribute('href').includes('g_from_button=services-invitation'));
  assert.equal(f.wrongSite.getAttribute('href'), 'https://two.example/services/');
  assert.equal(f.wrongContent.getAttribute('href'), 'https://two.example/services/');
  assert.equal(f.email.getAttribute('href'), 'mailto:hello@example.test?subject=Hello&body=An%20authored%20opening');
});

test('Services email carries incoming origin through repeated reconciliation and mounts, preserving ordinary mail links', () => {
  const f = fixture({ services: true, search: query(context) });
  const controller = helpers.mountEnquiryContext(f.root);
  const once = f.email.getAttribute('href');
  controller.reconcile();
  helpers.mountEnquiryContext(f.root).reconcile();
  assert.equal(f.email.getAttribute('href'), once);
  assert.ok(new URL(once).searchParams.get('body').includes(context.page));
  assert.equal(f.email.dataset.enquiryButton, 'enquiry-email');
  assert.equal(f.globalContact.getAttribute('href'), 'mailto:records@example.test');
});

test('Services self-links keep their fragments and incoming origin; another page still carries origin to a Services section', () => {
  const services = fixture({ services: true, search: query(context) });
  services.exact.setAttribute('href', '#enquire');
  const controller = helpers.mountEnquiryContext(services.root);
  controller.reconcile();
  assert.equal(services.exact.getAttribute('href'), '#enquire');
  assert.ok(new URL(services.email.getAttribute('href')).searchParams.get('body').includes(context.page));
  const fromArticle = fixture();
  helpers.mountEnquiryContext(fromArticle.root);
  const onward = new URL(fromArticle.exact.getAttribute('href'));
  assert.equal(onward.hash, '#enquire');
  assert.equal(onward.searchParams.get('g_from_page'), context.page);
  assert.equal(onward.searchParams.get('topic'), 'design');
});

test('direct Services visits and rejected incoming context use only the current canonical Services page', () => {
  for (const search of ['', query({ ...context, page: context.page + '?secret=private' })]) {
    const f = fixture({ services: true, search });
    helpers.mountEnquiryContext(f.root);
    const body = new URL(f.email.getAttribute('href')).searchParams.get('body');
    assert.ok(body.includes('https://two.example/services/'));
    assert.ok(body.endsWith('Link: Email on the Services page'));
    assert.ok(!body.includes('private') && !body.includes(context.page));
  }
});

test('an absent or invalid source binding leaves links alone; an unmarked exact destination gets the shared link label', () => {
  const f = fixture();
  delete f.exact.dataset.enquiryButton;
  helpers.mountEnquiryContext(f.root);
  assert.equal(new URL(f.exact.getAttribute('href')).searchParams.get('g_from_button'), 'services-link');
  const original = f.email.getAttribute('href');
  f.root.querySelector = () => null;
  assert.equal(helpers.mountEnquiryContext(f.root), null);
  f.root.querySelector = () => ({ textContent: JSON.stringify({ source: { site: 'bad site' }, destination: {} }) });
  assert.equal(helpers.mountEnquiryContext(f.root), null);
  assert.equal(f.email.getAttribute('href'), original);
});
