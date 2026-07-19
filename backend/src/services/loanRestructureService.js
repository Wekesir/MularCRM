const pool = require('../db/pool');
const { isAgentRole } = require('./agentService');
const {
  isSupervisorRole,
  isSeniorSupervisorRole,
  resolveCallCenterScope,
  SUPERVISOR_ROLE_NAMES,
  normalizeRoleName,
} = require('../config/orgRoles');

const REVIEWER_ROLE_NAMES = new Set([
  'collections manager',
  'customer service officer',
]);
const { cancelPendingPtpsForDebtor } = require('./ptpService');
const { createNotification } = require('./notificationService');

const OPEN_STATUSES = new Set(['pending_approval', 'approved']);
const STATUSES = new Set([
  'pending_approval',
  'approved',
  'rejected',
  'cancelled',
  'completed',
]);
const INSTALLMENT_STATUSES = new Set(['pending', 'paid', 'cancelled']);
const MAX_INSTALLMENTS = 60;
const MIN_INSTALLMENTS = 1;

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

/** Add N months to YYYY-MM-DD, clamping day to end of month. */
function addMonths(dateStr, months) {
  const [y, m, d] = String(dateStr).split('-').map(Number);
  const targetMonthIndex = m - 1 + months;
  const year = y + Math.floor(targetMonthIndex / 12);
  let month = targetMonthIndex % 12;
  if (month < 0) month += 12;
  const lastDay = new Date(year, month + 1, 0).getDate();
  const day = Math.min(d, lastDay);
  return `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function generateSchedule({ installmentAmount, installmentCount, firstDueDate }) {
  const amount = toNumber(installmentAmount);
  const count = Math.floor(Number(installmentCount));
  const start = toDate(firstDueDate);
  if (!start || count < MIN_INSTALLMENTS) return [];
  const schedule = [];
  for (let i = 0; i < count; i += 1) {
    schedule.push({
      sequence: i + 1,
      amount,
      dueDate: addMonths(start, i),
    });
  }
  return schedule;
}

function normalizeInstallment(row) {
  return {
    id: row.id,
    restructureId: row.restructure_id,
    sequence: Number(row.sequence),
    amount: toNumber(row.amount),
    dueDate: toDate(row.due_date),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function normalizeRestructure(row, installments = null) {
  const item = {
    id: row.id,
    debtorId: row.debtor_id,
    debtorName: row.debtor_name || null,
    debtorPhone: row.debtor_phone || null,
    outstandingBalance: row.outstanding_balance != null ? toNumber(row.outstanding_balance) : null,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    agentId: row.agent_id,
    agentName: row.agent_name || null,
    contactAttemptId: row.contact_attempt_id || null,
    installmentAmount: toNumber(row.installment_amount),
    installmentCount: Number(row.installment_count) || 0,
    firstDueDate: toDate(row.first_due_date),
    frequency: row.frequency || 'monthly',
    totalPlanAmount: toNumber(row.total_plan_amount),
    previousInstallmentAmount:
      row.previous_installment_amount != null ? toNumber(row.previous_installment_amount) : null,
    previousLoanDueDate: toDate(row.previous_loan_due_date),
    status: row.status,
    reviewedBy: row.reviewed_by || null,
    reviewerName: row.reviewer_name || null,
    reviewedAt: row.reviewed_at || null,
    rejectionReason: row.rejection_reason || null,
    notes: row.notes || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currencySymbol: row.currency_symbol || null,
  };
  if (installments) item.installments = installments;
  return item;
}

const FROM_SQL = `
  FROM loan_restructures lr
  INNER JOIN debtors d ON d.id = lr.debtor_id
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN users u ON u.id = lr.agent_id
  LEFT JOIN users rev ON rev.id = lr.reviewed_by
  LEFT JOIN currencies cur ON cur.id = d.currency_id
`;

const SELECT_SQL = `
  SELECT lr.*,
         d.name AS debtor_name,
         d.phone AS debtor_phone,
         d.outstanding_balance,
         d.client_id,
         c.name AS client_name,
         u.name AS agent_name,
         rev.name AS reviewer_name,
         cur.symbol AS currency_symbol
`;

function canReviewRestructures(viewer) {
  if (!viewer) return false;
  if (viewer.isSystemAdmin) return true;
  if (isAgentRole(viewer)) return false;
  if (isSupervisorRole(viewer)) return true;
  return REVIEWER_ROLE_NAMES.has(normalizeRoleName(viewer).toLowerCase());
}

function buildScopeFilters(filters = {}, viewer = null) {
  const clauses = ['1=1'];
  const params = [];

  if (viewer && isAgentRole(viewer)) {
    clauses.push('lr.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (viewer && !viewer.isSystemAdmin) {
    const scope = resolveCallCenterScope(viewer, { callCenterId: filters.callCenterId });
    if (scope.mode === 'center') {
      if (!scope.callCenterId) {
        clauses.push('1=0');
      } else {
        clauses.push('u.call_center_id = ?');
        params.push(scope.callCenterId);
      }
    } else if (scope.mode === 'company' && scope.callCenterId) {
      clauses.push('u.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  }

  if (filters.agentId && !(viewer && isAgentRole(viewer))) {
    clauses.push('lr.agent_id = ?');
    params.push(Number(filters.agentId));
  }

  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }

  if (filters.debtorId) {
    clauses.push('lr.debtor_id = ?');
    params.push(Number(filters.debtorId));
  }

  if (filters.status && STATUSES.has(String(filters.status))) {
    clauses.push('lr.status = ?');
    params.push(String(filters.status));
  }

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR d.phone LIKE ? OR u.name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

async function getInstallments(restructureId) {
  const [rows] = await pool.query(
    `SELECT * FROM loan_restructure_installments
     WHERE restructure_id = ?
     ORDER BY sequence ASC`,
    [Number(restructureId)]
  );
  return rows.map(normalizeInstallment);
}

async function getRestructureById(id) {
  const [rows] = await pool.query(
    `${SELECT_SQL} ${FROM_SQL} WHERE lr.id = ? LIMIT 1`,
    [Number(id)]
  );
  if (!rows[0]) return null;
  const installments = await getInstallments(id);
  return normalizeRestructure(rows[0], installments);
}

function assertCanView(restructure, viewer) {
  if (!viewer || viewer.isSystemAdmin) return;
  if (isAgentRole(viewer) && Number(restructure.agentId) !== Number(viewer.id)) {
    const err = new Error('You can only view your own restructure requests');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

async function assertAgentOwnsDebtor(user, debtorId) {
  if (!isAgentRole(user)) {
    const err = new Error('Only agents can submit restructure requests');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  const [rows] = await pool.query(
    `SELECT d.*, c.name AS client_name
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     WHERE d.id = ? AND d.deleted_at IS NULL
     LIMIT 1`,
    [Number(debtorId)]
  );
  const debtor = rows[0];
  if (!debtor) {
    const err = new Error('Debtor not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (String(debtor.assigned_agent || '').trim() !== String(user.name || '').trim()) {
    const err = new Error('This case is not assigned to you');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  if (Number(debtor.is_closed) === 1) {
    const err = new Error('Cannot restructure a closed case');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  return debtor;
}

async function findOpenRestructureForDebtor(debtorId) {
  const [rows] = await pool.query(
    `SELECT id, status FROM loan_restructures
     WHERE debtor_id = ? AND status IN ('pending_approval', 'approved')
     LIMIT 1`,
    [Number(debtorId)]
  );
  return rows[0] || null;
}

async function notifyCenterSupervisors(agentId, title, message) {
  const [agentRows] = await pool.query(
    'SELECT call_center_id FROM users WHERE id = ? LIMIT 1',
    [Number(agentId)]
  );
  const centerId = agentRows[0]?.call_center_id;
  if (!centerId) return;

  const [supervisors] = await pool.query(
    `SELECT u.id
     FROM users u
     INNER JOIN roles r ON r.id = u.role_id
     WHERE u.call_center_id = ?
       AND u.is_active = 1
       AND u.deleted_at IS NULL
       AND r.name IN (?)`,
    [Number(centerId), SUPERVISOR_ROLE_NAMES]
  );

  await Promise.all(
    supervisors.map((s) =>
      createNotification({
        userId: s.id,
        title,
        message,
        type: 'info',
      }).catch(() => null)
    )
  );
}

async function createRestructure(payload = {}, viewer) {
  const debtorId = Number(payload.debtorId);
  if (!Number.isFinite(debtorId)) {
    const err = new Error('debtorId is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const debtor = await assertAgentOwnsDebtor(viewer, debtorId);

  const open = await findOpenRestructureForDebtor(debtorId);
  if (open) {
    const err = new Error(
      open.status === 'pending_approval'
        ? 'A restructure request is already pending approval for this debtor'
        : 'This debtor already has an approved repayment plan'
    );
    err.code = 'CONFLICT';
    err.status = 409;
    throw err;
  }

  const installmentAmount = toNumber(payload.installmentAmount);
  const installmentCount = Math.floor(Number(payload.installmentCount));
  const firstDueDate = toDate(payload.firstDueDate);

  if (!(installmentAmount > 0)) {
    const err = new Error('Installment amount must be greater than zero');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (
    !Number.isFinite(installmentCount) ||
    installmentCount < MIN_INSTALLMENTS ||
    installmentCount > MAX_INSTALLMENTS
  ) {
    const err = new Error(`Installment count must be between ${MIN_INSTALLMENTS} and ${MAX_INSTALLMENTS}`);
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }
  if (!firstDueDate) {
    const err = new Error('First due date is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const schedule = generateSchedule({ installmentAmount, installmentCount, firstDueDate });
  const totalPlanAmount = installmentAmount * installmentCount;
  const notes = payload.notes != null ? String(payload.notes).trim() || null : null;

  const conn = await pool.getConnection();
  let insertId;
  try {
    await conn.beginTransaction();
    const [result] = await conn.query(
      `INSERT INTO loan_restructures
        (debtor_id, agent_id, installment_amount, installment_count, first_due_date, frequency,
         total_plan_amount, previous_installment_amount, previous_loan_due_date, status, notes)
       VALUES (?, ?, ?, ?, ?, 'monthly', ?, ?, ?, 'pending_approval', ?)`,
      [
        debtorId,
        Number(viewer.id),
        installmentAmount,
        installmentCount,
        firstDueDate,
        totalPlanAmount,
        debtor.installment_amount != null ? toNumber(debtor.installment_amount) : null,
        toDate(debtor.loan_due_date),
        notes,
      ]
    );
    insertId = result.insertId;

    for (const row of schedule) {
      await conn.query(
        `INSERT INTO loan_restructure_installments
          (restructure_id, sequence, amount, due_date, status)
         VALUES (?, ?, ?, ?, 'pending')`,
        [insertId, row.sequence, row.amount, row.dueDate]
      );
    }
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const created = await getRestructureById(insertId);

  notifyCenterSupervisors(
    viewer.id,
    'Restructure pending approval',
    `${viewer.name || 'An agent'} submitted a repayment plan for ${debtor.name || 'a debtor'} (${installmentCount}× ${installmentAmount}).`
  ).catch(() => {});

  return created;
}

async function listRestructures(filters = {}, viewer = null) {
  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const { where, params } = buildScopeFilters(filters, viewer);

  const [countRows] = await pool.query(
    `SELECT COUNT(*) AS total ${FROM_SQL} ${where}`,
    params
  );
  const total = Number(countRows[0]?.total) || 0;

  const [rows] = await pool.query(
    `${SELECT_SQL} ${FROM_SQL}
     ${where}
     ORDER BY
       CASE lr.status
         WHEN 'pending_approval' THEN 0
         WHEN 'approved' THEN 1
         ELSE 2
       END,
       lr.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map((r) => normalizeRestructure(r)),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  };
}

async function getRestructureTotals(filters = {}, viewer = null) {
  const { where, params } = buildScopeFilters(filters, viewer);
  const [rows] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(CASE WHEN lr.status = 'pending_approval' THEN 1 ELSE 0 END) AS pending_count,
       SUM(CASE WHEN lr.status = 'approved' THEN 1 ELSE 0 END) AS approved_count,
       SUM(CASE WHEN lr.status = 'rejected' THEN 1 ELSE 0 END) AS rejected_count,
       SUM(CASE WHEN lr.status = 'completed' THEN 1 ELSE 0 END) AS completed_count,
       COALESCE(SUM(CASE WHEN lr.status = 'pending_approval' THEN lr.total_plan_amount ELSE 0 END), 0) AS pending_amount,
       COALESCE(SUM(CASE WHEN lr.status = 'approved' THEN lr.total_plan_amount ELSE 0 END), 0) AS approved_amount
     ${FROM_SQL}
     ${where}`,
    params
  );
  const row = rows[0] || {};
  return {
    total: Number(row.total) || 0,
    pendingCount: Number(row.pending_count) || 0,
    approvedCount: Number(row.approved_count) || 0,
    rejectedCount: Number(row.rejected_count) || 0,
    completedCount: Number(row.completed_count) || 0,
    pendingAmount: toNumber(row.pending_amount),
    approvedAmount: toNumber(row.approved_amount),
  };
}

async function getRestructureDetail(id, viewer) {
  const item = await getRestructureById(id);
  if (!item) {
    const err = new Error('Restructure not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  assertCanView(item, viewer);

  // Center-scoped supervisors may only see agents in their center
  if (viewer && isSupervisorRole(viewer) && !viewer.isSystemAdmin && !isSeniorSupervisorRole(viewer)) {
    const scope = resolveCallCenterScope(viewer);
    if (scope.callCenterId) {
      const [rows] = await pool.query(
        'SELECT call_center_id FROM users WHERE id = ? LIMIT 1',
        [item.agentId]
      );
      if (Number(rows[0]?.call_center_id) !== Number(scope.callCenterId)) {
        const err = new Error('Restructure not found');
        err.code = 'NOT_FOUND';
        err.status = 404;
        throw err;
      }
    }
  }

  return item;
}

async function approveRestructure(id, viewer) {
  if (!canReviewRestructures(viewer)) {
    const err = new Error('Only supervisors can approve restructure requests');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const existing = await getRestructureDetail(id, viewer);
  if (existing.status !== 'pending_approval') {
    const err = new Error('Only pending requests can be approved');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE loan_restructures
       SET status = 'approved', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = NULL
       WHERE id = ?`,
      [Number(viewer.id), Number(id)]
    );
    await conn.query(
      `UPDATE debtors
       SET installment_amount = ?, loan_due_date = ?
       WHERE id = ?`,
      [existing.installmentAmount, existing.firstDueDate, existing.debtorId]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  const cancelledPtps = await cancelPendingPtpsForDebtor(existing.debtorId);

  createNotification({
    userId: existing.agentId,
    title: 'Restructure approved',
    message: `Your repayment plan for ${existing.debtorName || 'the debtor'} was approved.`,
    type: 'success',
  }).catch(() => {});

  const updated = await getRestructureById(id);
  return { ...updated, cancelledPtps };
}

async function rejectRestructure(id, payload = {}, viewer) {
  if (!canReviewRestructures(viewer)) {
    const err = new Error('Only supervisors can reject restructure requests');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const existing = await getRestructureDetail(id, viewer);
  if (existing.status !== 'pending_approval') {
    const err = new Error('Only pending requests can be rejected');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const reason = String(payload.rejectionReason || payload.reason || '').trim();
  if (!reason) {
    const err = new Error('Rejection reason is required');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE loan_restructures
       SET status = 'rejected', reviewed_by = ?, reviewed_at = CURRENT_TIMESTAMP, rejection_reason = ?
       WHERE id = ?`,
      [Number(viewer.id), reason, Number(id)]
    );
    await conn.query(
      `UPDATE loan_restructure_installments
       SET status = 'cancelled'
       WHERE restructure_id = ? AND status = 'pending'`,
      [Number(id)]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  createNotification({
    userId: existing.agentId,
    title: 'Restructure rejected',
    message: `Your repayment plan for ${existing.debtorName || 'the debtor'} was rejected: ${reason}`,
    type: 'warning',
  }).catch(() => {});

  return getRestructureById(id);
}

async function cancelRestructure(id, viewer) {
  const existing = await getRestructureDetail(id, viewer);

  if (existing.status !== 'pending_approval') {
    const err = new Error('Only pending requests can be cancelled');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  if (isAgentRole(viewer) && Number(existing.agentId) !== Number(viewer.id)) {
    const err = new Error('You can only cancel your own requests');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE loan_restructures SET status = 'cancelled' WHERE id = ?`,
      [Number(id)]
    );
    await conn.query(
      `UPDATE loan_restructure_installments
       SET status = 'cancelled'
       WHERE restructure_id = ? AND status = 'pending'`,
      [Number(id)]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  return getRestructureById(id);
}

async function updateInstallmentStatus(restructureId, installmentId, status, viewer) {
  if (!INSTALLMENT_STATUSES.has(String(status))) {
    const err = new Error('Invalid installment status');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const existing = await getRestructureDetail(restructureId, viewer);
  if (existing.status !== 'approved' && existing.status !== 'completed') {
    const err = new Error('Installments can only be updated on an approved plan');
    err.code = 'BAD_REQUEST';
    err.status = 400;
    throw err;
  }

  const installment = (existing.installments || []).find(
    (i) => Number(i.id) === Number(installmentId)
  );
  if (!installment) {
    const err = new Error('Installment not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  await pool.query(
    `UPDATE loan_restructure_installments SET status = ? WHERE id = ? AND restructure_id = ?`,
    [String(status), Number(installmentId), Number(restructureId)]
  );

  // Auto-complete when every installment is paid
  if (String(status) === 'paid') {
    const [rows] = await pool.query(
      `SELECT
         SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) AS paid_count,
         COUNT(*) AS total_count
       FROM loan_restructure_installments
       WHERE restructure_id = ? AND status != 'cancelled'`,
      [Number(restructureId)]
    );
    const paid = Number(rows[0]?.paid_count) || 0;
    const total = Number(rows[0]?.total_count) || 0;
    if (total > 0 && paid >= total) {
      await pool.query(
        `UPDATE loan_restructures SET status = 'completed' WHERE id = ? AND status = 'approved'`,
        [Number(restructureId)]
      );
    }
  }

  return getRestructureById(restructureId);
}

module.exports = {
  generateSchedule,
  createRestructure,
  listRestructures,
  getRestructureTotals,
  getRestructureDetail,
  approveRestructure,
  rejectRestructure,
  cancelRestructure,
  updateInstallmentStatus,
  OPEN_STATUSES,
};
