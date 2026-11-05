'use strict';

const URGENT = /\b(urgent|asap|immediately|right now|emergency|production|outage|down|data loss|lost (all|my)|deadline|blocked)\b/i;
const SECURITY = /\b(hacked|fraud|unauthori[sz]ed|someone else|stolen|breach|secure it|unknown charge)\b/i;
const MONEY = /\b(charged twice|double charge|overcharg|wrong amount|refund)\b/i;
const NEGATIVE = /\b(angry|furious|terrible|awful|worst|unacceptable|ridiculous|useless|frustrated|disappointed|cancel)\b/i;
const CATEGORY_WEIGHT = { account: 1, billing: 1, bug: 1, how_to: 0, feature_request: -1, other: 0 };

/** Transparent additive score -> P1 (act now) .. P4 (backlog), with the reasons that produced it. */
function prioritize(text, category = 'other') {
  let score = 0;
  const reasons = [];
  const add = (n, why) => { score += n; reasons.push(why); };
  if (URGENT.test(text)) add(3, 'urgency language');
  if (SECURITY.test(text)) add(4, 'possible security/fraud issue');
  if (MONEY.test(text)) add(2, 'money at stake');
  if (NEGATIVE.test(text)) add(1, 'negative sentiment');
  const bangs = (text.match(/!/g) || []).length;
  if (bangs >= 2) add(1, 'multiple exclamation marks');
  const letters = text.replace(/[^A-Za-z]/g, '');
  if (letters.length > 12 && letters.replace(/[^A-Z]/g, '').length / letters.length > 0.5) add(1, 'written in capitals');
  const w = CATEGORY_WEIGHT[category] ?? 0;
  if (w) add(w, `${category} tickets default ${w > 0 ? 'higher' : 'lower'}`);
  const level = score >= 5 ? 'P1' : score >= 3 ? 'P2' : score >= 1 ? 'P3' : 'P4';
  return { level, score, reasons };
}

module.exports = { prioritize };
