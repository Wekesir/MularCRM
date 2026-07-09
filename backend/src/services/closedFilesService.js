const pool = require('../db/pool');

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

function normalizeClosedDebtor(row) {
  return {
    id: row.id,
    name: row.name,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    cfid: row.cfid,
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    phone: row.phone || null,
    assignedAgent: row.assigned_agent || null,
    loanAmount: toNumber(row.loan_amount),
    totalPaid: toNumber(row.total_paid),
    outstandingBalance: toNumber(row.outstanding_balance),
    closureReason: row.closure_reason || null,
    closedAt: row.closed_at || null,
    lastContactedAt: row.last_contacted_at || null,
  };
}

const SELECT = `
  SELECT d.id, d.name, d.client_id, d.cfid, d.file_id, d.phone, d.assigned_agent,
         d.loan_amount, d.total_paid, d.outstanding_balance,
         d.closure_reason, d.closed_at, d.last_contacted_at,
         c.name AS client_name, df.file_name AS file_name
  FROM debtors d
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN debtor_files df ON df.id = d.file_id
`;

function buildWhere(f = {}) {
  const params = [];
  const clauses = ['d.deleted_at IS NULL', 'd.is_closed = 1'];

  if (f.clientId != null && f.clientId !== '') {
    clauses.push('d.client_id = ?');
    params.push(Number(f.clientId));
  }
  if (f.fileId != null && f.fileId !== '') {
    clauses.push('d.file_id = ?');
    params.push(Number(f.fileId));
  }
  if (f.agent && String(f.agent).trim()) {
    clauses.push('d.assigned_agent = ?');
    params.push(String(f.agent).trim());
  }
  if (f.closureReason && String(f.closureReason).trim()) {
    clauses.push('d.closure_reason = ?');
    params.push(String(f.closureReason).trim());
  }
  if (f.closedFrom) {
    clauses.push('d.closed_at >= ?');
    params.push(String(f.closedFrom));
  }
  if (f.closedTo) {
    clauses.push('DATE(d.closed_at) <= ?');
    params.push(String(f.closedTo));
  }
  if (f.lastContactedFrom) {
    clauses.push('d.last_contacted_at >= ?');
    params.push(String(f.lastContactedFrom));
  }
  if (f.lastContactedTo) {
    clauses.push('DATE(d.last_contacted_at) <= ?');
    params.push(String(f.lastContactedTo));
  }
  if (f.search && String(f.search).trim()) {
    clauses.push(`(
      d.name LIKE ? OR d.phone LIKE ? OR d.cfid LIKE ? OR c.name LIKE ? OR d.assigned_agent LIKE ?
    )`);
    const q = `%${String(f.search).trim()}%`;
    params.push(q, q, q, q, q);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

async function listClosedDebtors(filters = {}) {
  const { page = 1, pageSize = 25 } = filters;
  const { where, params } = buildWhere(filters);

  const limit = Math.max(1, Math.min(Number(pageSize) || 25, 200));
  const offset = Math.max(0, (Number(page) - 1) * limit);

  const [[{ total }]] = await pool.query(
    `SELECT COUNT(*) AS total FROM debtors d LEFT JOIN clients c ON c.id = d.client_id ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${SELECT} ${where} ORDER BY d.closed_at DESC, d.id DESC LIMIT ? OFFSET ?`,
    [...params, limit, offset]
  );
  return {
    items: rows.map(normalizeClosedDebtor),
    total: Number(total) || 0,
    page: Math.max(1, Number(page) || 1),
    pageSize: limit,
    hasMore: offset + rows.length < Number(total),
  };
}

async function listClosedDebtorsForExport(filters = {}) {
  const { where, params } = buildWhere(filters);
  const [rows] = await pool.query(
    `${SELECT} ${where} ORDER BY d.closed_at DESC, d.id DESC`,
    params
  );
  return rows.map(normalizeClosedDebtor);
}

async function listClosureReasons() {
  const [rows] = await pool.query(
    `SELECT DISTINCT d.closure_reason AS reason
     FROM debtors d
     WHERE d.deleted_at IS NULL AND d.is_closed = 1 AND d.closure_reason IS NOT NULL AND d.closure_reason <> ''
     ORDER BY d.closure_reason ASC`
  );
  return rows.map((r) => r.reason).filter(Boolean);
}

async function getClosedDebtorTotals(filters = {}) {
  const { where, params } = buildWhere(filters);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS total,
            COALESCE(SUM(d.loan_amount), 0) AS loan_amount,
            COALESCE(SUM(d.total_paid), 0) AS total_paid,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding
     FROM debtors d LEFT JOIN clients c ON c.id = d.client_id ${where}`,
    params
  );
  return {
    total: Number(row.total) || 0,
    loanAmount: Number(row.loan_amount) || 0,
    totalPaid: Number(row.total_paid) || 0,
    outstanding: Number(row.outstanding) || 0,
  };
}

module.exports = {
  listClosedDebtors,
  listClosedDebtorsForExport,
  listClosureReasons,
  getClosedDebtorTotals,
};
