'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { NaiveBayes, tokenize, looAccuracy } = require('../src/classifier');
const { prioritize } = require('../src/priority');
const { extractEntities, suggestReply } = require('../src/entities');
const { TriageService } = require('../src/triage');
const { createServer } = require('../src/server');

const examples = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'tickets.json'), 'utf8'));
const tmpFeedback = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'triage-')), 'feedback.json');

test('tokenizer drops stop words and adds bigrams', () => {
  assert.deepEqual(tokenize('Please refund my payment'), ['refund', 'payment', 'refund_payment']);
});

test('classifier recognises each category on unseen tickets', () => {
  const m = new NaiveBayes().train(examples);
  const cases = {
    'I was billed twice and want a refund': 'billing',
    'The app crashes with an error when I upload': 'bug',
    'How do I set up the Slack integration?': 'how_to',
    'My account is locked and I forgot my password': 'account',
    'It would be great if you could add a calendar view': 'feature_request',
  };
  for (const [text, want] of Object.entries(cases)) assert.equal(m.classify(text).category, want, text);
});

test('leave-one-out accuracy on the bundled 60 examples is at least 65%', () => {
  const acc = looAccuracy(examples);
  assert.ok(acc >= 0.65, `LOO accuracy ${acc}`);
});

test('unrelated text falls back to "other" with zero confidence', () => {
  const r = new NaiveBayes().train(examples).classify('zzz qqq xxx');
  assert.deepEqual([r.category, r.confidence], ['other', 0]);
});

test('probabilities sum to one', () => {
  const s = new NaiveBayes().train(examples).scores('refund my invoice');
  assert.ok(Math.abs(s.reduce((a, b) => a + b.probability, 0) - 1) < 1e-9);
});

test('priority combines transparent signals', () => {
  assert.equal(prioritize('How do I change the theme?', 'how_to').level, 'P4');
  const p = prioritize('URGENT!! Someone else accessed my account, production is down', 'account');
  assert.equal(p.level, 'P1');
  assert.ok(p.reasons.includes('possible security/fraud issue') && p.reasons.includes('urgency language'));
  assert.equal(prioritize('I was charged twice', 'billing').level, 'P2');
});

test('entities and replies', () => {
  const e = extractEntities('Charged $49.99 and 120 dollars on INV-2041 / #98765, contact ana@example.com');
  assert.deepEqual(e.amounts, ['$49.99', '120 dollars']);
  assert.deepEqual(e.references, ['INV-2041', '#98765']);
  assert.deepEqual(e.emails, ['ana@example.com']);
  assert.match(suggestReply('billing', e), /\$49\.99.*INV-2041/);
  assert.match(suggestReply('nonsense', e), /teammate/);
});

test('feedback persists and changes future predictions', () => {
  const fb = tmpFeedback();
  const svc = new TriageService(fb);
  const text = 'The flux capacitor module overheats';
  assert.equal(svc.triage(text).category, 'other');
  for (let i = 0; i < 3; i++) svc.feedback(text, 'bug');
  assert.equal(svc.triage('flux capacitor overheats again').category, 'bug');
  assert.equal(JSON.parse(fs.readFileSync(fb, 'utf8')).length, 3);
  assert.equal(new TriageService(fb).triage('flux capacitor overheats').category, 'bug'); // survives restart
  assert.throws(() => svc.feedback('x', 'made_up'), /category must be one of/);
});

function request(base, method, url, body) {
  return new Promise((resolve, reject) => {
    const req = http.request(base + url, { method }, (res) => {
      let data = '';
      res.on('data', (c) => (data += c));
      res.on('end', () => resolve({ status: res.statusCode, body: data }));
    });
    req.on('error', reject);
    if (body !== undefined) req.write(body);
    req.end();
  });
}

test('HTTP API', async () => {
  const server = createServer(new TriageService(tmpFeedback()));
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const ok = await request(base, 'POST', '/triage', JSON.stringify({ text: 'I was charged twice $49 on INV-2041, refund me ASAP!!' }));
    const body = JSON.parse(ok.body);
    assert.equal(ok.status, 200);
    assert.equal(body.category, 'billing');
    assert.ok(['P1', 'P2'].includes(body.priority.level));
    assert.deepEqual(body.entities.references, ['INV-2041']);
    assert.equal((await request(base, 'POST', '/triage', '{bad')).status, 400);
    assert.equal((await request(base, 'POST', '/triage', JSON.stringify({ text: '  ' }))).status, 400);
    assert.equal((await request(base, 'POST', '/feedback', JSON.stringify({ text: 'x', category: 'zzz' }))).status, 400);
    assert.equal((await request(base, 'GET', '/health')).status, 200);
    assert.equal((await request(base, 'GET', '/nope')).status, 404);
    assert.match((await request(base, 'GET', '/')).body, /<title>Ticket Triage<\/title>/);
  } finally {
    server.close();
  }
});
