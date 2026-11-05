'use strict';
// Multinomial Naive Bayes over unigrams + bigrams with Laplace smoothing. No dependencies.

const STOP = new Set('a an the of to in and or for on with is are was were be by it this that my i we our your you me please'.split(' '));

function tokenize(text) {
  const words = (text.toLowerCase().match(/[a-z0-9']+/g) || []).filter((w) => !STOP.has(w));
  const grams = [...words];
  for (let i = 0; i < words.length - 1; i++) grams.push(`${words[i]}_${words[i + 1]}`);
  return grams;
}

class NaiveBayes {
  constructor(alpha = 0.3) {
    this.alpha = alpha;
    this.docs = 0;
    this.classCount = new Map();
    this.wordCount = new Map(); // class -> Map(token -> count)
    this.totalWords = new Map();
    this.vocab = new Set();
  }

  train(examples) {
    for (const { text, category } of examples) {
      this.docs++;
      this.classCount.set(category, (this.classCount.get(category) || 0) + 1);
      if (!this.wordCount.has(category)) { this.wordCount.set(category, new Map()); this.totalWords.set(category, 0); }
      const wc = this.wordCount.get(category);
      for (const t of tokenize(text)) {
        wc.set(t, (wc.get(t) || 0) + 1);
        this.totalWords.set(category, this.totalWords.get(category) + 1);
        this.vocab.add(t);
      }
    }
    return this;
  }

  /** Returns [{category, probability}] sorted by probability (softmax over log-posteriors). */
  scores(text) {
    const tokens = tokenize(text);
    const V = this.vocab.size;
    const logs = [];
    for (const [cat, count] of this.classCount) {
      let lp = Math.log(count / this.docs);
      const wc = this.wordCount.get(cat);
      const denom = this.totalWords.get(cat) + this.alpha * V;
      for (const t of tokens) {
        if (!this.vocab.has(t)) continue; // unseen tokens carry no evidence
        lp += Math.log(((wc.get(t) || 0) + this.alpha) / denom);
      }
      logs.push([cat, lp]);
    }
    const max = Math.max(...logs.map((l) => l[1]));
    const exps = logs.map(([c, l]) => [c, Math.exp(l - max)]);
    const sum = exps.reduce((s, e) => s + e[1], 0);
    return exps.map(([category, e]) => ({ category, probability: e / sum })).sort((a, b) => b.probability - a.probability);
  }

  classify(text, minConfidence = 0.5) {
    const ranked = this.scores(text);
    const top = ranked[0];
    const known = tokenize(text).some((t) => this.vocab.has(t));
    return { category: known && top.probability >= minConfidence ? top.category : 'other', confidence: known ? top.probability : 0, ranked: ranked.slice(0, 3) };
  }
}

/** Leave-one-out cross-validation accuracy. */
function looAccuracy(examples) {
  let ok = 0;
  examples.forEach((ex, i) => {
    const model = new NaiveBayes().train(examples.filter((_, j) => j !== i));
    if (model.scores(ex.text)[0].category === ex.category) ok++;
  });
  return ok / examples.length;
}

module.exports = { NaiveBayes, tokenize, looAccuracy };
