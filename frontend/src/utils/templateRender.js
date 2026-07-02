const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

export function extractPlaceholders(text) {
  if (!text) return [];
  const seen = new Set();
  const result = [];
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  let match;
  while ((match = re.exec(text)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

export function renderTemplate(text, values = {}) {
  if (!text) return '';
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  return text.replace(re, (token, key) => {
    if (
      Object.prototype.hasOwnProperty.call(values, key) &&
      values[key] != null &&
      values[key] !== ''
    ) {
      return String(values[key]);
    }
    return token;
  });
}

export function buildExampleValues(variables) {
  const map = {};
  for (const v of variables || []) {
    if (v && v.key) {
      map[v.key] = v.exampleValue || v.label || v.key;
    }
  }
  return map;
}

export function previewTemplate(text, variables) {
  return renderTemplate(text, buildExampleValues(variables));
}
