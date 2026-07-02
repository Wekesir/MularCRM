const pool = require('../db/pool');

const PLACEHOLDER_REGEX = /\{\{\s*([a-zA-Z_][a-zA-Z0-9_]*)\s*\}\}/g;

function normalizeVariable(row) {
  return {
    id: row.id,
    key: row.key,
    label: row.label,
    description: row.description || null,
    exampleValue: row.example_value || null,
    category: row.category || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Extract unique {{variable}} placeholder keys from arbitrary text.
 * @param {string} text
 * @returns {string[]} unique keys in order of first appearance
 */
function extractPlaceholders(text) {
  if (!text) return [];
  const seen = new Set();
  const result = [];
  let match;
  PLACEHOLDER_REGEX.lastIndex = 0;
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  while ((match = re.exec(text)) !== null) {
    const key = match[1];
    if (!seen.has(key)) {
      seen.add(key);
      result.push(key);
    }
  }
  return result;
}

/**
 * Replace {{key}} tokens in text with provided values.
 * Missing keys are left as the original token so problems are visible.
 * @param {string} text
 * @param {Record<string, string|number|null|undefined>} values
 */
function renderTemplate(text, values = {}) {
  if (!text) return '';
  const re = new RegExp(PLACEHOLDER_REGEX.source, 'g');
  return text.replace(re, (token, key) => {
    if (Object.prototype.hasOwnProperty.call(values, key) && values[key] != null && values[key] !== '') {
      return String(values[key]);
    }
    return token;
  });
}

async function listTemplateVariables() {
  const [rows] = await pool.query('SELECT * FROM template_variables ORDER BY `key` ASC');
  return rows.map(normalizeVariable);
}

async function getTemplateVariableById(id) {
  const [rows] = await pool.query('SELECT * FROM template_variables WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeVariable(rows[0]) : null;
}

async function getTemplateVariableByKey(key) {
  const [rows] = await pool.query('SELECT * FROM template_variables WHERE `key` = ? LIMIT 1', [key]);
  return rows[0] ? normalizeVariable(rows[0]) : null;
}

function validateVariableInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.key !== undefined) {
    if (!data.key || !/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(String(data.key))) {
      errors.push('Key must be alphanumeric/underscore and start with a letter or underscore');
    }
  }
  if (!partial || data.label !== undefined) {
    if (!data.label || !String(data.label).trim()) errors.push('Label is required');
  }
  return errors;
}

async function createTemplateVariable(data) {
  const errors = validateVariableInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const key = String(data.key).trim();
  const existing = await getTemplateVariableByKey(key);
  if (existing) {
    const err = new Error(`Variable key "${key}" already exists`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO template_variables (\`key\`, label, description, example_value, category)
     VALUES (?, ?, ?, ?, ?)`,
    [
      key,
      String(data.label).trim(),
      data.description ? String(data.description) : null,
      data.exampleValue != null ? String(data.exampleValue) : null,
      data.category ? String(data.category) : null,
    ]
  );

  return getTemplateVariableById(result.insertId);
}

async function updateTemplateVariable(id, data) {
  const existing = await getTemplateVariableById(id);
  if (!existing) return null;

  const errors = validateVariableInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  let key = existing.key;
  if (data.key !== undefined && String(data.key).trim() !== existing.key) {
    key = String(data.key).trim();
    const clash = await getTemplateVariableByKey(key);
    if (clash && clash.id !== Number(id)) {
      const err = new Error(`Variable key "${key}" already exists`);
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    `UPDATE template_variables
     SET \`key\` = ?, label = ?, description = ?, example_value = ?, category = ?
     WHERE id = ?`,
    [
      key,
      data.label !== undefined ? String(data.label).trim() : existing.label,
      data.description !== undefined ? (data.description ? String(data.description) : null) : existing.description,
      data.exampleValue !== undefined ? (data.exampleValue != null ? String(data.exampleValue) : null) : existing.exampleValue,
      data.category !== undefined ? (data.category ? String(data.category) : null) : existing.category,
      id,
    ]
  );

  return getTemplateVariableById(id);
}

async function deleteTemplateVariable(id) {
  const existing = await getTemplateVariableById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM template_variables WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listTemplateVariables,
  getTemplateVariableById,
  getTemplateVariableByKey,
  createTemplateVariable,
  updateTemplateVariable,
  deleteTemplateVariable,
  extractPlaceholders,
  renderTemplate,
};
