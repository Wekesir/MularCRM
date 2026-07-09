const pool = require('../db/pool');

function normalizeType(row) {
  return {
    id: row.id,
    name: row.name,
    code: row.code || null,
    description: row.description || null,
    isActive: Boolean(row.is_active),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listDebtTypes({ includeInactive = true } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM debt_types ORDER BY name ASC'
    : 'SELECT * FROM debt_types WHERE is_active = 1 ORDER BY name ASC';
  const [rows] = await pool.query(sql);
  return rows.map(normalizeType);
}

async function getDebtTypeById(id) {
  const [rows] = await pool.query('SELECT * FROM debt_types WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeType(rows[0]) : null;
}

async function getDebtTypeByName(name) {
  const [rows] = await pool.query('SELECT * FROM debt_types WHERE name = ? LIMIT 1', [name]);
  return rows[0] ? normalizeType(rows[0]) : null;
}

function validateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Name is required');
    else if (String(data.name).trim().length > 120) errors.push('Name must be 120 characters or fewer');
  }
  if (data.code !== undefined && data.code && String(data.code).length > 48) {
    errors.push('Code must be 48 characters or fewer');
  }
  if (data.description !== undefined && data.description && String(data.description).length > 255) {
    errors.push('Description must be 255 characters or fewer');
  }
  return errors;
}

async function createDebtType(data) {
  const errors = validateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const name = String(data.name).trim();
  const existing = await getDebtTypeByName(name);
  if (existing) {
    const err = new Error(`Debt type "${name}" already exists`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    'INSERT INTO debt_types (name, code, description, is_active) VALUES (?, ?, ?, ?)',
    [
      name,
      data.code ? String(data.code).trim() : null,
      data.description ? String(data.description).trim() : null,
      data.isActive === false ? 0 : 1,
    ]
  );

  return getDebtTypeById(result.insertId);
}

async function updateDebtType(id, data) {
  const existing = await getDebtTypeById(id);
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
    const clash = await getDebtTypeByName(name);
    if (clash && clash.id !== Number(id)) {
      const err = new Error(`Debt type "${name}" already exists`);
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    'UPDATE debt_types SET name = ?, code = ?, description = ?, is_active = ? WHERE id = ?',
    [
      name,
      data.code !== undefined ? (data.code ? String(data.code).trim() : null) : existing.code,
      data.description !== undefined ? (data.description ? String(data.description).trim() : null) : existing.description,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      id,
    ]
  );

  return getDebtTypeById(id);
}

async function deleteDebtType(id) {
  const existing = await getDebtTypeById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM debt_types WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listDebtTypes,
  getDebtTypeById,
  getDebtTypeByName,
  createDebtType,
  updateDebtType,
  deleteDebtType,
};
