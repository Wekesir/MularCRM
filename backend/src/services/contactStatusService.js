const pool = require('../db/pool');

function normalizeStatus(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || null,
    description: row.description || null,
    maxNaDays: Number(row.max_na_days) || 0,
    dialingPriority: Number(row.dialing_priority) || 0,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listContactStatuses({ includeInactive = true } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM contact_statuses ORDER BY dialing_priority ASC, name ASC'
    : 'SELECT * FROM contact_statuses WHERE is_active = 1 ORDER BY dialing_priority ASC, name ASC';
  const [rows] = await pool.query(sql);
  return rows.map(normalizeStatus);
}

async function getContactStatusById(id) {
  const [rows] = await pool.query('SELECT * FROM contact_statuses WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeStatus(rows[0]) : null;
}

async function getContactStatusByName(name) {
  const [rows] = await pool.query('SELECT * FROM contact_statuses WHERE name = ? LIMIT 1', [name]);
  return rows[0] ? normalizeStatus(rows[0]) : null;
}

async function getContactStatusByCode(code) {
  const [rows] = await pool.query('SELECT * FROM contact_statuses WHERE code = ? LIMIT 1', [code]);
  return rows[0] ? normalizeStatus(rows[0]) : null;
}

function validateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Title is required');
    else if (String(data.name).trim().length > 120) errors.push('Title must be 120 characters or fewer');
  }
  if (data.code !== undefined && data.code && String(data.code).length > 16) {
    errors.push('Abbreviation must be 16 characters or fewer');
  }
  if (data.description !== undefined && data.description && String(data.description).length > 255) {
    errors.push('Description must be 255 characters or fewer');
  }
  if (data.maxNaDays !== undefined) {
    const n = Number(data.maxNaDays);
    if (!Number.isFinite(n) || n < 0) errors.push('Max NA Days must be a non-negative number');
  }
  if (data.dialingPriority !== undefined) {
    const n = Number(data.dialingPriority);
    if (!Number.isFinite(n) || n < 0) errors.push('Dialing Priority must be a non-negative number');
  }
  return errors;
}

async function createContactStatus(data) {
  const errors = validateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const name = String(data.name).trim();
  const existing = await getContactStatusByName(name);
  if (existing) {
    const err = new Error(`Contact status "${name}" already exists`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    'INSERT INTO contact_statuses (name, code, description, max_na_days, dialing_priority, is_active) VALUES (?, ?, ?, ?, ?, ?)',
    [
      name,
      data.code ? String(data.code).trim() : null,
      data.description ? String(data.description).trim() : null,
      Number(data.maxNaDays) || 0,
      Number(data.dialingPriority) || 0,
      data.isActive === false ? 0 : 1,
    ]
  );

  return getContactStatusById(result.insertId);
}

async function updateContactStatus(id, data) {
  const existing = await getContactStatusById(id);
  if (!existing) return null;

  const errors = validateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  let name = existing.name;
  if (data.name !== undefined && String(data.name).trim() !== existing.name) {
    name = String(data.name).trim();
    const clash = await getContactStatusByName(name);
    if (clash && clash.id !== Number(id)) {
      const err = new Error(`Contact status "${name}" already exists`);
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    'UPDATE contact_statuses SET name = ?, code = ?, description = ?, max_na_days = ?, dialing_priority = ?, is_active = ? WHERE id = ?',
    [
      name,
      data.code !== undefined ? (data.code ? String(data.code).trim() : null) : existing.code,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : existing.description,
      data.maxNaDays !== undefined ? (Number(data.maxNaDays) || 0) : existing.maxNaDays,
      data.dialingPriority !== undefined ? (Number(data.dialingPriority) || 0) : existing.dialingPriority,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      id,
    ]
  );

  return getContactStatusById(id);
}

async function deleteContactStatus(id) {
  const existing = await getContactStatusById(id);
  if (!existing) return { deleted: false };
  await pool.query('UPDATE debtors SET contact_status_id = NULL WHERE contact_status_id = ?', [id]);
  await pool.query('DELETE FROM contact_statuses WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listContactStatuses,
  getContactStatusById,
  getContactStatusByName,
  getContactStatusByCode,
  createContactStatus,
  updateContactStatus,
  deleteContactStatus,
};
