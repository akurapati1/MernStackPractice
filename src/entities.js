'use strict';

function extractEntities(text) {
  return {
    emails: text.match(/[\w.+-]+@[\w-]+\.[\w.]+/g) || [],
    references: (text.match(/(?<!\w)(?:#\d{3,}|(?:INV|ORD|TKT)-\d+)(?!\w)/gi) || []),
    amounts: (text.match(/\$\s?\d[\d,]*(?:\.\d+)?|\b\d[\d,]*(?:\.\d+)?\s?(?:dollars|usd|eur)\b/gi) || []),
  };
}

const TEMPLATES = {
  billing: (e) => `Thanks for flagging this${e.amounts.length ? ` (${e.amounts.join(', ')})` : ''}. I am checking the billing records${e.references.length ? ` for ${e.references[0]}` : ''} and will confirm any correction or refund within one business day.`,
  bug: () => 'Sorry about the trouble. Could you share your browser or app version, the steps that trigger it and any error text? That lets us reproduce and fix it quickly.',
  how_to: () => 'Happy to help! Here is the relevant guide from our help center - tell me if you would like a walkthrough of any step.',
  account: () => 'For your security I will verify your identity before changing anything on the account. Please reply from the registered email address.',
  feature_request: () => 'Thank you for the suggestion - I have logged it with the product team and will let you know if it is scheduled.',
  other: () => 'Thanks for reaching out. A teammate will review your message and follow up shortly.',
};

function suggestReply(category, entities) {
  return (TEMPLATES[category] || TEMPLATES.other)(entities);
}

module.exports = { extractEntities, suggestReply };
