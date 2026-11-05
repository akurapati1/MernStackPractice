'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { NaiveBayes } = require('./classifier');
const { prioritize } = require('./priority');
const { extractEntities, suggestReply } = require('./entities');

const DATA = path.join(__dirname, '..', 'data');

function loadExamples(feedbackPath = path.join(DATA, 'feedback.json')) {
  const base = JSON.parse(fs.readFileSync(path.join(DATA, 'tickets.json'), 'utf8'));
  const extra = fs.existsSync(feedbackPath) ? JSON.parse(fs.readFileSync(feedbackPath, 'utf8')) : [];
  return [...base, ...extra];
}

class TriageService {
  constructor(feedbackPath = path.join(DATA, 'feedback.json')) {
    this.feedbackPath = feedbackPath;
    this.model = new NaiveBayes().train(loadExamples(feedbackPath));
  }

  triage(text) {
    const c = this.model.classify(text);
    const entities = extractEntities(text);
    return { category: c.category, confidence: Number(c.confidence.toFixed(3)), alternatives: c.ranked.map((r) => ({ category: r.category, probability: Number(r.probability.toFixed(3)) })),
      priority: prioritize(text, c.category), entities, suggestedReply: suggestReply(c.category, entities), needsHuman: c.confidence < 0.6 };
  }

  /** Human correction: persisted and learned immediately (online update, no full retrain needed). */
  feedback(text, category) {
    const known = [...this.model.classCount.keys()];
    if (!known.includes(category)) throw new Error(`category must be one of: ${known.join(', ')}`);
    const extra = fs.existsSync(this.feedbackPath) ? JSON.parse(fs.readFileSync(this.feedbackPath, 'utf8')) : [];
    extra.push({ text, category });
    fs.writeFileSync(this.feedbackPath, JSON.stringify(extra, null, 1));
    this.model.train([{ text, category }]);
  }
}

module.exports = { TriageService };
