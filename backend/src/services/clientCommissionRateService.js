const pool = require('../db/pool');
const { getSystemConfig } = require('./systemConfigService');

function normalizeRate(row) {
  return {
    id: row.id,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    debtCategoryId: row.debt_category_id || null,
    debtCategoryName: row.debt_category_name || null,
    rate: Number(row.rate) || 0,
    currencyId: row.currency_id || null,
    currencyCode: row.currency_code || null,
    isActive: Boolean(row.is_active),
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const RATE_SELECT = `
  SELECT r.*, c.name AS client_name, dc.name AS debt_category_name, cur.code AS currency_code
  FROM client_commission_rates r
  LEFT JOIN clients c ON c.id = r.client_id
  LEFT JOIN debt_categories dc ON dc.id = r.debt_category_id
  LEFT JOIN currencies cur ON cur.id = r.currency_id
`;

async function listRates() {
  const [rows] = await pool.query(
    `${RATE_SELECT} ORDER BY c.name ASC, dc.name ASC, r.id ASC`
  );
  return rows.map(normalizeRate);
}

async function getRateById(id) {
  const [rows] = await pool.query(`${RATE_SELECT} WHERE r.id = ? LIMIT 1`, [id]);
  return rows[0] ? normalizeRate(rows[0]) : null;
}

function validateInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.clientId !== undefined) {
    if (data.clientId == null || String(data.clientId).trim() === '') {
      errors.push('Client is required');
    }
  }
  if (!partial || data.rate !== undefined) {
    const rate = Number(data.rate);
    if (data.rate === undefined || data.rate === null || String(data.rate).trim() === '') {
      errors.push('Commission rate is required');
    } else if (!Number.isFinite(rate)) {
      errors.push('Commission rate must be a number');
    } else if (rate < 0 || rate > 1) {
      errors.push('Commission rate must be between 0 and 1 (e.g. 0.10 for 10%)');
    }
  }
  return errors;
}

async function findExisting(clientId, debtCategoryId, excludeId = null) {
  if (debtCategoryId == null || debtCategoryId === '') {
    const [rows] = await pool.query(
      `SELECT id FROM client_commission_rates
        WHERE client_id = ? AND debt_category_id IS NULL
          ${excludeId != null ? 'AND id <> ?' : ''} LIMIT 1`,
      excludeId != null ? [clientId, excludeId] : [clientId]
    );
    return rows[0] || null;
  }
  const [rows] = await pool.query(
    `SELECT id FROM client_commission_rates
      WHERE client_id = ? AND debt_category_id = ?
        ${excludeId != null ? 'AND id <> ?' : ''} LIMIT 1`,
    excludeId != null ? [clientId, debtCategoryId, excludeId] : [clientId, debtCategoryId]
  );
  return rows[0] || null;
}

async function createRate(data) {
  const errors = validateInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const clientId = Number(data.clientId) || null;
  const debtCategoryId =
    data.debtCategoryId != null && data.debtCategoryId !== '' ? Number(data.debtCategoryId) || null : null;

  const clash = await findExisting(clientId, debtCategoryId);
  if (clash) {
    const err = new Error(
      debtCategoryId == null
        ? 'A default rate already exists for this client'
        : 'A rate already exists for this client and debt category'
    );
    err.code = 'DUPLICATE';
    throw err;
  }

  const [result] = await pool.query(
    `INSERT INTO client_commission_rates
      (client_id, debt_category_id, rate, currency_id, is_active, notes)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      clientId,
      debtCategoryId,
      Number(data.rate),
      data.currencyId != null && data.currencyId !== '' ? Number(data.currencyId) || null : null,
      data.isActive === false ? 0 : 1,
      data.notes ? String(data.notes).trim().slice(0, 255) : null,
    ]
  );

  return getRateById(result.insertId);
}

async function updateRate(id, data) {
  const existing = await getRateById(id);
  if (!existing) return null;

  const errors = validateInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const clientId =
    data.clientId !== undefined ? Number(data.clientId) || null : existing.clientId;
  const debtCategoryId =
    data.debtCategoryId !== undefined
      ? data.debtCategoryId != null && data.debtCategoryId !== ''
        ? Number(data.debtCategoryId) || null
        : null
      : existing.debtCategoryId;

  if (data.clientId !== undefined || data.debtCategoryId !== undefined) {
    const clash = await findExisting(clientId, debtCategoryId, id);
    if (clash) {
      const err = new Error(
        debtCategoryId == null
          ? 'A default rate already exists for this client'
          : 'A rate already exists for this client and debt category'
      );
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    `UPDATE client_commission_rates
       SET client_id = ?, debt_category_id = ?, rate = ?, currency_id = ?,
           is_active = ?, notes = ?
     WHERE id = ?`,
    [
      clientId,
      debtCategoryId,
      data.rate !== undefined ? Number(data.rate) : existing.rate,
      data.currencyId !== undefined
        ? data.currencyId != null && data.currencyId !== ''
          ? Number(data.currencyId) || null
          : null
        : existing.currencyId,
      data.isActive !== undefined ? (data.isActive ? 1 : 0) : existing.isActive ? 1 : 0,
      data.notes !== undefined ? (data.notes ? String(data.notes).trim().slice(0, 255) : null) : existing.notes,
      id,
    ]
  );

  return getRateById(id);
}

async function deleteRate(id) {
  const existing = await getRateById(id);
  if (!existing) return { deleted: false };
  await pool.query('DELETE FROM client_commission_rates WHERE id = ?', [id]);
  return { deleted: true, id: Number(id) };
}

// Resolve the commission rate that applies to a collected amount for a given
// (client, debt_category). Priority: exact (client, debt_category) →
// client-wide default (client, NULL) → global default from system_config.
// Returns { rate, tier } where tier ∈ 'exact' | 'client_default' | 'global_default'.
async function resolveRate(clientId, debtCategoryId) {
  if (clientId != null && debtCategoryId != null) {
    const [[exact]] = await pool.query(
      `SELECT rate FROM client_commission_rates
        WHERE client_id = ? AND debt_category_id = ? AND is_active = 1 LIMIT 1`,
      [clientId, debtCategoryId]
    );
    if (exact) return { rate: Number(exact.rate) || 0, tier: 'exact' };
  }

  if (clientId != null) {
    const [[def]] = await pool.query(
      `SELECT rate FROM client_commission_rates
        WHERE client_id = ? AND debt_category_id IS NULL AND is_active = 1 LIMIT 1`,
      [clientId]
    );
    if (def) return { rate: Number(def.rate) || 0, tier: 'client_default' };
  }

  let globalRate = 0.1;
  try {
    const cfg = await getSystemConfig({ mask: false });
    globalRate = Number(cfg?.commissions?.defaultRate) || 0.1;
  } catch {
    // fall through to 0.1
  }
  return { rate: globalRate, tier: 'global_default' };
}

module.exports = {
  listRates,
  getRateById,
  createRate,
  updateRate,
  deleteRate,
  resolveRate,
};
