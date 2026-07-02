const pool = require('../db/pool');
const { extractPlaceholders } = require('./templateVariableService');

function normalizeEmailTemplate(row, clientName = null) {
  const combined = `${row.subject || ''}\n${row.body || ''}`;
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: clientName || row.client_name || null,
    name: row.name,
    subject: row.subject,
    body: row.body,
    placeholders: extractPlaceholders(combined),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeSmsTemplate(row, clientName = null) {
  return {
    id: row.id,
    clientId: row.client_id,
    clientName: clientName || row.client_name || null,
    name: row.name,
    body: row.body,
    placeholders: extractPlaceholders(row.body || ''),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function formatDate(row) {
  return row.updated_at || row.created_at
    ? new Date(row.updated_at || row.created_at).toISOString().slice(0, 10)
    : null;
}

// ── Email templates ──

function resolveClientId(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number(value);
  return Number.isFinite(num) && num > 0 ? num : null;
}

async function listEmailTemplates({ clientId = null, systemOnly = false } = {}) {
  const params = [];
  let where = '';
  if (systemOnly) {
    where = 'WHERE t.client_id IS NULL';
  } else if (clientId) {
    where = 'WHERE (t.client_id = ? OR t.client_id IS NULL)';
    params.push(Number(clientId));
  }
  const [rows] = await pool.query(
    `SELECT t.*, c.name AS client_name
     FROM email_templates t
     LEFT JOIN clients c ON c.id = t.client_id
     ${where}
     ORDER BY t.created_at DESC, t.id DESC`,
    params
  );
  return rows.map((r) => {
    const norm = normalizeEmailTemplate(r);
    norm.updatedAt = formatDate(r);
    return norm;
  });
}

async function getEmailTemplateById(id) {
  const [rows] = await pool.query(
    `SELECT t.*, c.name AS client_name
     FROM email_templates t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const norm = normalizeEmailTemplate(rows[0]);
  norm.updatedAt = formatDate(rows[0]);
  return norm;
}

function validateEmailTemplateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Template name is required');
  }
  if (!partial || data.subject !== undefined) {
    if (!data.subject || !String(data.subject).trim()) errors.push('Subject is required');
  }
  if (!partial || data.body !== undefined) {
    if (!data.body || !String(data.body).trim()) errors.push('Body is required');
  }
  return errors;
}

async function createEmailTemplate(data) {
  const errors = validateEmailTemplateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO email_templates (client_id, name, subject, body)
     VALUES (?, ?, ?, ?)`,
    [
      resolveClientId(data.clientId),
      String(data.name).trim(),
      String(data.subject).trim(),
      String(data.body),
    ]
  );

  return getEmailTemplateById(result.insertId);
}

async function updateEmailTemplate(id, data) {
  const existing = await getEmailTemplateById(id);
  if (!existing) return null;

  const errors = validateEmailTemplateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  await pool.query(
    `UPDATE email_templates
     SET client_id = ?, name = ?, subject = ?, body = ?
     WHERE id = ?`,
    [
      data.clientId !== undefined ? resolveClientId(data.clientId) : existing.clientId,
      data.name !== undefined ? String(data.name).trim() : existing.name,
      data.subject !== undefined ? String(data.subject).trim() : existing.subject,
      data.body !== undefined ? String(data.body) : existing.body,
      id,
    ]
  );

  return getEmailTemplateById(id);
}

async function deleteEmailTemplate(id) {
  const existing = await getEmailTemplateById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM email_templates WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

// ── SMS templates ──

async function listSmsTemplates({ clientId = null, systemOnly = false } = {}) {
  const params = [];
  let where = '';
  if (systemOnly) {
    where = 'WHERE t.client_id IS NULL';
  } else if (clientId) {
    where = 'WHERE (t.client_id = ? OR t.client_id IS NULL)';
    params.push(Number(clientId));
  }
  const [rows] = await pool.query(
    `SELECT t.*, c.name AS client_name
     FROM sms_templates t
     LEFT JOIN clients c ON c.id = t.client_id
     ${where}
     ORDER BY t.created_at DESC, t.id DESC`,
    params
  );
  return rows.map((r) => {
    const norm = normalizeSmsTemplate(r);
    norm.updatedAt = formatDate(r);
    return norm;
  });
}

async function getSmsTemplateById(id) {
  const [rows] = await pool.query(
    `SELECT t.*, c.name AS client_name
     FROM sms_templates t
     LEFT JOIN clients c ON c.id = t.client_id
     WHERE t.id = ? LIMIT 1`,
    [id]
  );
  if (!rows[0]) return null;
  const norm = normalizeSmsTemplate(rows[0]);
  norm.updatedAt = formatDate(rows[0]);
  return norm;
}

function validateSmsTemplateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Template name is required');
  }
  if (!partial || data.body !== undefined) {
    if (!data.body || !String(data.body).trim()) errors.push('Body is required');
  }
  return errors;
}

async function createSmsTemplate(data) {
  const errors = validateSmsTemplateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO sms_templates (client_id, name, body) VALUES (?, ?, ?)`,
    [resolveClientId(data.clientId), String(data.name).trim(), String(data.body)]
  );

  return getSmsTemplateById(result.insertId);
}

async function updateSmsTemplate(id, data) {
  const existing = await getSmsTemplateById(id);
  if (!existing) return null;

  const errors = validateSmsTemplateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  await pool.query(
    `UPDATE sms_templates SET client_id = ?, name = ?, body = ? WHERE id = ?`,
    [
      data.clientId !== undefined ? resolveClientId(data.clientId) : existing.clientId,
      data.name !== undefined ? String(data.name).trim() : existing.name,
      data.body !== undefined ? String(data.body) : existing.body,
      id,
    ]
  );

  return getSmsTemplateById(id);
}

async function deleteSmsTemplate(id) {
  const existing = await getSmsTemplateById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM sms_templates WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  listSmsTemplates,
  getSmsTemplateById,
  createSmsTemplate,
  updateSmsTemplate,
  deleteSmsTemplate,
};
