const pool = require('../db/pool');
const { resolveRate } = require('./clientCommissionRateService');

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

function periodMonth(value) {
  const d = toDate(value);
  return d ? d.slice(0, 7) : null;
}

function normalizeEarning(row) {
  return {
    id: row.id,
    paymentId: row.payment_id,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    debtCategoryId: row.debt_category_id || null,
    debtCategoryName: row.debt_category_name || null,
    debtorId: row.debtor_id || null,
    debtorName: row.debtor_name || null,
    collectedAmount: Number(row.collected_amount) || 0,
    rateTier: row.rate_tier || 'global_default',
    rateApplied: Number(row.rate_applied) || 0,
    commissionAmount: Number(row.commission_amount) || 0,
    paidAmount: Number(row.paid_amount) || 0,
    remainingAmount: round2((Number(row.commission_amount) || 0) - (Number(row.paid_amount) || 0)),
    periodMonth: row.period_month || null,
    status: row.status || 'accrued',
    invoicedAt: row.invoiced_at || null,
    paidAt: row.paid_at || null,
    payoutId: row.payout_id || null,
    createdAt: row.created_at,
  };
}

const EARNING_SELECT = `
  SELECT e.*, c.name AS client_name, dc.name AS debt_category_name,
         d.name AS debtor_name, p.payment_date AS payment_date
  FROM commission_earnings e
  LEFT JOIN clients c ON c.id = e.client_id
  LEFT JOIN debt_categories dc ON dc.id = e.debt_category_id
  LEFT JOIN debtors d ON d.id = e.debtor_id
  LEFT JOIN payments p ON p.id = e.payment_id
`;

function buildWhere(f = {}) {
  const params = [];
  const clauses = [];

  if (f.clientId != null && f.clientId !== '') {
    clauses.push('e.client_id = ?');
    params.push(Number(f.clientId));
  }
  if (f.debtCategoryId != null && f.debtCategoryId !== '') {
    clauses.push('e.debt_category_id = ?');
    params.push(Number(f.debtCategoryId));
  }
  if (f.status && String(f.status).trim()) {
    clauses.push('e.status = ?');
    params.push(String(f.status).trim());
  }
  if (f.agentName && String(f.agentName).trim()) {
    clauses.push('e.debtor_id IN (SELECT id FROM debtors WHERE assigned_agent = ?)');
    params.push(String(f.agentName).trim());
  }
  if (f.periodFrom) {
    clauses.push('e.period_month >= ?');
    params.push(String(f.periodFrom).slice(0, 7));
  }
  if (f.periodTo) {
    clauses.push('e.period_month <= ?');
    params.push(String(f.periodTo).slice(0, 7));
  }
  if (f.search && String(f.search).trim()) {
    clauses.push('(d.name LIKE ? OR c.name LIKE ? OR dc.name LIKE ?)');
    const q = `%${String(f.search).trim()}%`;
    params.push(q, q, q);
  }

  return { where: clauses.length ? `WHERE ${clauses.join(' AND ')}` : '', params };
}

// Materialize the commission earning for a payment, locking in the rate that
// applied at this moment. Called from paymentService right after a payment row
// is inserted (upload delta, reversal, or backfill). Negative collected amounts
// (reversals) produce negative commission amounts that net out prior accruals.
async function recomputeForPayment({
  paymentId,
  clientId,
  debtCategoryId,
  debtorId,
  collectedAmount,
  paymentDate,
}) {
  const { rate, tier } = await resolveRate(clientId, debtCategoryId);
  const commissionAmount = round2((Number(collectedAmount) || 0) * (Number(rate) || 0));

  await pool.query(
    `INSERT INTO commission_earnings
      (payment_id, client_id, debt_category_id, debtor_id, collected_amount,
       rate_tier, rate_applied, commission_amount, period_month, status)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'accrued')`,
    [
      paymentId,
      clientId != null ? Number(clientId) || null : null,
      debtCategoryId != null ? Number(debtCategoryId) || null : null,
      debtorId != null ? Number(debtorId) || null : null,
      round2(Number(collectedAmount) || 0),
      tier,
      Number(rate) || 0,
      commissionAmount,
      periodMonth(paymentDate),
    ]
  );

  return { rate, tier, commissionAmount };
}

async function listClientCategorySummary(filters = {}) {
  const { where, params } = buildWhere(filters);
  const [rows] = await pool.query(
    `SELECT e.client_id, e.debt_category_id,
            c.name AS client_name, dc.name AS debt_category_name,
            COALESCE(SUM(e.collected_amount), 0) AS collected,
            COALESCE(SUM(e.commission_amount), 0) AS commission_earned,
            COALESCE(SUM(CASE WHEN e.status = 'accrued' THEN e.commission_amount - e.paid_amount ELSE 0 END), 0) AS accrued,
            COALESCE(SUM(CASE WHEN e.status = 'invoiced' THEN e.commission_amount - e.paid_amount ELSE 0 END), 0) AS invoiced,
            COALESCE(SUM(e.paid_amount), 0) AS paid
       FROM commission_earnings e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN debt_categories dc ON dc.id = e.debt_category_id
       LEFT JOIN debtors d ON d.id = e.debtor_id
       ${where}
       GROUP BY e.client_id, e.debt_category_id, c.name, dc.name
       ORDER BY c.name ASC, dc.name ASC`,
    params
  );
  return rows.map((r) => ({
    clientId: r.client_id || null,
    clientName: r.client_name || null,
    debtCategoryId: r.debt_category_id || null,
    debtCategoryName: r.debt_category_name || 'All categories',
    collected: Number(r.collected) || 0,
    commissionEarned: Number(r.commission_earned) || 0,
    accrued: Number(r.accrued) || 0,
    invoiced: Number(r.invoiced) || 0,
    paid: Number(r.paid) || 0,
    outstanding: round2((Number(r.accrued) || 0) + (Number(r.invoiced) || 0)),
  }));
}

async function listEarnings(filters = {}) {
  const { page = 1, pageSize = 25 } = filters;
  const { where, params } = buildWhere(filters);

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, (Number(page) - 1) * limit);

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM commission_earnings e
     LEFT JOIN clients c ON c.id = e.client_id
     LEFT JOIN debt_categories dc ON dc.id = e.debt_category_id
     LEFT JOIN debtors d ON d.id = e.debtor_id
     ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${EARNING_SELECT} ${where} ORDER BY e.created_at DESC, e.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    items: rows.map((row) => ({
      ...normalizeEarning(row),
      paymentDate: row.payment_date || null,
    })),
    total: Number(total) || 0,
    page: Math.max(1, Number(page) || 1),
    pageSize: limit,
  };
}

async function getTotals(filters = {}) {
  const { where, params } = buildWhere(filters);
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(e.collected_amount), 0) AS collected,
            COALESCE(SUM(e.commission_amount), 0) AS commission,
            COALESCE(SUM(CASE WHEN e.status = 'accrued' THEN e.commission_amount - e.paid_amount ELSE 0 END), 0) AS accrued,
            COALESCE(SUM(CASE WHEN e.status = 'invoiced' THEN e.commission_amount - e.paid_amount ELSE 0 END), 0) AS invoiced,
            COALESCE(SUM(e.paid_amount), 0) AS paid,
            COUNT(*) AS earning_count
       FROM commission_earnings e
       LEFT JOIN clients c ON c.id = e.client_id
       LEFT JOIN debt_categories dc ON dc.id = e.debt_category_id
       LEFT JOIN debtors d ON d.id = e.debtor_id
       ${where}`,
    params
  );
  const accrued = Number(row.accrued) || 0;
  const invoiced = Number(row.invoiced) || 0;
  const paid = Number(row.paid) || 0;
  return {
    collected: Number(row.collected) || 0,
    commission: Number(row.commission) || 0,
    accrued,
    invoiced,
    paid,
    outstanding: round2(accrued + invoiced),
    earningCount: Number(row.earning_count) || 0,
  };
}

async function markEarningsInvoiced(ids) {
  if (!Array.isArray(ids) || ids.length === 0) return { updated: 0 };
  const placeholders = ids.map(() => '?').join(',');
  await pool.query(
    `UPDATE commission_earnings SET status = 'invoiced', invoiced_at = NOW()
      WHERE id IN (${placeholders}) AND status = 'accrued'`,
    ids.map((id) => Number(id))
  );
  return { updated: ids.length };
}

// Record a commission payout received from a client and FIFO-apply it to that
// client's oldest accrued+invoiced (unpaid) earnings.
async function recordClientPayout({ clientId, amount, paidDate, reference, userId = null } = {}) {
  const cid = Number(clientId) || null;
  const amt = round2(Number(amount) || 0);
  if (!cid) {
    const err = new Error('Client is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!(amt > 0)) {
    const err = new Error('Payout amount must be greater than zero');
    err.code = 'VALIDATION';
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const [payoutRes] = await conn.query(
      `INSERT INTO commission_payouts (client_id, amount, paid_date, reference, created_by)
       VALUES (?, ?, ?, ?, ?)`,
      [cid, amt, toDate(paidDate) || null, reference ? String(reference).slice(0, 120) : null, userId]
    );
    const payoutId = payoutRes.insertId;

    const [openEarnings] = await conn.query(
      `SELECT id, commission_amount, paid_amount FROM commission_earnings
        WHERE client_id = ? AND status IN ('accrued','invoiced')
        ORDER BY created_at ASC, id ASC`,
      [cid]
    );

    let remaining = amt;
    const splits = [];
    const fullyPaidIds = [];
    const partialUpdates = [];

    for (const e of openEarnings) {
      if (remaining <= 0.0001) break;
      const owed = Number(e.commission_amount) || 0;
      const alreadyPaid = Number(e.paid_amount) || 0;
      const owedRemaining = round2(owed - alreadyPaid);
      if (owedRemaining <= 0) continue;

      const apply = round2(Math.min(remaining, owedRemaining));
      const newPaid = round2(alreadyPaid + apply);
      remaining = round2(remaining - apply);
      splits.push({ earningId: e.id, amount: apply });

      if (newPaid >= owed - 0.0001) {
        fullyPaidIds.push({ id: e.id, newPaid });
      } else {
        partialUpdates.push({ id: e.id, newPaid });
      }
    }

    for (const { id, newPaid } of fullyPaidIds) {
      await conn.query(
        `UPDATE commission_earnings
            SET status = 'paid', paid_at = NOW(), payout_id = ?, paid_amount = ?
          WHERE id = ?`,
        [payoutId, newPaid, id]
      );
    }
    for (const { id, newPaid } of partialUpdates) {
      await conn.query(
        `UPDATE commission_earnings SET paid_amount = ?, payout_id = ? WHERE id = ?`,
        [newPaid, payoutId, id]
      );
    }

    const settled = round2(amt - remaining);
    await conn.query(
      `UPDATE commission_payouts SET applies_to = ? WHERE id = ?`,
      [
        JSON.stringify({ splits, fullySettled: fullyPaidIds.map((f) => f.id), settled }),
        payoutId,
      ]
    );

    await conn.commit();
    return {
      payoutId,
      settled,
      appliedCount: splits.length,
      fullySettledCount: fullyPaidIds.length,
    };
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }
}

async function listPayouts(filters = {}) {
  const params = [];
  const clauses = [];
  if (filters.clientId != null && filters.clientId !== '') {
    clauses.push('po.client_id = ?');
    params.push(Number(filters.clientId));
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  const [rows] = await pool.query(
    `SELECT po.*, c.name AS client_name
       FROM commission_payouts po
       LEFT JOIN clients c ON c.id = po.client_id
       ${where}
       ORDER BY po.paid_date DESC, po.id DESC`,
    params
  );
  return rows.map((r) => ({
    id: r.id,
    clientId: r.client_id || null,
    clientName: r.client_name || null,
    amount: Number(r.amount) || 0,
    paidDate: r.paid_date || null,
    reference: r.reference || null,
    appliesTo: typeof r.applies_to === 'string' ? JSON.parse(r.applies_to) : r.applies_to,
    createdAt: r.created_at,
  }));
}

module.exports = {
  recomputeForPayment,
  listClientCategorySummary,
  listEarnings,
  getTotals,
  markEarningsInvoiced,
  recordClientPayout,
  listPayouts,
};
