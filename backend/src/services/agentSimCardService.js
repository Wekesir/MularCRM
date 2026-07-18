const pool = require('../db/pool');

function normalizePhone(raw) {
  let digits = String(raw || '').trim().replace(/[^\d+]/g, '');
  if (!digits) return null;
  if (digits.startsWith('00')) digits = `+${digits.slice(2)}`;
  if (digits.startsWith('0') && digits.length >= 9) {
    // Kenya local → E.164 default
    digits = `+254${digits.slice(1)}`;
  }
  if (!digits.startsWith('+') && digits.length >= 9) {
    digits = `+${digits}`;
  }
  if (!/^\+\d{8,15}$/.test(digits)) return null;
  return digits;
}

function mapRow(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    label: row.label,
    phoneNumber: row.phone_number,
    supportsOutbound: Boolean(row.supports_outbound),
    supportsInbound: Boolean(row.supports_inbound),
    isDefault: Boolean(row.is_default),
    isActive: Boolean(row.is_active),
    provider: row.provider,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listSimCards(userId) {
  const [rows] = await pool.query(
    `SELECT * FROM agent_sim_cards
     WHERE user_id = ?
     ORDER BY is_default DESC, is_active DESC, label ASC`,
    [Number(userId)]
  );
  return rows.map(mapRow);
}

async function getSimCardForUser(userId, simCardId) {
  const [rows] = await pool.query(
    `SELECT * FROM agent_sim_cards WHERE id = ? AND user_id = ? LIMIT 1`,
    [Number(simCardId), Number(userId)]
  );
  return mapRow(rows[0]);
}

async function findActiveSimByPhone(phoneNumber) {
  const phone = normalizePhone(phoneNumber);
  if (!phone) return null;
  const [rows] = await pool.query(
    `SELECT s.*, u.name AS agent_name, u.email AS agent_email
     FROM agent_sim_cards s
     JOIN users u ON u.id = s.user_id
     WHERE s.phone_number = ? AND s.is_active = 1 AND s.supports_inbound = 1
       AND u.is_active = 1 AND u.deleted_at IS NULL
     LIMIT 1`,
    [phone]
  );
  if (!rows[0]) return null;
  return { ...mapRow(rows[0]), agentName: rows[0].agent_name, agentEmail: rows[0].agent_email };
}

async function createSimCard(userId, payload = {}) {
  const phoneNumber = normalizePhone(payload.phoneNumber);
  if (!phoneNumber) {
    const err = new Error('Enter a valid phone number (e.g. 254710595755)');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const label = String(payload.label || 'SIM').trim().slice(0, 80) || 'SIM';
  const supportsOutbound = payload.supportsOutbound !== false;
  const supportsInbound = payload.supportsInbound !== false;
  let isDefault = Boolean(payload.isDefault);

  const existing = await listSimCards(userId);
  if (existing.length === 0) isDefault = true;

  if (isDefault) {
    await pool.query(
      `UPDATE agent_sim_cards SET is_default = 0 WHERE user_id = ?`,
      [Number(userId)]
    );
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO agent_sim_cards
        (user_id, label, phone_number, supports_outbound, supports_inbound, is_default, is_active, provider)
       VALUES (?, ?, ?, ?, ?, ?, 1, 'africastalking')`,
      [
        Number(userId),
        label,
        phoneNumber,
        supportsOutbound ? 1 : 0,
        supportsInbound ? 1 : 0,
        isDefault ? 1 : 0,
      ]
    );
    return getSimCardForUser(userId, result.insertId);
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('This SIM number is already registered on your account');
      err.code = 'BAD_REQUEST';
      err.status = 400;
      throw err;
    }
    throw error;
  }
}

async function updateSimCard(userId, simCardId, payload = {}) {
  const current = await getSimCardForUser(userId, simCardId);
  if (!current) {
    const err = new Error('SIM card not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const phoneNumber =
    payload.phoneNumber != null ? normalizePhone(payload.phoneNumber) : current.phoneNumber;
  if (!phoneNumber) {
    const err = new Error('Enter a valid phone number (e.g. 254710595755)');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const label =
    payload.label != null
      ? String(payload.label).trim().slice(0, 80) || current.label
      : current.label;
  const supportsOutbound =
    payload.supportsOutbound != null ? Boolean(payload.supportsOutbound) : current.supportsOutbound;
  const supportsInbound =
    payload.supportsInbound != null ? Boolean(payload.supportsInbound) : current.supportsInbound;
  const isActive = payload.isActive != null ? Boolean(payload.isActive) : current.isActive;
  let isDefault = payload.isDefault != null ? Boolean(payload.isDefault) : current.isDefault;

  if (isDefault) {
    await pool.query(
      `UPDATE agent_sim_cards SET is_default = 0 WHERE user_id = ? AND id <> ?`,
      [Number(userId), Number(simCardId)]
    );
  }

  try {
    await pool.query(
      `UPDATE agent_sim_cards
       SET label = ?, phone_number = ?, supports_outbound = ?, supports_inbound = ?,
           is_default = ?, is_active = ?
       WHERE id = ? AND user_id = ?`,
      [
        label,
        phoneNumber,
        supportsOutbound ? 1 : 0,
        supportsInbound ? 1 : 0,
        isDefault ? 1 : 0,
        isActive ? 1 : 0,
        Number(simCardId),
        Number(userId),
      ]
    );
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      const err = new Error('This SIM number is already registered on your account');
      err.code = 'BAD_REQUEST';
      err.status = 400;
      throw err;
    }
    throw error;
  }

  return getSimCardForUser(userId, simCardId);
}

async function deleteSimCard(userId, simCardId) {
  const current = await getSimCardForUser(userId, simCardId);
  if (!current) {
    const err = new Error('SIM card not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  await pool.query(`DELETE FROM agent_sim_cards WHERE id = ? AND user_id = ?`, [
    Number(simCardId),
    Number(userId),
  ]);
  if (current.isDefault) {
    const [rows] = await pool.query(
      `SELECT id FROM agent_sim_cards WHERE user_id = ? AND is_active = 1 ORDER BY id ASC LIMIT 1`,
      [Number(userId)]
    );
    if (rows[0]) {
      await pool.query(`UPDATE agent_sim_cards SET is_default = 1 WHERE id = ?`, [rows[0].id]);
    }
  }
  return { deleted: true };
}

module.exports = {
  normalizePhone,
  listSimCards,
  getSimCardForUser,
  findActiveSimByPhone,
  createSimCard,
  updateSimCard,
  deleteSimCard,
};
