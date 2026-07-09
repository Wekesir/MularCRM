const pool = require('../db/pool');
const commissionService = require('./commissionService');
const { recordActivityEvent } = require('./activityService');

function round2(value) {
  return Math.round((Number(value) || 0) * 100) / 100;
}

function toDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  const s = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10);
}

function normalizePayment(row) {
  return {
    id: row.id,
    debtorId: row.debtor_id,
    debtorName: row.debtor_name || null,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    debtCategoryId: row.debt_category_id || null,
    debtCategoryName: row.debt_category_name || null,
    fileId: row.file_id || null,
    amount: Number(row.amount) || 0,
    paymentDate: row.payment_date || null,
    previousTotalPaid: row.previous_total_paid != null ? Number(row.previous_total_paid) : null,
    newTotalPaid: row.new_total_paid != null ? Number(row.new_total_paid) : null,
    currencyId: row.currency_id || null,
    currencyCode: row.currency_code || null,
    agentUserId: row.agent_user_id || null,
    agentName: row.agent_name || null,
    source: row.source || 'upload_delta',
    confirmed: Boolean(row.confirmed),
    createdAt: row.created_at,
  };
}

const PAYMENT_SELECT = `
  SELECT p.*, d.name AS debtor_name, c.name AS client_name,
         dc.name AS debt_category_name, cur.code AS currency_code
  FROM payments p
  LEFT JOIN debtors d ON d.id = p.debtor_id
  LEFT JOIN clients c ON c.id = p.client_id
  LEFT JOIN debt_categories dc ON dc.id = p.debt_category_id
  LEFT JOIN currencies cur ON cur.id = p.currency_id
`;

function buildWhere(f = {}) {
  const params = [];
  const clauses = [];

  if (f.clientId != null && f.clientId !== '') {
    clauses.push('p.client_id = ?');
    params.push(Number(f.clientId));
  }
  if (f.debtCategoryId != null && f.debtCategoryId !== '') {
    clauses.push('p.debt_category_id = ?');
    params.push(Number(f.debtCategoryId));
  }
  if (f.fileId != null && f.fileId !== '') {
    clauses.push('p.file_id = ?');
    params.push(Number(f.fileId));
  }
  if (f.agentName && String(f.agentName).trim()) {
    clauses.push('p.agent_name = ?');
    params.push(String(f.agentName).trim());
  }
  if (f.source && String(f.source).trim()) {
    clauses.push('p.source = ?');
    params.push(String(f.source).trim());
  }
  if (f.dateFrom) {
    clauses.push('p.payment_date >= ?');
    params.push(String(f.dateFrom));
  }
  if (f.dateTo) {
    clauses.push('p.payment_date <= ?');
    params.push(String(f.dateTo));
  }
  if (f.search && String(f.search).trim()) {
    clauses.push('(d.name LIKE ? OR c.name LIKE ? OR dc.name LIKE ? OR p.agent_name LIKE ?)');
    const q = `%${String(f.search).trim()}%`;
    params.push(q, q, q, q);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

async function listPayments(filters = {}) {
  const { page = 1, pageSize = 25 } = filters;
  const { where, params } = buildWhere(filters);

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, (Number(page) - 1) * limit);

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM payments p
     LEFT JOIN debtors d ON d.id = p.debtor_id
     LEFT JOIN clients c ON c.id = p.client_id
     LEFT JOIN debt_categories dc ON dc.id = p.debt_category_id
     ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${PAYMENT_SELECT} ${where} ORDER BY p.payment_date DESC, p.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    items: rows.map(normalizePayment),
    total: Number(total) || 0,
    page: Math.max(1, Number(page) || 1),
    pageSize: limit,
    hasMore: offset + rows.length < Number(total),
  };
}

async function getPaymentTotals(filters = {}) {
  const { where, params } = buildWhere(filters);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(p.amount), 0) AS collected,
            COALESCE(SUM(CASE WHEN p.amount > 0 THEN p.amount ELSE 0 END), 0) AS inflow,
            COALESCE(SUM(CASE WHEN p.amount < 0 THEN p.amount ELSE 0 END), 0) AS reversals,
            COALESCE(SUM(CASE WHEN p.source = 'upload_delta' THEN 1 ELSE 0 END), 0) AS delta_count,
            COALESCE(SUM(CASE WHEN p.source = 'upload_reversal' THEN 1 ELSE 0 END), 0) AS reversal_count
       FROM payments p
       LEFT JOIN debtors d ON d.id = p.debtor_id
       LEFT JOIN clients c ON c.id = p.client_id
       LEFT JOIN debt_categories dc ON dc.id = p.debt_category_id
       ${where}`,
    params
  );
  const inflow = Number(row.inflow) || 0;
  const deltaCount = Number(row.delta_count) || 0;
  return {
    total: Number(row.total) || 0,
    collected: Number(row.collected) || 0,
    inflow,
    reversals: Number(row.reversals) || 0,
    deltaCount,
    reversalCount: Number(row.reversal_count) || 0,
    avgPayment: deltaCount > 0 ? round2(inflow / deltaCount) : 0,
  };
}

async function resolveAgentUserId(agentName) {
  if (!agentName) return null;
  const [rows] = await pool.query(
    'SELECT id FROM users WHERE name = ? AND is_active = 1 LIMIT 1',
    [String(agentName)]
  );
  return rows[0]?.id || null;
}

// Record a payment detected from a daily upload delta on a debtor's total_paid.
// Positive deltas are collections; negative deltas are reversals/corrections.
// Inserts the payment and materializes the commission earning in one transaction.
async function recordDetectedPayment({
  debtor,
  previousTotalPaid,
  newTotalPaid,
  lastPaidDate = null,
  lastPaidAmount = null,
  fileId = null,
  userId = null,
}) {
  const prev = Number(previousTotalPaid) || 0;
  const next = Number(newTotalPaid) || 0;
  const delta = round2(next - prev);
  if (delta === 0) return null;

  const source = delta > 0 ? 'upload_delta' : 'upload_reversal';
  const paymentDate = toDate(lastPaidDate) || new Date().toISOString().slice(0, 10);
  const agentName = debtor?.assignedAgent || null;
  const agentUserId = await resolveAgentUserId(agentName).catch(() => null);

  let paymentId;
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [payRes] = await conn.query(
      `INSERT INTO payments
        (debtor_id, client_id, debt_category_id, file_id, amount, payment_date,
         previous_total_paid, new_total_paid, currency_id, agent_user_id,
         agent_name, source, confirmed, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        Number(debtor?.id),
        debtor?.clientId != null ? Number(debtor.clientId) || null : null,
        debtor?.debtCategoryId != null ? Number(debtor.debtCategoryId) || null : null,
        fileId != null ? Number(fileId) || null : null,
        delta,
        paymentDate,
        prev,
        next,
        debtor?.currencyId != null ? Number(debtor.currencyId) || null : null,
        agentUserId,
        agentName,
        source,
        userId != null ? Number(userId) || null : null,
      ]
    );
    paymentId = payRes.insertId;
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  // Materialize the commission earning once the payment is committed. The rate
  // is resolved from the live rate matrix at this moment and locked into the
  // earning row, so later rate edits never rewrite history.
  const earning = await commissionService.recomputeForPayment({
    paymentId,
    clientId: debtor?.clientId,
    debtCategoryId: debtor?.debtCategoryId,
    debtorId: debtor?.id,
    collectedAmount: delta,
    paymentDate,
  });

  recordActivityEvent({
    userId,
    actionType: 'payment.detected',
    title: delta > 0 ? 'Payment Detected' : 'Payment Reversal Detected',
    subject: debtor?.name || null,
    entityType: 'debtor',
    entityId: String(debtor?.id),
    amount: delta,
    metadata: { source, previousTotalPaid: prev, newTotalPaid: next, paymentDate },
  }).catch(() => {});

  return { paymentId, delta, source, paymentDate, commission: earning?.commissionAmount || 0 };
}

// Record an opening-snapshot payment for a debtor (one-time backfill, or a
// newly imported debtor with an opening balance paid). Commission is resolved
// at the current rate.
async function recordBackfillPayment({
  debtorId,
  clientId,
  debtCategoryId,
  amount,
  paymentDate,
  currencyId,
  agentName,
  defaultRate,
}) {
  const amt = round2(Number(amount) || 0);
  if (amt <= 0) return null;

  const paymentDateVal = toDate(paymentDate) || new Date().toISOString().slice(0, 10);
  const agentUserId = await resolveAgentUserId(agentName).catch(() => null);

  const [payRes] = await pool.query(
    `INSERT INTO payments
      (debtor_id, client_id, debt_category_id, file_id, amount, payment_date,
       previous_total_paid, new_total_paid, currency_id, agent_user_id,
       agent_name, source, confirmed, created_by)
     VALUES (?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, 'backfill', 1, NULL)`,
    [
      Number(debtorId),
      clientId != null ? Number(clientId) || null : null,
      debtCategoryId != null ? Number(debtCategoryId) || null : null,
      amt,
      paymentDateVal,
      amt,
      currencyId != null ? Number(currencyId) || null : null,
      agentUserId,
      agentName || null,
    ]
  );
  const paymentId = payRes.insertId;

  await commissionService.recomputeForPayment({
    paymentId,
    clientId,
    debtCategoryId,
    debtorId,
    collectedAmount: amt,
    paymentDate: paymentDateVal,
  });

  return { paymentId, amount: amt };
}

module.exports = {
  listPayments,
  getPaymentTotals,
  recordDetectedPayment,
  recordBackfillPayment,
};
