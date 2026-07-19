const pool = require('../db/pool');
const { isAgentRole } = require('./agentService');

const STATUSES = new Set(['pending', 'kept', 'broken', 'cancelled']);
const CHANNELS = new Set(['call', 'sms', 'email']);

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizePtp(row) {
  return {
    id: row.id,
    debtorId: row.debtor_id,
    debtorName: row.debtor_name || null,
    debtorPhone: row.debtor_phone || null,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    agentId: row.agent_id,
    agentName: row.agent_name || null,
    contactAttemptId: row.contact_attempt_id || null,
    promisedAmount: toNumber(row.promised_amount),
    promiseDate: toDate(row.promise_date),
    reminderDate: toDate(row.reminder_date),
    status: row.status,
    channel: row.channel || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currencySymbol: row.currency_symbol || null,
  };
}

function buildPtpFilters(filters = {}, viewer = null) {
  const clauses = ['1=1'];
  const params = [];

  if (viewer && isAgentRole(viewer)) {
    clauses.push('p.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (filters.agentId) {
    clauses.push('p.agent_id = ?');
    params.push(Number(filters.agentId));
  }

  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }

  if (filters.status && STATUSES.has(String(filters.status))) {
    clauses.push('p.status = ?');
    params.push(String(filters.status));
  }

  if (filters.channel && CHANNELS.has(String(filters.channel))) {
    clauses.push('p.channel = ?');
    params.push(String(filters.channel));
  }

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR d.phone LIKE ? OR u.name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  if (filters.promiseFrom) {
    clauses.push('p.promise_date >= ?');
    params.push(toDate(filters.promiseFrom));
  }
  if (filters.promiseTo) {
    clauses.push('p.promise_date <= ?');
    params.push(toDate(filters.promiseTo));
  }
  if (filters.reminderFrom) {
    clauses.push('p.reminder_date >= ?');
    params.push(toDate(filters.reminderFrom));
  }
  if (filters.reminderTo) {
    clauses.push('p.reminder_date <= ?');
    params.push(toDate(filters.reminderTo));
  }

  const reminderDue = String(filters.reminderDue || '').toLowerCase();
  if (reminderDue === 'today') {
    clauses.push('p.reminder_date = CURDATE()');
  } else if (reminderDue === 'overdue') {
    clauses.push("p.reminder_date IS NOT NULL AND p.reminder_date < CURDATE() AND p.status = 'pending'");
  } else if (reminderDue === 'upcoming') {
    clauses.push('p.reminder_date IS NOT NULL AND p.reminder_date > CURDATE()');
  } else if (reminderDue === 'due') {
    clauses.push("p.reminder_date IS NOT NULL AND p.reminder_date <= CURDATE() AND p.status = 'pending'");
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const FROM_SQL = `
  FROM ptp_arrangements p
  INNER JOIN debtors d ON d.id = p.debtor_id
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN users u ON u.id = p.agent_id
  LEFT JOIN currencies cur ON cur.id = d.currency_id
`;

async function createPtpArrangement({
  debtorId,
  agentId,
  contactAttemptId = null,
  promisedAmount = 0,
  promiseDate = null,
  reminderDate = null,
  channel = null,
  notes = null,
}) {
  const [result] = await pool.query(
    `INSERT INTO ptp_arrangements
      (debtor_id, agent_id, contact_attempt_id, promised_amount, promise_date, reminder_date, status, channel, notes)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?)`,
    [
      Number(debtorId),
      Number(agentId),
      contactAttemptId ? Number(contactAttemptId) : null,
      toNumber(promisedAmount),
      toDate(promiseDate),
      toDate(reminderDate),
      channel && CHANNELS.has(channel) ? channel : null,
      notes || null,
    ]
  );

  return getPtpById(result.insertId);
}

async function getPtpById(id) {
  const [rows] = await pool.query(
    `SELECT p.*,
            d.name AS debtor_name,
            d.phone AS debtor_phone,
            d.client_id,
            c.name AS client_name,
            u.name AS agent_name,
            cur.symbol AS currency_symbol
     ${FROM_SQL}
     WHERE p.id = ?
     LIMIT 1`,
    [Number(id)]
  );
  return rows[0] ? normalizePtp(rows[0]) : null;
}

async function listPtpArrangements(filters = {}, viewer = null) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const { where, params } = buildPtpFilters(filters, viewer);

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${FROM_SQL} ${where}`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  const [rows] = await pool.query(
    `SELECT p.*,
            d.name AS debtor_name,
            d.phone AS debtor_phone,
            d.client_id,
            c.name AS client_name,
            u.name AS agent_name,
            cur.symbol AS currency_symbol
     ${FROM_SQL}
     ${where}
     ORDER BY
       CASE WHEN p.status = 'pending' AND p.reminder_date IS NOT NULL AND p.reminder_date <= CURDATE() THEN 0 ELSE 1 END,
       p.reminder_date ASC,
       p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map(normalizePtp),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

async function getPtpTotals(filters = {}, viewer = null) {
  const { where, params } = buildPtpFilters(filters, viewer);
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       COALESCE(SUM(p.promised_amount), 0) AS promised_amount,
       SUM(CASE WHEN p.status = 'pending' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN p.status = 'kept' THEN 1 ELSE 0 END) AS kept_count,
       SUM(CASE WHEN p.status = 'broken' THEN 1 ELSE 0 END) AS broken_count,
       SUM(CASE WHEN p.status = 'pending' AND p.reminder_date IS NOT NULL AND p.reminder_date <= CURDATE() THEN 1 ELSE 0 END) AS reminders_due,
       COALESCE(SUM(CASE WHEN p.status = 'pending' THEN p.promised_amount ELSE 0 END), 0) AS pending_amount
     ${FROM_SQL}
     ${where}`,
    params
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    promisedAmount: toNumber(row.promised_amount),
    pendingCount: Number(row.pending_count) || 0,
    keptCount: Number(row.kept_count) || 0,
    brokenCount: Number(row.broken_count) || 0,
    remindersDue: Number(row.reminders_due) || 0,
    pendingAmount: toNumber(row.pending_amount),
  };
}

async function updatePtpArrangement(id, payload = {}, viewer = null) {
  const existing = await getPtpById(id);
  if (!existing) {
    const err = new Error('PTP arrangement not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  if (viewer && isAgentRole(viewer) && Number(existing.agentId) !== Number(viewer.id)) {
    const err = new Error('You can only update your own PTP arrangements');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const sets = [];
  const params = [];

  if (payload.status != null) {
    if (!STATUSES.has(String(payload.status))) {
      const err = new Error('Invalid PTP status');
      err.code = 'BAD_REQUEST';
      err.status = 400;
      throw err;
    }
    sets.push('status = ?');
    params.push(String(payload.status));
  }

  if (payload.reminderDate !== undefined) {
    sets.push('reminder_date = ?');
    params.push(toDate(payload.reminderDate));
  }

  if (payload.promiseDate !== undefined) {
    sets.push('promise_date = ?');
    params.push(toDate(payload.promiseDate));
  }

  if (payload.promisedAmount !== undefined) {
    sets.push('promised_amount = ?');
    params.push(toNumber(payload.promisedAmount));
  }

  if (payload.notes !== undefined) {
    sets.push('notes = ?');
    params.push(payload.notes == null ? null : String(payload.notes));
  }

  if (!sets.length) return existing;

  params.push(Number(id));
  await pool.query(`UPDATE ptp_arrangements SET ${sets.join(', ')} WHERE id = ?`, params);

  // Keep debtor next_action_date in sync when reminder changes on a pending PTP
  if (payload.reminderDate !== undefined && (payload.status || existing.status) === 'pending') {
    await pool.query('UPDATE debtors SET next_action_date = ? WHERE id = ?', [
      toDate(payload.reminderDate),
      existing.debtorId,
    ]);
  }

  return getPtpById(id);
}

/**
 * Cancel all pending PTPs for a debtor (e.g. when a restructure is approved).
 * @returns {Promise<number>} number of rows updated
 */
async function cancelPendingPtpsForDebtor(debtorId) {
  const [result] = await pool.query(
    `UPDATE ptp_arrangements
     SET status = 'cancelled'
     WHERE debtor_id = ? AND status = 'pending'`,
    [Number(debtorId)]
  );
  return Number(result.affectedRows) || 0;
}

module.exports = {
  createPtpArrangement,
  getPtpById,
  listPtpArrangements,
  getPtpTotals,
  updatePtpArrangement,
  cancelPendingPtpsForDebtor,
};
