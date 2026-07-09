const pool = require('../db/pool');

function normalizeCurrency(row) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    symbol: row.symbol,
    isActive: Boolean(row.is_active),
    isDefault: Boolean(row.is_default),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listCurrencies({ includeInactive = true } = {}) {
  const sql = includeInactive
    ? 'SELECT * FROM currencies ORDER BY is_default DESC, code ASC'
    : 'SELECT * FROM currencies WHERE is_active = 1 ORDER BY is_default DESC, code ASC';
  const [rows] = await pool.query(sql);
  return rows.map(normalizeCurrency);
}

async function getCurrencyById(id) {
  const [rows] = await pool.query('SELECT * FROM currencies WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeCurrency(rows[0]) : null;
}

async function getCurrencyByCode(code) {
  const [rows] = await pool.query('SELECT * FROM currencies WHERE code = ? LIMIT 1', [code]);
  return rows[0] ? normalizeCurrency(rows[0]) : null;
}

function validateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.code !== undefined) {
    if (!data.code || !String(data.code).trim()) errors.push('Currency code is required');
    else if (String(data.code).trim().length > 8) errors.push('Code must be 8 characters or fewer');
  }
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Currency name is required');
    else if (String(data.name).trim().length > 80) errors.push('Name must be 80 characters or fewer');
  }
  if (!partial || data.symbol !== undefined) {
    if (!data.symbol || !String(data.symbol).trim()) errors.push('Symbol is required');
    else if (String(data.symbol).trim().length > 8) errors.push('Symbol must be 8 characters or fewer');
  }
  return errors;
}

async function createCurrency(data) {
  const errors = validateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const code = String(data.code).trim().toUpperCase();
  const existing = await getCurrencyByCode(code);
  if (existing) {
    const err = new Error(`Currency code "${code}" already exists`);
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    'INSERT INTO currencies (code, name, symbol, is_active, is_default) VALUES (?, ?, ?, ?, ?)',
    [
      code,
      String(data.name).trim(),
      String(data.symbol).trim(),
      data.isActive === false ? 0 : 1,
      data.isDefault === true ? 1 : 0,
    ]
  );

  // Only one currency may be the default — clear the flag on the others.
  if (data.isDefault === true) {
    await pool.query('UPDATE currencies SET is_default = 0 WHERE id <> ?', [result.insertId]);
  }

  return getCurrencyById(result.insertId);
}

async function updateCurrency(id, data) {
  const existing = await getCurrencyById(id);
  if (!existing) return null;

  const errors = validateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  let code = existing.code;
  if (data.code !== undefined && String(data.code).trim().toUpperCase() !== existing.code) {
    code = String(data.code).trim().toUpperCase();
    const clash = await getCurrencyByCode(code);
    if (clash && clash.id !== Number(id)) {
      const err = new Error(`Currency code "${code}" already exists`);
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  const becomingDefault = data.isDefault === true && !existing.isDefault;

  await pool.query(
    'UPDATE currencies SET code = ?, name = ?, symbol = ?, is_active = ?, is_default = ? WHERE id = ?',
    [
      code,
      data.name !== undefined ? String(data.name).trim() : existing.name,
      data.symbol !== undefined ? String(data.symbol).trim() : existing.symbol,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : (existing.isActive ? 1 : 0),
      data.isDefault !== undefined ? (data.isDefault ? 1 : 0) : (existing.isDefault ? 1 : 0),
      id,
    ]
  );

  if (becomingDefault) {
    await pool.query('UPDATE currencies SET is_default = 0 WHERE id <> ?', [id]);
  }

  return getCurrencyById(id);
}

async function deleteCurrency(id) {
  const existing = await getCurrencyById(id);
  if (!existing) return { deleted: false };
  if (existing.isDefault) {
    const err = new Error('The default currency cannot be deleted. Set another currency as default first.');
    err.code = 'VALIDATION';
    throw err;
  }
  await pool.query('DELETE FROM currencies WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

module.exports = {
  listCurrencies,
  getCurrencyById,
  getCurrencyByCode,
  createCurrency,
  updateCurrency,
  deleteCurrency,
};
