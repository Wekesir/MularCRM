const pool = require('../db/pool');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeClient(row) {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    phone: row.phone,
    email: row.email,
    status: row.status,
    totalFiles: row.total_files,
    activeCases: row.active_cases,
    closedFiles: row.closed_files,
    activeValue: toNumber(row.active_value),
    closedValue: toNumber(row.closed_value),
    collected: toNumber(row.collected),
    balance: toNumber(row.balance),
    deletedAt: row.deleted_at || null,
    addedAt: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listClients() {
  const [rows] = await pool.query(
    'SELECT * FROM clients WHERE deleted_at IS NULL ORDER BY created_at DESC, id DESC'
  );
  return rows.map(normalizeClient);
}

async function getClientById(id) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE id = ? LIMIT 1', [id]);
  return rows[0] ? normalizeClient(rows[0]) : null;
}

async function getClientByEmail(email) {
  const [rows] = await pool.query('SELECT * FROM clients WHERE email = ? LIMIT 1', [email]);
  return rows[0] ? normalizeClient(rows[0]) : null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED = /^[0-9+][0-9+\-\s()]{5,31}$/;

function validateClientInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Name is required');
  }
  if (!partial || data.businessType !== undefined) {
    if (!data.businessType || !String(data.businessType).trim()) errors.push('Business type is required');
  }
  if (!partial || data.phone !== undefined) {
    const phone = String(data.phone || '').trim();
    if (!phone) errors.push('Phone is required');
    else if (!PHONE_ALLOWED.test(phone)) errors.push('Phone number format is invalid');
  }
  if (!partial || data.email !== undefined) {
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) errors.push('Email is required');
    else if (!EMAIL_REGEX.test(email)) errors.push('A valid email address is required');
  }
  return errors;
}

async function createClient(data) {
  const errors = validateClientInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const email = String(data.email).trim().toLowerCase();
  const clash = await getClientByEmail(email);
  if (clash) {
    const err = new Error('A client with this email already exists');
    err.code = 'DUPLICATE';
    throw err;
  }

  const status = data.status === 'inactive' ? 'inactive' : 'active';
  const [result] = await pool.query(
    `INSERT INTO clients (name, business_type, phone, email, status, total_files, active_cases,
        closed_files, active_value, closed_value, collected, balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(data.name).trim(),
      String(data.businessType).trim(),
      String(data.phone).trim(),
      email,
      status,
      Number(data.totalFiles) || 0,
      Number(data.activeCases) || 0,
      Number(data.closedFiles) || 0,
      toNumber(data.activeValue),
      toNumber(data.closedValue),
      toNumber(data.collected),
      toNumber(data.balance),
    ]
  );

  return getClientById(result.insertId);
}

async function updateClient(id, data) {
  const existing = await getClientById(id);
  if (!existing) return null;

  const errors = validateClientInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const merged = {
    name: data.name !== undefined ? String(data.name).trim() : existing.name,
    businessType:
      data.businessType !== undefined ? String(data.businessType).trim() : existing.businessType,
    phone: data.phone !== undefined ? String(data.phone).trim() : existing.phone,
    email:
      data.email !== undefined ? String(data.email).trim().toLowerCase() : existing.email,
    status: data.status !== undefined ? (data.status === 'inactive' ? 'inactive' : 'active') : existing.status,
    totalFiles: data.totalFiles !== undefined ? Number(data.totalFiles) || 0 : existing.totalFiles,
    activeCases: data.activeCases !== undefined ? Number(data.activeCases) || 0 : existing.activeCases,
    closedFiles: data.closedFiles !== undefined ? Number(data.closedFiles) || 0 : existing.closedFiles,
    activeValue: data.activeValue !== undefined ? toNumber(data.activeValue) : existing.activeValue,
    closedValue: data.closedValue !== undefined ? toNumber(data.closedValue) : existing.closedValue,
    collected: data.collected !== undefined ? toNumber(data.collected) : existing.collected,
    balance: data.balance !== undefined ? toNumber(data.balance) : existing.balance,
  };

  if (merged.email !== existing.email) {
    const clash = await getClientByEmail(merged.email);
    if (clash && clash.id !== Number(id)) {
      const err = new Error('A client with this email already exists');
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    `UPDATE clients
     SET name = ?, business_type = ?, phone = ?, email = ?, status = ?,
         total_files = ?, active_cases = ?, closed_files = ?,
         active_value = ?, closed_value = ?, collected = ?, balance = ?
     WHERE id = ?`,
    [
      merged.name,
      merged.businessType,
      merged.phone,
      merged.email,
      merged.status,
      merged.totalFiles,
      merged.activeCases,
      merged.closedFiles,
      merged.activeValue,
      merged.closedValue,
      merged.collected,
      merged.balance,
      id,
    ]
  );

  return getClientById(id);
}

// Soft delete — preserves all client data and linked templates so the client
// can be restored later. listClients() excludes soft-deleted rows.
async function deleteClient(id) {
  const existing = await getClientById(id);
  if (!existing) return { deleted: false };
  await pool.query('UPDATE clients SET deleted_at = NOW() WHERE id = ?', [id]);
  return { deleted: true, id: Number(id), softDelete: true };
}

async function restoreClient(id) {
  const [rows] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) return { restored: false };
  await pool.query('UPDATE clients SET deleted_at = NULL WHERE id = ?', [id]);
  return { restored: true, id: Number(id) };
}

module.exports = {
  listClients,
  getClientById,
  getClientByEmail,
  createClient,
  updateClient,
  deleteClient,
  restoreClient,
};
