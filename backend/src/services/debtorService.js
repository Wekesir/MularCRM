const pool = require('../db/pool');
const { resolveCallCenterScope, isAgentRole } = require('../config/orgRoles');

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

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function normalizeDebtor(row) {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id,
    clientName: row.client_name || null,
    cfid: row.cfid,
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    phone: row.phone || null,
    assignedAgent: row.assigned_agent || null,
    loanAmount: toNumber(row.loan_amount),
    totalPaid: toNumber(row.total_paid),
    outstandingBalance: toNumber(row.outstanding_balance),
    overdueDays: Number(row.overdue_days) || 0,
    bucket: row.bucket || null,
    borrowDate: toDate(row.borrow_date),
    // Portfolio fields
    loanId: row.loan_id || null,
    principalAmount: row.principal_amount != null ? toNumber(row.principal_amount) : null,
    accountNumber: row.account_number || null,
    email: row.email || null,
    idNumber: row.id_number || null,
    waivedAmount: row.waived_amount != null ? toNumber(row.waived_amount) : null,
    contractNumber: row.contract_number || null,
    secondaryPhoneNumber: row.secondary_phone_number || null,
    installmentAmount: row.installment_amount != null ? toNumber(row.installment_amount) : null,
    penalty: row.penalty != null ? toNumber(row.penalty) : null,
    loanDueDate: toDate(row.loan_due_date),
    lastPaidAmount: row.last_paid_amount != null ? toNumber(row.last_paid_amount) : null,
    lastPaidDate: toDate(row.last_paid_date),
    loanCounter: row.loan_counter != null ? Number(row.loan_counter) || null : null,
    physicalAddress: row.physical_address || null,
    employerAndAddress: row.employer_and_address || null,
    nextOfKinFullName: row.next_of_kin_full_name || null,
    nextOfKinRelationship: row.next_of_kin_relationship || null,
    nextOfKinPhoneNumber: row.next_of_kin_phone_number || null,
    nextOfKinEmail: row.next_of_kin_email || null,
    guarantorFullName: row.guarantor_full_name || null,
    guarantorPhones: row.guarantor_phones || null,
    guarantorEmail: row.guarantor_email || null,
    guarantorAddress: row.guarantor_address || null,
    // Contact / scheduling
    contactStatusId: row.contact_status_id || null,
    contactStatusName: row.contact_status_name || null,
    contactStatusCode: row.contact_status_code || null,
    lastContactedAt: row.last_contacted_at || null,
    lastContactChannel: row.last_contact_channel || null,
    nextActionDate: toDate(row.next_action_date),
    // Lookups
    debtCategoryId: row.debt_category_id || null,
    debtCategoryName: row.debt_category_name || null,
    debtTypeId: row.debt_type_id || null,
    debtTypeName: row.debt_type_name || null,
    currencyId: row.currency_id || null,
    currencyCode: row.currency_code || null,
    currencySymbol: row.currency_symbol || null,
    deletedAt: row.deleted_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    isClosed: Boolean(row.is_closed),
    closureReason: row.closure_reason || null,
    closedAt: row.closed_at || null,
  };
}

const SELECT_WITH_CLIENT = `
  SELECT d.*,
         c.name AS client_name,
         c.call_center_id AS client_call_center_id,
         dc.name AS debt_category_name,
         dt.name AS debt_type_name,
         cur.code AS currency_code,
         cur.symbol AS currency_symbol,
         df.file_name AS file_name,
         df.is_closed AS file_is_closed,
         df.call_center_id AS file_call_center_id,
         cs.name AS contact_status_name,
         cs.code AS contact_status_code
  FROM debtors d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN debt_categories dc ON dc.id = d.debt_category_id
  LEFT JOIN debt_types dt ON dt.id = d.debt_type_id
  LEFT JOIN currencies cur ON cur.id = d.currency_id
  LEFT JOIN debtor_files df ON df.id = d.file_id
  LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
`;

/**
 * Scope debtor lists:
 * - Agents → only cases assigned to them (by collector name)
 * - Center Supervisors → file/client call center bind
 * - Unbound / other centers hidden for supervisors
 */
function applyDebtorCallCenterScope(clauses, params, user) {
  if (!user) return;
  if (isAgentRole(user) && !user.isSystemAdmin) {
    const name = String(user.name || '').trim();
    if (!name) {
      clauses.push('1=0');
      return;
    }
    clauses.push(`${'d'}.assigned_agent = ?`);
    params.push(name);
    return;
  }
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'none') {
    clauses.push('1=0');
    return;
  }
  if (scope.mode === 'center') {
    if (!scope.callCenterId) {
      clauses.push('1=0');
      return;
    }
    clauses.push('COALESCE(df.call_center_id, c.call_center_id) = ?');
    params.push(scope.callCenterId);
  }
}

function resolveDebtorCallCenterId(row) {
  if (!row) return null;
  if (row.file_call_center_id != null) return Number(row.file_call_center_id);
  if (row.client_call_center_id != null) return Number(row.client_call_center_id);
  return null;
}

async function assertCallerCanAccessDebtor(user, debtorRow) {
  if (!user || user.isSystemAdmin) return;
  if (isAgentRole(user)) {
    const name = String(user.name || '').trim();
    if (!name || String(debtorRow?.assigned_agent || '') !== name) {
      const err = new Error('This debtor is not in your portfolio');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
    return;
  }
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'company') return;
  if (scope.mode !== 'center' || !scope.callCenterId) {
    const err = new Error('You are not bound to a call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  const centerId = resolveDebtorCallCenterId(debtorRow);
  if (!centerId || Number(centerId) !== Number(scope.callCenterId)) {
    const err = new Error('This debtor is not assigned to your call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

// Build the WHERE clause + params shared by listDebtors / listAllDebtors /
// getDebtorTotals. Assumes the query FROM includes `debtors d` plus LEFT JOINs
// to clients (c) and debtor_files (df) — see SELECT_WITH_CLIENT and the
// count/totals queries below.
function buildDebtorWhere(f = {}) {
  const params = [];
  const clauses = ['d.deleted_at IS NULL'];

  applyDebtorCallCenterScope(clauses, params, f.user);

  if (f.fileId != null && f.fileId !== '') {
    clauses.push('d.file_id = ?');
    params.push(Number(f.fileId));
  }
  if (f.clientId != null && f.clientId !== '') {
    clauses.push('d.client_id = ?');
    params.push(Number(f.clientId));
  }
  if (f.bucket && String(f.bucket).trim()) {
    clauses.push('d.bucket = ?');
    params.push(String(f.bucket).trim());
  }
  if (f.agent && String(f.agent).trim()) {
    clauses.push('d.assigned_agent = ?');
    params.push(String(f.agent).trim());
  }
  if (f.contactStatusId != null && f.contactStatusId !== '') {
    clauses.push('d.contact_status_id = ?');
    params.push(Number(f.contactStatusId));
  }
  if (f.assignmentStatus === 'assigned') {
    clauses.push('d.assigned_agent IS NOT NULL AND d.assigned_agent <> ""');
  } else if (f.assignmentStatus === 'unassigned') {
    clauses.push('(d.assigned_agent IS NULL OR d.assigned_agent = "")');
  }
  // Per-debtor case closure. Default: hide closed cases (they appear on the
  // Closed Files page). Pass caseClosed=1 to show only closed, or
  // caseClosed=any to include both.
  if (f.caseClosed === '1' || f.caseClosed === true) {
    clauses.push('d.is_closed = 1');
  } else if (f.caseClosed !== 'any') {
    clauses.push('(d.is_closed = 0 OR d.is_closed IS NULL)');
  }
  if (f.discounted === '1' || f.discounted === true) {
    clauses.push('d.waived_amount > 0');
  }
  if (f.closed === '1' || f.closed === true) {
    clauses.push('df.is_closed = 1');
  } else if (f.closed === '0' || f.closed === false) {
    clauses.push('(df.is_closed = 0 OR df.is_closed IS NULL)');
  }
  if (f.ptp === '1' || f.ptp === true) {
    clauses.push('d.contact_status_id IN (SELECT id FROM contact_statuses WHERE code = ?)');
    params.push('PTP');
  } else if (f.ptp === '0' || f.ptp === false) {
    clauses.push('(d.contact_status_id IS NULL OR d.contact_status_id NOT IN (SELECT id FROM contact_statuses WHERE code = ?))');
    params.push('PTP');
  }
  if (f.dpdMin != null && f.dpdMin !== '') {
    clauses.push('d.overdue_days >= ?');
    params.push(Number(f.dpdMin));
  }
  if (f.dpdMax != null && f.dpdMax !== '') {
    clauses.push('d.overdue_days <= ?');
    params.push(Number(f.dpdMax));
  }
  if (f.balanceMin != null && f.balanceMin !== '') {
    clauses.push('d.outstanding_balance >= ?');
    params.push(Number(f.balanceMin));
  }
  if (f.balanceMax != null && f.balanceMax !== '') {
    clauses.push('d.outstanding_balance <= ?');
    params.push(Number(f.balanceMax));
  }
  if (f.lastContactedFrom) {
    clauses.push('d.last_contacted_at >= ?');
    params.push(String(f.lastContactedFrom));
  }
  if (f.lastContactedTo) {
    clauses.push('d.last_contacted_at <= ?');
    params.push(String(f.lastContactedTo));
  }
  if (f.nextActionFrom) {
    clauses.push('d.next_action_date >= ?');
    params.push(String(f.nextActionFrom));
  }
  if (f.nextActionTo) {
    clauses.push('d.next_action_date <= ?');
    params.push(String(f.nextActionTo));
  }
  if (f.search && String(f.search).trim()) {
    clauses.push(`(
      d.name LIKE ? OR d.phone LIKE ? OR d.loan_id LIKE ? OR d.id_number LIKE ?
      OR d.email LIKE ? OR d.cfid LIKE ? OR c.name LIKE ?
    )`);
    const q = `%${String(f.search).trim()}%`;
    params.push(q, q, q, q, q, q, q);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

const COUNT_FROM = `
  FROM debtors d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN debtor_files df ON df.id = d.file_id
`;

async function listDebtors(filters = {}) {
  const {
    page = 1,
    pageSize = 25,
  } = filters;
  const { where, params } = buildDebtorWhere(filters);

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, (Number(page) - 1) * limit);

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total ${COUNT_FROM} ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${SELECT_WITH_CLIENT} ${where} ORDER BY d.created_at DESC, d.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    items: rows.map(normalizeDebtor),
    total: Number(total) || 0,
    page: Math.max(1, Number(page) || 1),
    pageSize: limit,
    hasMore: offset + rows.length < Number(total),
  };
}

// Unpaginated export of every debtor matching the filters (used by the
// CSV/Excel export buttons — NOT for the table, which is paginated).
async function listAllDebtors(filters = {}) {
  const { where, params } = buildDebtorWhere(filters);
  const [rows] = await pool.query(
    `${SELECT_WITH_CLIENT} ${where} ORDER BY d.created_at DESC, d.id DESC`,
    params
  );
  return rows.map(normalizeDebtor);
}

// Distinct buckets present in the (filtered) debtor set.
async function listDebtorBuckets(filters = {}) {
  const { where, params } = buildDebtorWhere(filters);
  const [rows] = await pool.query(
    `SELECT DISTINCT d.bucket AS bucket ${COUNT_FROM} ${where} AND d.bucket IS NOT NULL AND d.bucket <> '' ORDER BY d.bucket ASC`,
    params
  );
  return rows.map((r) => r.bucket).filter(Boolean);
}

// Distinct assigned-agent values present in the (filtered) debtor set — used
// to populate the Agent advanced filter.
async function listDebtorAgents(filters = {}) {
  const { where, params } = buildDebtorWhere(filters);
  const [rows] = await pool.query(
    `SELECT DISTINCT d.assigned_agent AS agent ${COUNT_FROM} ${where} AND d.assigned_agent IS NOT NULL AND d.assigned_agent <> '' ORDER BY d.assigned_agent ASC`,
    params
  );
  return rows.map((r) => r.agent).filter(Boolean);
}

async function getDebtorById(id, { user = null } = {}) {
  const [rows] = await pool.query(`${SELECT_WITH_CLIENT} WHERE d.id = ? LIMIT 1`, [id]);
  if (!rows[0]) return null;
  if (user) await assertCallerCanAccessDebtor(user, rows[0]);
  return normalizeDebtor(rows[0]);
}

async function getDebtorByCfid(cfid) {
  const [rows] = await pool.query(`${SELECT_WITH_CLIENT} WHERE d.cfid = ? LIMIT 1`, [cfid]);
  return rows[0] ? normalizeDebtor(rows[0]) : null;
}

async function resolveClientIdByName(name) {
  if (!name) return null;
  const [rows] = await pool.query(
    'SELECT id FROM clients WHERE name = ? AND deleted_at IS NULL LIMIT 1',
    [String(name).trim()]
  );
  return rows[0] ? rows[0].id : null;
}

async function createDebtor(data) {
  const name = String(data.name || '').trim();
  const cfid = String(data.cfid || '').trim();
  if (!name) {
    const err = new Error('Debtor name is required');
    err.code = 'VALIDATION';
    throw err;
  }
  if (!cfid) {
    const err = new Error('CFID is required');
    err.code = 'VALIDATION';
    throw err;
  }

  // cfid is now the batch (debtor_files) id, shared by every row in a batch, so
  // we no longer enforce per-row uniqueness here. Within-file dedup on the
  // lender's loan_id is handled by the bulk upload service.

  let clientId = data.clientId != null ? Number(data.clientId) || null : null;
  if (clientId == null && data.clientName) {
    clientId = await resolveClientIdByName(data.clientName);
  }

  const fileId = data.fileId != null ? Number(data.fileId) || null : null;
  const debtCategoryId = data.debtCategoryId != null ? Number(data.debtCategoryId) || null : null;
  const debtTypeId = data.debtTypeId != null ? Number(data.debtTypeId) || null : null;
  const currencyId = data.currencyId != null ? Number(data.currencyId) || null : null;

  const insertColumns = [
    'name', 'client_id', 'cfid', 'file_id', 'phone', 'assigned_agent',
    'loan_amount', 'total_paid', 'outstanding_balance', 'overdue_days', 'bucket', 'borrow_date',
    'loan_id', 'principal_amount', 'account_number', 'email', 'id_number', 'waived_amount',
    'contract_number', 'secondary_phone_number', 'installment_amount', 'penalty',
    'loan_due_date', 'last_paid_amount', 'last_paid_date', 'loan_counter',
    'physical_address', 'employer_and_address',
    'next_of_kin_full_name', 'next_of_kin_relationship', 'next_of_kin_phone_number', 'next_of_kin_email',
    'guarantor_full_name', 'guarantor_phones', 'guarantor_email', 'guarantor_address',
    'debt_category_id', 'debt_type_id', 'currency_id',
  ];
  const insertValues = [
    name,
    clientId,
    cfid,
    fileId,
    data.phone ? String(data.phone).trim() : null,
    data.assignedAgent ? String(data.assignedAgent).trim() : null,
    toNumber(data.loanAmount),
    toNumber(data.totalPaid),
    toNumber(data.outstandingBalance),
    Number(data.overdueDays) || 0,
    data.bucket ? String(data.bucket).trim() : null,
    toDate(data.borrowDate),
    data.loanId ? String(data.loanId).trim() : null,
    data.principalAmount != null ? toNumber(data.principalAmount) : null,
    data.accountNumber ? String(data.accountNumber).trim() : null,
    data.email ? String(data.email).trim() : null,
    data.idNumber ? String(data.idNumber).trim() : null,
    data.waivedAmount != null ? toNumber(data.waivedAmount) : null,
    data.contractNumber ? String(data.contractNumber).trim() : null,
    data.secondaryPhoneNumber ? String(data.secondaryPhoneNumber).trim() : null,
    data.installmentAmount != null ? toNumber(data.installmentAmount) : null,
    data.penalty != null ? toNumber(data.penalty) : null,
    toDate(data.loanDueDate),
    data.lastPaidAmount != null ? toNumber(data.lastPaidAmount) : null,
    toDate(data.lastPaidDate),
    data.loanCounter != null ? Number(data.loanCounter) || null : null,
    data.physicalAddress ? String(data.physicalAddress).trim() : null,
    data.employerAndAddress ? String(data.employerAndAddress).trim() : null,
    data.nextOfKinFullName ? String(data.nextOfKinFullName).trim() : null,
    data.nextOfKinRelationship ? String(data.nextOfKinRelationship).trim() : null,
    data.nextOfKinPhoneNumber ? String(data.nextOfKinPhoneNumber).trim() : null,
    data.nextOfKinEmail ? String(data.nextOfKinEmail).trim() : null,
    data.guarantorFullName ? String(data.guarantorFullName).trim() : null,
    data.guarantorPhones ? String(data.guarantorPhones).trim() : null,
    data.guarantorEmail ? String(data.guarantorEmail).trim() : null,
    data.guarantorAddress ? String(data.guarantorAddress).trim() : null,
    debtCategoryId,
    debtTypeId,
    currencyId,
  ];

  if (insertColumns.length !== insertValues.length) {
    throw new Error(
      `Debtor INSERT column/value mismatch: ${insertColumns.length} columns vs ${insertValues.length} values`
    );
  }

  const [result] = await pool.query(
    `INSERT INTO debtors (${insertColumns.join(', ')}) VALUES (${insertColumns.map(() => '?').join(', ')})`,
    insertValues
  );

  return getDebtorById(result.insertId);
}

// Upsert a debtor by (client_id, loan_id). Daily uploads re-send the same
// loan_id with an updated total_paid; we update the existing row's financial &
// contact fields in place rather than creating a duplicate, and surface the
// previous total_paid so the caller can detect a payment delta.
//
// Preserved on update (call-center-owned / identity / classification):
//   assigned_agent, is_closed, closure_reason, closed_at, file_id, cfid,
//   client_id, loan_id, debt_category_id, debt_type_id, currency_id,
//   contact_status_id, last_contacted_at, next_action_date.
async function upsertDebtorByLoanId(data) {
  const clientId = data.clientId != null ? Number(data.clientId) || null : null;
  const loanId = data.loanId ? String(data.loanId).trim() : null;
  if (clientId == null || !loanId) {
    // Without a (client_id, loan_id) key we cannot match — fall back to insert.
    const debtor = await createDebtor(data);
    return { debtor, wasCreated: true, previousTotalPaid: 0 };
  }

  const [existing] = await pool.query(
    `SELECT id, name, phone, email, secondary_phone_number, loan_amount, total_paid,
            outstanding_balance, overdue_days, bucket, waived_amount, installment_amount,
            penalty, account_number, id_number, contract_number, physical_address
       FROM debtors
      WHERE client_id = ? AND loan_id = ? AND deleted_at IS NULL
      ORDER BY created_at DESC, id DESC LIMIT 1`,
    [clientId, loanId]
  );

  if (!existing[0]) {
    const debtor = await createDebtor(data);
    return { debtor, wasCreated: true, previousTotalPaid: 0, changedFields: [] };
  }

  const prev = existing[0];
  const debtorId = prev.id;
  const previousTotalPaid = Number(prev.total_paid) || 0;

  const nextValues = {
    name: String(data.name || '').trim(),
    phone: data.phone ? String(data.phone).trim() : null,
    email: data.email ? String(data.email).trim() : null,
    secondaryPhoneNumber: data.secondaryPhoneNumber ? String(data.secondaryPhoneNumber).trim() : null,
    loanAmount: toNumber(data.loanAmount),
    totalPaid: toNumber(data.totalPaid),
    outstandingBalance: toNumber(data.outstandingBalance),
    overdueDays: Number(data.overdueDays) || 0,
    bucket: data.bucket ? String(data.bucket).trim() : null,
    borrowDate: toDate(data.borrowDate),
    principalAmount: data.principalAmount != null ? toNumber(data.principalAmount) : null,
    accountNumber: data.accountNumber ? String(data.accountNumber).trim() : null,
    idNumber: data.idNumber ? String(data.idNumber).trim() : null,
    waivedAmount: data.waivedAmount != null ? toNumber(data.waivedAmount) : null,
    contractNumber: data.contractNumber ? String(data.contractNumber).trim() : null,
    installmentAmount: data.installmentAmount != null ? toNumber(data.installmentAmount) : null,
    penalty: data.penalty != null ? toNumber(data.penalty) : null,
    loanDueDate: toDate(data.loanDueDate),
    lastPaidAmount: data.lastPaidAmount != null ? toNumber(data.lastPaidAmount) : null,
    lastPaidDate: toDate(data.lastPaidDate),
    loanCounter: data.loanCounter != null ? Number(data.loanCounter) || null : null,
    physicalAddress: data.physicalAddress ? String(data.physicalAddress).trim() : null,
    employerAndAddress: data.employerAndAddress ? String(data.employerAndAddress).trim() : null,
    nextOfKinFullName: data.nextOfKinFullName ? String(data.nextOfKinFullName).trim() : null,
    nextOfKinRelationship: data.nextOfKinRelationship ? String(data.nextOfKinRelationship).trim() : null,
    nextOfKinPhoneNumber: data.nextOfKinPhoneNumber ? String(data.nextOfKinPhoneNumber).trim() : null,
    nextOfKinEmail: data.nextOfKinEmail ? String(data.nextOfKinEmail).trim() : null,
    guarantorFullName: data.guarantorFullName ? String(data.guarantorFullName).trim() : null,
    guarantorPhones: data.guarantorPhones ? String(data.guarantorPhones).trim() : null,
    guarantorEmail: data.guarantorEmail ? String(data.guarantorEmail).trim() : null,
    guarantorAddress: data.guarantorAddress ? String(data.guarantorAddress).trim() : null,
  };

  const updates = [
    'name = ?', 'phone = ?', 'email = ?', 'secondary_phone_number = ?',
    'loan_amount = ?', 'total_paid = ?', 'outstanding_balance = ?',
    'overdue_days = ?', 'bucket = ?', 'borrow_date = ?',
    'principal_amount = ?', 'account_number = ?', 'id_number = ?',
    'waived_amount = ?', 'contract_number = ?', 'installment_amount = ?',
    'penalty = ?', 'loan_due_date = ?', 'last_paid_amount = ?', 'last_paid_date = ?',
    'loan_counter = ?', 'physical_address = ?', 'employer_and_address = ?',
    'next_of_kin_full_name = ?', 'next_of_kin_relationship = ?',
    'next_of_kin_phone_number = ?', 'next_of_kin_email = ?',
    'guarantor_full_name = ?', 'guarantor_phones = ?', 'guarantor_email = ?',
    'guarantor_address = ?',
  ];
  const values = [
    nextValues.name,
    nextValues.phone,
    nextValues.email,
    nextValues.secondaryPhoneNumber,
    nextValues.loanAmount,
    nextValues.totalPaid,
    nextValues.outstandingBalance,
    nextValues.overdueDays,
    nextValues.bucket,
    nextValues.borrowDate,
    nextValues.principalAmount,
    nextValues.accountNumber,
    nextValues.idNumber,
    nextValues.waivedAmount,
    nextValues.contractNumber,
    nextValues.installmentAmount,
    nextValues.penalty,
    nextValues.loanDueDate,
    nextValues.lastPaidAmount,
    nextValues.lastPaidDate,
    nextValues.loanCounter,
    nextValues.physicalAddress,
    nextValues.employerAndAddress,
    nextValues.nextOfKinFullName,
    nextValues.nextOfKinRelationship,
    nextValues.nextOfKinPhoneNumber,
    nextValues.nextOfKinEmail,
    nextValues.guarantorFullName,
    nextValues.guarantorPhones,
    nextValues.guarantorEmail,
    nextValues.guarantorAddress,
    debtorId,
  ];

  await pool.query(`UPDATE debtors SET ${updates.join(', ')} WHERE id = ?`, values);

  const numEq = (a, b) => (Number(a) || 0) === (Number(b) || 0);
  const strEq = (a, b) => String(a || '') === String(b || '');
  const changedFields = [];
  if (!strEq(prev.name, nextValues.name)) changedFields.push('name');
  if (!strEq(prev.phone, nextValues.phone)) changedFields.push('phone');
  if (!strEq(prev.email, nextValues.email)) changedFields.push('email');
  if (!strEq(prev.secondary_phone_number, nextValues.secondaryPhoneNumber)) {
    changedFields.push('secondaryPhone');
  }
  if (!numEq(prev.loan_amount, nextValues.loanAmount)) changedFields.push('loanAmount');
  if (!numEq(prev.outstanding_balance, nextValues.outstandingBalance)) {
    changedFields.push('outstandingBalance');
  }
  if (!numEq(prev.overdue_days, nextValues.overdueDays)) changedFields.push('overdueDays');
  if (!strEq(prev.bucket, nextValues.bucket)) changedFields.push('bucket');
  if (!numEq(prev.waived_amount, nextValues.waivedAmount)) changedFields.push('waivedAmount');
  if (!numEq(prev.installment_amount, nextValues.installmentAmount)) {
    changedFields.push('installmentAmount');
  }
  if (!numEq(prev.penalty, nextValues.penalty)) changedFields.push('penalty');
  if (!strEq(prev.account_number, nextValues.accountNumber)) changedFields.push('accountNumber');
  if (!strEq(prev.id_number, nextValues.idNumber)) changedFields.push('idNumber');
  if (!strEq(prev.contract_number, nextValues.contractNumber)) changedFields.push('contractNumber');
  if (!strEq(prev.physical_address, nextValues.physicalAddress)) {
    changedFields.push('physicalAddress');
  }

  const debtor = await getDebtorById(debtorId);
  return { debtor, wasCreated: false, previousTotalPaid, changedFields };
}

// ── debtor_files (bulk-upload batches) ──

async function createDebtorFile({
  clientId = null,
  fileName = null,
  debtCategoryId = null,
  debtTypeId = null,
  currencyId = null,
  uploadedBy = null,
  batchDate = null,
  source = null,
  callCenterId = null,
  callCenterAssignedBy = null,
} = {}) {
  const centerId = callCenterId != null ? Number(callCenterId) || null : null;
  const [result] = await pool.query(
    `INSERT INTO debtor_files
      (client_id, file_name, debt_category_id, debt_type_id, currency_id, uploaded_by,
       batch_date, source, call_center_id, call_center_assigned_at, call_center_assigned_by)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ${centerId ? 'NOW()' : 'NULL'}, ?)`,
    [
      clientId != null ? Number(clientId) || null : null,
      fileName ? String(fileName).slice(0, 255) : null,
      debtCategoryId != null ? Number(debtCategoryId) || null : null,
      debtTypeId != null ? Number(debtTypeId) || null : null,
      currencyId != null ? Number(currencyId) || null : null,
      uploadedBy != null ? Number(uploadedBy) || null : null,
      batchDate || null,
      source ? String(source).slice(0, 32) : null,
      centerId,
      centerId && callCenterAssignedBy != null ? Number(callCenterAssignedBy) || null : null,
    ]
  );
  return { id: result.insertId, callCenterId: centerId };
}

async function updateDebtorFileStats(id, { rowCount, importedCount, skippedCount }) {
  await pool.query(
    `UPDATE debtor_files SET row_count = ?, imported_count = ?, skipped_count = ? WHERE id = ?`,
    [Number(rowCount) || 0, Number(importedCount) || 0, Number(skippedCount) || 0, id]
  );
}

/**
 * Find the case file for a client on a calendar day (batch_date).
 * Used by live payments API pulls so all rows for that day share one CFID.
 */
async function findDebtorFileForClientDay(clientId, batchDate) {
  const cid = Number(clientId);
  const date = String(batchDate || '').slice(0, 10);
  if (!Number.isFinite(cid) || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;

  const [[row]] = await pool.query(
    `SELECT id, client_id, file_name, debt_category_id, debt_type_id, currency_id,
            row_count, imported_count, skipped_count, batch_date, source
     FROM debtor_files
     WHERE client_id = ?
       AND batch_date = ?
       AND deleted_at IS NULL
     ORDER BY id ASC
     LIMIT 1`,
    [cid, date]
  );
  if (!row) return null;
  return {
    id: row.id,
    clientId: row.client_id,
    fileName: row.file_name,
    debtCategoryId: row.debt_category_id,
    debtTypeId: row.debt_type_id,
    currencyId: row.currency_id,
    rowCount: row.row_count,
    importedCount: row.imported_count,
    skippedCount: row.skipped_count,
    batchDate: row.batch_date,
    source: row.source,
  };
}

/**
 * Find or create one debtor_files row per client per calendar day for API imports.
 * Returns { id, cfid, created }.
 */
async function findOrCreateDebtorFileForClientDay({
  clientId,
  batchDate,
  debtCategoryId = null,
  debtTypeId = null,
  currencyId = null,
  uploadedBy = null,
  source = 'api',
} = {}) {
  const date = String(batchDate || '').slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    const err = new Error('batchDate must be YYYY-MM-DD');
    err.code = 'VALIDATION';
    throw err;
  }

  const existing = await findDebtorFileForClientDay(clientId, date);
  if (existing) {
    return { id: existing.id, cfid: String(existing.id), created: false, file: existing };
  }

  const fileName = await resolveBatchFileName({
    clientId,
    debtCategoryId,
    batchDate: date,
  });
  const created = await createDebtorFile({
    clientId,
    fileName,
    debtCategoryId,
    debtTypeId,
    currencyId,
    uploadedBy,
    batchDate: date,
    source,
  });
  return {
    id: created.id,
    cfid: String(created.id),
    created: true,
    file: { id: created.id, batchDate: date, source },
  };
}

// Build a human-readable batch file name: clientName_debtCategory_DDMMYYYY.
// e.g. client "Wekesir Fintech", category "loans" → "Wekesir_Fintech_loans_07072026".
// Optional batchDate (YYYY-MM-DD) pins the date portion for API same-day files.
async function resolveBatchFileName({
  clientId = null,
  debtCategoryId = null,
  batchDate = null,
} = {}) {
  const slug = (s) =>
    String(s || '')
      .trim()
      .replace(/[^a-zA-Z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '');

  const parts = [];
  if (clientId != null) {
    const [[cRow]] = await pool.query('SELECT name FROM clients WHERE id = ? LIMIT 1', [Number(clientId)]);
    const n = slug(cRow?.name);
    if (n) parts.push(n);
  }
  if (debtCategoryId != null) {
    const [[dcRow]] = await pool.query('SELECT name FROM debt_categories WHERE id = ? LIMIT 1', [Number(debtCategoryId)]);
    const n = slug(dcRow?.name);
    if (n) parts.push(n);
  }

  let dd;
  let mm;
  let yyyy;
  if (batchDate && /^\d{4}-\d{2}-\d{2}$/.test(String(batchDate))) {
    const [y, m, d] = String(batchDate).split('-');
    yyyy = y;
    mm = m;
    dd = d;
  } else {
    const now = new Date();
    dd = String(now.getDate()).padStart(2, '0');
    mm = String(now.getMonth() + 1).padStart(2, '0');
    yyyy = String(now.getFullYear());
  }
  parts.push(`${dd}${mm}${yyyy}`);

  const name = parts.filter(Boolean).join('_') || `batch_${dd}${mm}${yyyy}`;
  return name.slice(0, 255);
}

async function assertCallerCanAccessDebtorFile(user, fileRow) {
  if (!user || user.isSystemAdmin) return;
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'company') return;
  if (scope.mode !== 'center' || !scope.callCenterId) {
    const err = new Error('You are not bound to a call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  const fileCenter =
    fileRow?.call_center_id != null
      ? Number(fileRow.call_center_id)
      : fileRow?.client_call_center_id != null
        ? Number(fileRow.client_call_center_id)
        : null;
  if (!fileCenter || Number(fileCenter) !== Number(scope.callCenterId)) {
    const err = new Error('This portfolio is not assigned to your call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

// Soft-delete a batch file and every debtor that belongs to it. Both the
// debtor_files row and the matching debtors get deleted_at stamped, so they
// disappear from listings without losing data.
async function softDeleteDebtorFile(id, { user = null } = {}) {
  const fileId = Number(id);
  if (!Number.isFinite(fileId)) return { deleted: false, debtors: [] };
  const [[existing]] = await pool.query(
    `SELECT df.id, df.call_center_id, c.call_center_id AS client_call_center_id
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     WHERE df.id = ? AND df.deleted_at IS NULL
     LIMIT 1`,
    [fileId]
  );
  if (!existing) return { deleted: false, debtors: [] };
  if (user) await assertCallerCanAccessDebtorFile(user, existing);

  const [debtors] = await pool.query(
    'SELECT id, name FROM debtors WHERE file_id = ? AND deleted_at IS NULL',
    [fileId]
  );
  await pool.query('UPDATE debtors SET deleted_at = NOW() WHERE file_id = ? AND deleted_at IS NULL', [fileId]);
  await pool.query('UPDATE debtor_files SET deleted_at = NOW() WHERE id = ?', [fileId]);
  return {
    deleted: true,
    fileId,
    debtors: debtors.map((row) => ({ id: row.id, name: row.name || null })),
  };
}

async function listDebtorFiles({ user = null } = {}) {
  const where = ['df.deleted_at IS NULL'];
  const params = [];
  if (user) {
    if (isAgentRole(user) && !user.isSystemAdmin) {
      const name = String(user.name || '').trim();
      if (!name) return [];
      // Only files that still have at least one of this agent's open cases.
      where.push(`EXISTS (
        SELECT 1 FROM debtors d
        WHERE d.file_id = df.id
          AND d.deleted_at IS NULL
          AND d.is_closed = 0
          AND d.assigned_agent = ?
      )`);
      params.push(name);
    } else {
      const scope = resolveCallCenterScope(user);
      if (scope.mode === 'none') return [];
      if (scope.mode === 'center') {
        if (!scope.callCenterId) return [];
        where.push(
          '(df.call_center_id = ? OR (df.call_center_id IS NULL AND c.call_center_id = ?))'
        );
        params.push(scope.callCenterId, scope.callCenterId);
      }
    }
  }

  const [rows] = await pool.query(
    `SELECT df.*,
            c.name AS client_name,
            dc.name AS debt_category_name,
            dt.name AS debt_type_name,
            cur.code AS currency_code,
            cur.symbol AS currency_symbol,
            u.name AS uploaded_by_name,
            agg.loan_total,
            agg.collected_total,
            agg.outstanding_total
     FROM debtor_files df
     LEFT JOIN clients c ON c.id = df.client_id
     LEFT JOIN debt_categories dc ON dc.id = df.debt_category_id
     LEFT JOIN debt_types dt ON dt.id = df.debt_type_id
     LEFT JOIN currencies cur ON cur.id = df.currency_id
     LEFT JOIN users u ON u.id = df.uploaded_by
     LEFT JOIN (
       SELECT file_id,
              COALESCE(SUM(loan_amount), 0) AS loan_total,
              COALESCE(SUM(total_paid), 0) AS collected_total,
              COALESCE(SUM(outstanding_balance), 0) AS outstanding_total
       FROM debtors WHERE deleted_at IS NULL GROUP BY file_id
     ) agg ON agg.file_id = df.id
     WHERE ${where.join(' AND ')}
     ORDER BY df.created_at DESC, df.id DESC`,
    params
  );
  return rows.map((row) => ({
    id: row.id,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
    fileName: row.file_name || null,
    debtCategoryId: row.debt_category_id || null,
    debtCategoryName: row.debt_category_name || null,
    debtTypeId: row.debt_type_id || null,
    debtTypeName: row.debt_type_name || null,
    currencyId: row.currency_id || null,
    currencyCode: row.currency_code || null,
    currencySymbol: row.currency_symbol || null,
    rowCount: row.row_count || 0,
    importedCount: row.imported_count || 0,
    skippedCount: row.skipped_count || 0,
    uploadedBy: row.uploaded_by || null,
    uploadedByName: row.uploaded_by_name || null,
    loanTotal: Number(row.loan_total) || 0,
    collectedTotal: Number(row.collected_total) || 0,
    outstandingTotal: Number(row.outstanding_total) || 0,
    createdAt: row.created_at,
  }));
}

// Aggregate portfolio totals across all non-deleted debtors (for stat cards).
async function getDebtorTotals(filters = {}) {
  const { where, params } = buildDebtorWhere(filters);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(d.loan_amount), 0) AS loan_amount,
            COALESCE(SUM(d.total_paid), 0) AS total_paid,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding
     ${COUNT_FROM} ${where}`,
    params
  );
  return {
    total: Number(row.total) || 0,
    loanAmount: Number(row.loan_amount) || 0,
    totalPaid: Number(row.total_paid) || 0,
    outstanding: Number(row.outstanding) || 0,
  };
}

// Activity history for a debtor — events recorded against entityType='debtor'.
async function getDebtorHistory(id, { user = null } = {}) {
  const debtor = await getDebtorById(id, { user });
  if (!debtor) return null;

  const [rows] = await pool.query(
    `SELECT al.*, u.name AS user_name
     FROM activity_log al
     LEFT JOIN users u ON u.id = al.user_id
     WHERE al.entity_type = 'debtor' AND al.entity_id = ?
     ORDER BY al.created_at DESC
     LIMIT 100`,
    [String(id)]
  );

  const history = rows.map((row) => ({
    id: row.id,
    userId: row.user_id || null,
    userName: row.user_name || null,
    actionType: row.action_type,
    title: row.title,
    subject: row.subject || null,
    amount: row.amount !== null ? Number(row.amount) : null,
    entityType: row.entity_type || null,
    entityId: row.entity_id || null,
    metadata: parseJson(row.metadata, null),
    createdAt: row.created_at,
  }));

  return { debtor, history };
}

async function closeDebtorCase(id, reason) {
  const debtor = await getDebtorById(id);
  if (!debtor) {
    const err = new Error('Debtor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  const closureReason = reason ? String(reason).trim().slice(0, 120) : null;
  await pool.query(
    'UPDATE debtors SET is_closed = 1, closure_reason = ?, closed_at = NOW() WHERE id = ? AND deleted_at IS NULL',
    [closureReason, id]
  );
  return getDebtorById(id);
}

async function reopenDebtorCase(id) {
  const debtor = await getDebtorById(id);
  if (!debtor) {
    const err = new Error('Debtor not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await pool.query(
    'UPDATE debtors SET is_closed = 0, closure_reason = NULL, closed_at = NULL WHERE id = ?',
    [id]
  );
  return getDebtorById(id);
}

module.exports = {
  listDebtors,
  listAllDebtors,
  listDebtorBuckets,
  listDebtorAgents,
  getDebtorTotals,
  getDebtorById,
  getDebtorByCfid,
  createDebtor,
  upsertDebtorByLoanId,
  getDebtorHistory,
  resolveClientIdByName,
  createDebtorFile,
  updateDebtorFileStats,
  resolveBatchFileName,
  findDebtorFileForClientDay,
  findOrCreateDebtorFileForClientDay,
  softDeleteDebtorFile,
  listDebtorFiles,
  closeDebtorCase,
  reopenDebtorCase,
  assertCallerCanAccessDebtor,
};
