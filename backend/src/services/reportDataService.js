/**
 * Report data aggregations for the 12 sidebar /reports/* pages.
 */
const pool = require('../db/pool');
const {
  AGENT_ROLE_NAMES,
  isAgentRole,
  isSupervisorRole,
  resolveCallCenterScope,
} = require('../config/orgRoles');

const REPORT_SLUGS = new Set([
  'debtor-summary',
  'payment-performance',
  'collector-performance',
  'portfolio-performance',
  'promise-to-pay',
  'aging-report',
  'dispute-management',
  'recovery-rate',
  'goip-calls-report',
  'sms-report',
  'debtor-notes',
  'contact-attempt',
]);

const DISPUTE_STATUS_CODES = ['NIP', 'WN', 'N-C', 'NCP', 'DISPUTE'];
const BUCKET_ORDER = ['Current', '1-30', '31-60', '61-90', '91-180', '180+'];
const ROW_CAP = 500;

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

function defaultDateRange(filters = {}) {
  const dateTo = toDate(filters.dateTo) || new Date().toISOString().slice(0, 10);
  let dateFrom = toDate(filters.dateFrom);
  if (!dateFrom) {
    const d = new Date(`${dateTo}T12:00:00`);
    d.setDate(d.getDate() - 29);
    dateFrom = d.toISOString().slice(0, 10);
  }
  return { dateFrom, dateTo };
}

function pct(numerator, denominator) {
  if (!denominator) return 0;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function summarize(items) {
  return items.map((item) => ({
    key: item.key,
    label: item.label,
    value: item.value,
    format: item.format || 'number',
  }));
}

function seriesBar(id, title, labels, data, datasetLabel = 'Value') {
  return {
    id,
    type: 'bar',
    title,
    labels,
    datasets: [{ label: datasetLabel, data }],
  };
}

function seriesLine(id, title, labels, data, datasetLabel = 'Value') {
  return {
    id,
    type: 'line',
    title,
    labels,
    datasets: [{ label: datasetLabel, data }],
  };
}

function seriesDoughnut(id, title, labels, data) {
  return {
    id,
    type: 'doughnut',
    title,
    labels,
    datasets: [{ label: title, data }],
  };
}

function wrapResult(slug, filters, { summary, series, columns, rows, total, page, pageSize, hasMore }) {
  const result = {
    meta: {
      slug,
      generatedAt: new Date().toISOString(),
      filters,
    },
    summary: summarize(summary || []),
    series: series || [],
    columns: columns || [],
    rows: rows || [],
    total: total != null ? total : (rows || []).length,
  };
  if (page != null) result.page = page;
  if (pageSize != null) result.pageSize = pageSize;
  if (hasMore != null) result.hasMore = hasMore;
  return result;
}

function parsePageParams(filters = {}, { defaultSize = 50, maxSize = 100 } = {}) {
  let page = Number(filters.page);
  if (!Number.isFinite(page) || page < 1) page = 1;
  let pageSize = Number(filters.pageSize);
  if (!Number.isFinite(pageSize) || pageSize < 1) pageSize = defaultSize;
  pageSize = Math.min(maxSize, Math.floor(pageSize));
  page = Math.floor(page);
  const offset = (page - 1) * pageSize;
  return { page, pageSize, offset };
}

/**
 * Debtor-list style filters layered on top of report scope.
 * @param {object} options
 * @param {'open'|'any'} [options.defaultCaseClosed='open']
 * @param {boolean} [options.includeSearch=true]
 */
function applyDebtorReportFilters(where, params, filters = {}, options = {}) {
  const { defaultCaseClosed = 'open', includeSearch = true } = options;

  if (filters.fileId != null && filters.fileId !== '') {
    where.push('d.file_id = ?');
    params.push(Number(filters.fileId));
  }
  if (filters.bucket && String(filters.bucket).trim()) {
    where.push('d.bucket = ?');
    params.push(String(filters.bucket).trim());
  }
  if (filters.contactStatusId != null && filters.contactStatusId !== '') {
    where.push('d.contact_status_id = ?');
    params.push(Number(filters.contactStatusId));
  }
  if (filters.assignmentStatus === 'assigned') {
    where.push('d.assigned_agent IS NOT NULL AND d.assigned_agent <> ""');
  } else if (filters.assignmentStatus === 'unassigned') {
    where.push('(d.assigned_agent IS NULL OR d.assigned_agent = "")');
  }

  const caseClosed =
    filters.caseClosed != null && filters.caseClosed !== ''
      ? filters.caseClosed
      : defaultCaseClosed === 'any'
        ? 'any'
        : '';

  if (caseClosed === '1' || caseClosed === true || caseClosed === 1) {
    where.push('d.is_closed = 1');
  } else if (caseClosed === 'any') {
    // include open + closed
  } else {
    where.push('(d.is_closed = 0 OR d.is_closed IS NULL)');
  }
  if (filters.discounted === '1' || filters.discounted === true || filters.discounted === 1) {
    where.push('d.waived_amount > 0');
  }
  if (filters.ptp === '1' || filters.ptp === true || filters.ptp === 1) {
    where.push('d.contact_status_id IN (SELECT id FROM contact_statuses WHERE code = ?)');
    params.push('PTP');
  } else if (filters.ptp === '0' || filters.ptp === false || filters.ptp === 0) {
    where.push(
      '(d.contact_status_id IS NULL OR d.contact_status_id NOT IN (SELECT id FROM contact_statuses WHERE code = ?))'
    );
    params.push('PTP');
  }
  if (filters.dpdMin != null && filters.dpdMin !== '') {
    where.push('d.overdue_days >= ?');
    params.push(Number(filters.dpdMin));
  }
  if (filters.dpdMax != null && filters.dpdMax !== '') {
    where.push('d.overdue_days <= ?');
    params.push(Number(filters.dpdMax));
  }
  if (filters.balanceMin != null && filters.balanceMin !== '') {
    where.push('d.outstanding_balance >= ?');
    params.push(Number(filters.balanceMin));
  }
  if (filters.balanceMax != null && filters.balanceMax !== '') {
    where.push('d.outstanding_balance <= ?');
    params.push(Number(filters.balanceMax));
  }
  if (filters.lastContactedFrom) {
    where.push('d.last_contacted_at >= ?');
    params.push(String(filters.lastContactedFrom));
  }
  if (filters.lastContactedTo) {
    where.push('d.last_contacted_at <= ?');
    params.push(String(filters.lastContactedTo));
  }
  if (filters.nextActionFrom) {
    where.push('d.next_action_date >= ?');
    params.push(String(filters.nextActionFrom));
  }
  if (filters.nextActionTo) {
    where.push('d.next_action_date <= ?');
    params.push(String(filters.nextActionTo));
  }
  if (includeSearch) {
    const search = String(filters.search || '').trim();
    if (search) {
      where.push(
        '(d.name LIKE ? OR d.account_number LIKE ? OR d.phone LIKE ? OR c.name LIKE ? OR d.loan_id LIKE ? OR d.id_number LIKE ?)'
      );
      const like = `%${search}%`;
      params.push(like, like, like, like, like, like);
    }
  }
}

function applyAmountRange(where, params, filters, column) {
  if (filters.amountMin != null && filters.amountMin !== '') {
    where.push(`${column} >= ?`);
    params.push(Number(filters.amountMin));
  }
  if (filters.amountMax != null && filters.amountMax !== '') {
    where.push(`${column} <= ?`);
    params.push(Number(filters.amountMax));
  }
}

/* ── Short TTL cache for report KPI totals ── */
const KPI_CACHE_TTL_MS = 45_000;
const kpiCache = new Map();

const KPI_FILTER_KEYS = [
  'dateFrom', 'dateTo', 'clientId', 'agentId', 'callCenterId', 'fileId', 'bucket',
  'contactStatusId', 'assignmentStatus', 'caseClosed', 'discounted', 'ptp',
  'dpdMin', 'dpdMax', 'balanceMin', 'balanceMax', 'amountMin', 'amountMax',
  'lastContactedFrom', 'lastContactedTo', 'nextActionFrom', 'nextActionTo',
  'search', 'status', 'channel', 'direction', 'source', 'category', 'provider',
  'disputeCode', 'confirmed', 'hasRecording', 'hasNotes', 'remindersDue',
];

function kpiCacheKey(slug, viewer, filters) {
  const scopeBits = [
    viewer?.id ?? '',
    viewer?.roleName ?? viewer?.role ?? '',
    viewer?.callCenterId ?? '',
    viewer?.isSystemAdmin ? '1' : '0',
  ];
  const filterBits = KPI_FILTER_KEYS.map((k) => `${k}=${filters[k] ?? ''}`);
  return `${slug}|${scopeBits.join(':')}|${filterBits.join('|')}`;
}

function getCachedKpi(key) {
  const hit = kpiCache.get(key);
  if (!hit) return null;
  if (Date.now() > hit.expiresAt) {
    kpiCache.delete(key);
    return null;
  }
  return hit.value;
}

function setCachedKpi(key, value) {
  kpiCache.set(key, { value, expiresAt: Date.now() + KPI_CACHE_TTL_MS });
  if (kpiCache.size > 200) {
    const oldest = kpiCache.keys().next().value;
    kpiCache.delete(oldest);
  }
}

const DEBTOR_SUMMARY_COLUMNS = [
  { key: 'name', label: 'Debtor' },
  { key: 'clientName', label: 'Client' },
  { key: 'accountNumber', label: 'Account' },
  { key: 'agent', label: 'Agent' },
  { key: 'bucket', label: 'Bucket' },
  { key: 'overdueDays', label: 'DPD', format: 'number' },
  { key: 'loanAmount', label: 'Loan', format: 'money' },
  { key: 'collected', label: 'Paid', format: 'money' },
  { key: 'outstanding', label: 'Outstanding', format: 'money' },
  { key: 'contactStatus', label: 'Status' },
];

const EXPORT_ROW_CAP = 100_000;
const EXPORT_CHUNK = 1000;

function mapDebtorSummaryRow(r) {
  return {
    id: r.id,
    name: r.name,
    clientName: r.client_name || '—',
    accountNumber: r.account_number || '—',
    agent: r.assigned_agent || '—',
    bucket: r.bucket || '—',
    overdueDays: toNumber(r.overdue_days),
    loanAmount: toNumber(r.loan_amount),
    collected: toNumber(r.total_paid),
    outstanding: toNumber(r.outstanding_balance),
    contactStatus: r.contact_status || '—',
  };
}

function buildDebtorSummaryWhere(filters, viewer) {
  const { clauses, params } = buildScope({ viewer, filters });
  const where = [`${'d'}.deleted_at IS NULL`, ...clauses];
  applyDebtorReportFilters(where, params, filters);
  return { whereSql: `WHERE ${where.join(' AND ')}`, params };
}

/**
 * Report viewers / executives / auditors see company-wide data.
 * Supervisors stay center-scoped; agents see only their own rows.
 */
function resolveReportScope(viewer, filters = {}) {
  if (!viewer) return { mode: 'none', callCenterId: null };
  if (isAgentRole(viewer) && !viewer.isSystemAdmin) {
    return { mode: 'agent', callCenterId: null };
  }
  if (isSupervisorRole(viewer) && !viewer.isSystemAdmin) {
    return resolveCallCenterScope(viewer, { callCenterId: filters.callCenterId });
  }
  const id =
    filters.callCenterId != null && filters.callCenterId !== ''
      ? Number(filters.callCenterId)
      : null;
  return {
    mode: 'company',
    callCenterId: Number.isFinite(id) ? id : null,
  };
}

/**
 * Build shared scope clauses for debtor/client-centric queries.
 */
function buildScope({
  viewer,
  filters = {},
  aliasD = 'd',
  aliasC = 'c',
  agentNameColumn = `${aliasD}.assigned_agent`,
  agentIdColumn = null,
}) {
  const clauses = [];
  const params = [];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    // Force self-scope: ignore any client-supplied agentId.
    if (agentIdColumn) {
      clauses.push(`${agentIdColumn} = ?`);
      params.push(Number(viewer.id));
    } else {
      // Cases are assigned by collector display name.
      clauses.push(`${agentNameColumn} = ?`);
      params.push(String(viewer.name || ''));
    }
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) {
      clauses.push('1=0');
    } else {
      clauses.push(`${aliasC}.call_center_id = ?`);
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push(`${aliasC}.call_center_id = ?`);
    params.push(scope.callCenterId);
  }

  if (scope.mode !== 'agent' && filters.agentId) {
    if (agentIdColumn) {
      clauses.push(`${agentIdColumn} = ?`);
      params.push(Number(filters.agentId));
    } else {
      clauses.push(
        `${agentNameColumn} = (SELECT name FROM users WHERE id = ? LIMIT 1)`
      );
      params.push(Number(filters.agentId));
    }
  }

  if (filters.clientId) {
    clauses.push(`${aliasD}.client_id = ?`);
    params.push(Number(filters.clientId));
  }

  return { clauses, params, scope };
}

function applyUserCenterScope(clauses, params, viewer, filters, userAlias = 'u') {
  const scope = resolveReportScope(viewer, filters);
  if (scope.mode === 'agent') {
    clauses.push(`${userAlias}.id = ?`);
    params.push(Number(viewer.id));
    return scope;
  }
  if (scope.mode === 'none') {
    clauses.push('1=0');
    return scope;
  }
  if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push(`${userAlias}.call_center_id = ?`);
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push(`${userAlias}.call_center_id = ?`);
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push(`${userAlias}.id = ?`);
    params.push(Number(filters.agentId));
  }
  return scope;
}

async function getAgentNameById(agentId) {
  if (!agentId) return null;
  const [rows] = await pool.query('SELECT name FROM users WHERE id = ? LIMIT 1', [
    Number(agentId),
  ]);
  return rows[0]?.name || null;
}

/* ─── 1. Debtor Summary ─────────────────────────────────────────── */

async function fetchDebtorSummaryTotals(whereSql, params) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS debtors,
       COALESCE(SUM(d.loan_amount), 0) AS loan_total,
       COALESCE(SUM(d.total_paid), 0) AS collected,
       COALESCE(SUM(d.outstanding_balance), 0) AS outstanding
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}`,
    params
  );
  return totals;
}

async function debtorSummary(filters, viewer) {
  const { whereSql, params } = buildDebtorSummaryWhere(filters, viewer);
  const { page, pageSize, offset } = parsePageParams(filters);

  const cacheKey = kpiCacheKey('debtor-summary', viewer, filters);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    totals = await fetchDebtorSummaryTotals(whereSql, params);
    setCachedKpi(cacheKey, totals);
  }

  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.account_number, d.phone, d.assigned_agent,
            d.loan_amount, d.total_paid, d.outstanding_balance, d.overdue_days,
            d.bucket, d.last_contacted_at, d.is_closed,
            c.name AS client_name, cs.name AS contact_status
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     ${whereSql}
     ORDER BY d.outstanding_balance DESC, d.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const loanTotal = toNumber(totals.loan_total);
  const collected = toNumber(totals.collected);
  const total = toNumber(totals.debtors);

  return wrapResult('debtor-summary', filters, {
    summary: [
      { key: 'debtors', label: 'Debtors', value: total },
      { key: 'loanTotal', label: 'Loan total', value: loanTotal, format: 'money' },
      { key: 'collected', label: 'Collected', value: collected, format: 'money' },
      { key: 'outstanding', label: 'Outstanding', value: toNumber(totals.outstanding), format: 'money' },
      { key: 'recovery', label: 'Recovery %', value: pct(collected, loanTotal), format: 'percent' },
    ],
    series: [],
    columns: DEBTOR_SUMMARY_COLUMNS,
    rows: rows.map(mapDebtorSummaryRow),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

function escapeCsvCell(value) {
  return `"${String(value ?? '').replaceAll('"', '""')}"`;
}

/**
 * Stream Debtor Summary CSV via keyset chunks (avoids deep OFFSET).
 */
async function exportDebtorSummary(filters, viewer, res) {
  const { whereSql, params } = buildDebtorSummaryWhere(filters, viewer);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}`,
    params
  );
  const total = toNumber(countRow?.cnt);
  if (total > EXPORT_ROW_CAP) {
    const err = new Error(
      `Export exceeds ${EXPORT_ROW_CAP.toLocaleString()} rows (${total.toLocaleString()} matched). Narrow your filters and try again.`
    );
    err.status = 400;
    throw err;
  }

  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="debtor-summary-${stamp}.csv"`);

  const header = DEBTOR_SUMMARY_COLUMNS.map((c) => escapeCsvCell(c.label)).join(',');
  res.write(`${header}\n`);

  let lastId = null;
  let lastBalance = null;
  let exported = 0;

  while (exported < total) {
    const chunkParams = [...params];
    let keysetSql = '';
    if (lastId != null) {
      keysetSql =
        ' AND (d.outstanding_balance < ? OR (d.outstanding_balance = ? AND d.id < ?))';
      chunkParams.push(lastBalance, lastBalance, lastId);
    }
    chunkParams.push(EXPORT_CHUNK);

    const [chunk] = await pool.query(
      `SELECT d.id, d.name, d.account_number, d.phone, d.assigned_agent,
              d.loan_amount, d.total_paid, d.outstanding_balance, d.overdue_days,
              d.bucket, d.last_contacted_at, d.is_closed,
              c.name AS client_name, cs.name AS contact_status
       FROM debtors d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
       ${whereSql}${keysetSql}
       ORDER BY d.outstanding_balance DESC, d.id DESC
       LIMIT ?`,
      chunkParams
    );

    if (!chunk.length) break;

    for (const r of chunk) {
      const row = mapDebtorSummaryRow(r);
      const line = DEBTOR_SUMMARY_COLUMNS.map((col) => escapeCsvCell(row[col.key])).join(',');
      res.write(`${line}\n`);
    }

    const last = chunk[chunk.length - 1];
    lastId = last.id;
    lastBalance = toNumber(last.outstanding_balance);
    exported += chunk.length;
    if (chunk.length < EXPORT_CHUNK) break;
  }

  res.end();
}

/**
 * Stream any report as CSV by paging through its handler (KPI cache hits after page 1).
 */
async function exportReport(slug, filters, viewer, res) {
  if (!REPORT_SLUGS.has(slug)) {
    const err = new Error('Unknown report');
    err.status = 404;
    throw err;
  }
  if (slug === 'debtor-summary') {
    return exportDebtorSummary(filters, viewer, res);
  }

  const handler = HANDLERS[slug];
  const first = await handler({ ...filters, page: 1, pageSize: 1 }, viewer);
  const total = toNumber(first.total);
  if (total > EXPORT_ROW_CAP) {
    const err = new Error(
      `Export exceeds ${EXPORT_ROW_CAP.toLocaleString()} rows (${total.toLocaleString()} matched). Narrow your filters and try again.`
    );
    err.status = 400;
    throw err;
  }

  const columns = first.columns || [];
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${slug}-${stamp}.csv"`);
  res.write(`${columns.map((c) => escapeCsvCell(c.label)).join(',')}\n`);

  let page = 1;
  let exported = 0;
  while (exported < total) {
    const data = await handler({ ...filters, page, pageSize: EXPORT_CHUNK }, viewer);
    const rows = data.rows || [];
    if (!rows.length) break;
    for (const row of rows) {
      res.write(`${columns.map((col) => escapeCsvCell(row[col.key])).join(',')}\n`);
    }
    exported += rows.length;
    if (!data.hasMore || rows.length < EXPORT_CHUNK) break;
    page += 1;
  }
  res.end();
}

/* ─── 2. Payment Performance ────────────────────────────────────── */

async function paymentPerformance(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['DATE(p.payment_date) >= ?', 'DATE(p.payment_date) <= ?'];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (filters.confirmed === '0' || filters.confirmed === 0) {
    clauses.push('p.confirmed = 0');
  } else if (filters.confirmed === 'any') {
    // both
  } else {
    clauses.push('p.confirmed = 1');
  }

  if (scope.mode === 'agent') {
    clauses.push('(p.agent_user_id = ? OR p.agent_name = ?)');
    params.push(Number(viewer.id), String(viewer.name || ''));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('c.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('c.call_center_id = ?');
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push(
      '(p.agent_user_id = ? OR p.agent_name = (SELECT name FROM users WHERE id = ? LIMIT 1))'
    );
    params.push(Number(filters.agentId), Number(filters.agentId));
  }
  if (filters.clientId) {
    clauses.push('p.client_id = ?');
    params.push(Number(filters.clientId));
  }
  if (filters.source && String(filters.source).trim()) {
    clauses.push('p.source = ?');
    params.push(String(filters.source).trim());
  }
  if (filters.status === 'reversal') {
    clauses.push('p.amount < 0');
  } else if (filters.status === 'collection') {
    clauses.push('p.amount > 0');
  }
  applyAmountRange(clauses, params, filters, 'p.amount');
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR p.agent_name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM payments p
    LEFT JOIN debtors d ON d.id = p.debtor_id
    LEFT JOIN clients c ON c.id = COALESCE(p.client_id, d.client_id)
  `;

  const cacheKey = kpiCacheKey('payment-performance', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS payment_count,
         COALESCE(SUM(CASE WHEN p.amount > 0 THEN p.amount ELSE 0 END), 0) AS collected,
         COALESCE(SUM(CASE WHEN p.amount < 0 THEN p.amount ELSE 0 END), 0) AS reversals,
         COALESCE(AVG(CASE WHEN p.amount > 0 THEN p.amount END), 0) AS avg_payment
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.payment_date, p.amount, p.source, p.confirmed, p.agent_name,
            d.name AS debtor_name, c.name AS client_name
     ${fromSql} ${whereSql}
     ORDER BY p.payment_date DESC, p.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const collected = toNumber(totals.collected);
  const reversals = Math.abs(toNumber(totals.reversals));
  const total = toNumber(totals.payment_count);

  return wrapResult('payment-performance', applied, {
    summary: [
      { key: 'collected', label: 'Collected', value: collected, format: 'money' },
      { key: 'payments', label: 'Payments', value: total },
      { key: 'avgPayment', label: 'Avg payment', value: toNumber(totals.avg_payment), format: 'money' },
      { key: 'reversals', label: 'Reversals', value: reversals, format: 'money' },
    ],
    series: [],
    columns: [
      { key: 'paymentDate', label: 'Date' },
      { key: 'debtorName', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agent', label: 'Agent' },
      { key: 'amount', label: 'Amount', format: 'money' },
      { key: 'source', label: 'Source' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      paymentDate: r.payment_date ? String(r.payment_date).slice(0, 10) : '—',
      debtorName: r.debtor_name || '—',
      clientName: r.client_name || '—',
      agent: r.agent_name || '—',
      amount: toNumber(r.amount),
      source: r.source || '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 3. Collector Performance ──────────────────────────────────── */

async function collectorPerformance(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['u.deleted_at IS NULL', 'r.name IN (?)'];
  const params = [AGENT_ROLE_NAMES];
  applyUserCenterScope(clauses, params, viewer, filters, 'u');

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(u.name LIKE ? OR u.email LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
     ${whereSql}`,
    params
  );
  const total = toNumber(countRow.cnt);

  const [rows] = await pool.query(
    `SELECT u.id, u.name, cc.name AS call_center_name,
            (SELECT COUNT(*) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL
                AND (d.is_closed = 0 OR d.is_closed IS NULL)) AS cases,
            (SELECT COUNT(DISTINCT d.file_id) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS files,
            (SELECT COALESCE(SUM(d.total_paid), 0) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS collected,
            (SELECT COALESCE(SUM(d.outstanding_balance), 0) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL
                AND (d.is_closed = 0 OR d.is_closed IS NULL)) AS outstanding,
            (SELECT COALESCE(SUM(d.loan_amount), 0) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS loan_total,
            (SELECT COUNT(*) FROM ptp_arrangements p
              WHERE p.agent_id = u.id
                AND DATE(p.created_at) BETWEEN ? AND ?) AS ptp_count,
            (SELECT COUNT(*) FROM voice_calls vc
              WHERE vc.agent_id = u.id
                AND DATE(COALESCE(vc.started_at, vc.created_at)) BETWEEN ? AND ?) AS calls,
            (SELECT COUNT(*) FROM sms_audit sa
              WHERE sa.user_id = u.id AND sa.status = 'sent'
                AND DATE(sa.created_at) BETWEEN ? AND ?) AS sms,
            (SELECT COUNT(*) FROM contact_attempts ca
              WHERE ca.agent_id = u.id AND ca.channel = 'email'
                AND DATE(ca.created_at) BETWEEN ? AND ?) AS emails
     FROM users u
     JOIN roles r ON r.id = u.role_id
     LEFT JOIN call_centers cc ON cc.id = u.call_center_id AND cc.deleted_at IS NULL
     ${whereSql}
     ORDER BY collected DESC, cases DESC, u.name ASC
     LIMIT ? OFFSET ?`,
    [
      dateFrom, dateTo,
      dateFrom, dateTo,
      dateFrom, dateTo,
      dateFrom, dateTo,
      ...params,
      pageSize,
      offset,
    ]
  );

  const mapped = rows.map((r, index) => {
    const collected = toNumber(r.collected);
    const loanTotal = toNumber(r.loan_total);
    return {
      id: r.id,
      rank: offset + index + 1,
      agent: r.name,
      callCenter: r.call_center_name || '—',
      cases: toNumber(r.cases),
      files: toNumber(r.files),
      collected,
      outstanding: toNumber(r.outstanding),
      recovery: pct(collected, loanTotal),
      ptpCount: toNumber(r.ptp_count),
      calls: toNumber(r.calls),
      sms: toNumber(r.sms),
      emails: toNumber(r.emails),
    };
  });

  const cacheKey = kpiCacheKey('collector-performance', viewer, applied);
  let kpi = getCachedKpi(cacheKey);
  if (!kpi) {
    const [allForKpi] = await pool.query(
      `SELECT u.id, u.name,
              (SELECT COALESCE(SUM(d.total_paid), 0) FROM debtors d
                WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS collected,
              (SELECT COALESCE(SUM(d.loan_amount), 0) FROM debtors d
                WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS loan_total,
              (SELECT COUNT(*) FROM ptp_arrangements p
                WHERE p.agent_id = u.id AND DATE(p.created_at) BETWEEN ? AND ?) AS ptp_count
       FROM users u
       JOIN roles r ON r.id = u.role_id
       ${whereSql}`,
      [dateFrom, dateTo, ...params]
    );
    const totalCollected = allForKpi.reduce((s, r) => s + toNumber(r.collected), 0);
    const totalPtp = allForKpi.reduce((s, r) => s + toNumber(r.ptp_count), 0);
    const recoveries = allForKpi.map((r) => pct(toNumber(r.collected), toNumber(r.loan_total)));
    const avgRecovery =
      recoveries.length > 0
        ? Math.round((recoveries.reduce((s, v) => s + v, 0) / recoveries.length) * 100) / 100
        : 0;
    kpi = { agents: total, totalCollected, totalPtp, avgRecovery };
    setCachedKpi(cacheKey, kpi);
  }

  return wrapResult('collector-performance', applied, {
    summary: [
      { key: 'agents', label: 'Collectors', value: kpi.agents },
      { key: 'collected', label: 'Collected', value: kpi.totalCollected, format: 'money' },
      { key: 'avgRecovery', label: 'Avg recovery %', value: kpi.avgRecovery, format: 'percent' },
      { key: 'ptp', label: 'PTPs (period)', value: kpi.totalPtp },
    ],
    series: [],
    columns: [
      { key: 'rank', label: 'Rank' },
      { key: 'agent', label: 'Agent' },
      { key: 'callCenter', label: 'Call center' },
      { key: 'cases', label: 'Cases', format: 'number' },
      { key: 'files', label: 'Files', format: 'number' },
      { key: 'collected', label: 'Collected', format: 'money' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
      { key: 'recovery', label: 'Recovery %', format: 'percent' },
      { key: 'ptpCount', label: 'PTP', format: 'number' },
      { key: 'calls', label: 'Calls', format: 'number' },
      { key: 'sms', label: 'SMS', format: 'number' },
      { key: 'emails', label: 'Emails', format: 'number' },
    ],
    rows: mapped,
    total,
    page,
    pageSize,
    hasMore: offset + mapped.length < total,
  });
}

/* ─── 4. Portfolio Performance ──────────────────────────────────── */

async function portfolioPerformance(filters, viewer) {
  const { page, pageSize, offset } = parsePageParams(filters);
  const { clauses, params } = buildScope({ viewer, filters });
  const where = ['d.deleted_at IS NULL', ...clauses];
  applyDebtorReportFilters(where, params, filters, {
    defaultCaseClosed: 'any',
    includeSearch: false,
  });
  const search = String(filters.search || '').trim();
  if (search) {
    where.push('(c.name LIKE ? OR df.file_name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(DISTINCT c.id) AS cnt
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN debtor_files df ON df.id = d.file_id
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     ${whereSql}`,
    params
  );
  const total = toNumber(countRow.cnt);

  const cacheKey = kpiCacheKey('portfolio-performance', viewer, filters);
  let kpi = getCachedKpi(cacheKey);
  if (!kpi) {
    const [[agg]] = await pool.query(
      `SELECT
         COUNT(DISTINCT c.id) AS clients,
         COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
         COALESCE(SUM(d.total_paid), 0) AS collected,
         COALESCE(SUM(d.loan_amount), 0) AS loan_total,
         SUM(CASE WHEN d.assigned_agent IS NULL OR d.assigned_agent = '' THEN 1 ELSE 0 END) AS unassigned
       FROM debtors d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN debtor_files df ON df.id = d.file_id
       LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
       ${whereSql}`,
      params
    );
    kpi = {
      clients: toNumber(agg.clients),
      outstanding: toNumber(agg.outstanding),
      collected: toNumber(agg.collected),
      loanTotal: toNumber(agg.loan_total),
      unassigned: toNumber(agg.unassigned),
    };
    setCachedKpi(cacheKey, kpi);
  }

  const [rows] = await pool.query(
    `SELECT c.id, c.name AS client_name,
            COUNT(*) AS cases,
            SUM(CASE WHEN d.assigned_agent IS NOT NULL AND d.assigned_agent <> '' THEN 1 ELSE 0 END) AS assigned,
            SUM(CASE WHEN d.assigned_agent IS NULL OR d.assigned_agent = '' THEN 1 ELSE 0 END) AS unassigned,
            COALESCE(SUM(d.loan_amount), 0) AS loan_total,
            COALESCE(SUM(d.total_paid), 0) AS collected,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
            SUM(CASE WHEN cs.code = 'PTP' THEN 1 ELSE 0 END) AS ptp_count,
            SUM(CASE WHEN d.is_closed = 1 THEN 1 ELSE 0 END) AS closed
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN debtor_files df ON df.id = d.file_id
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     ${whereSql}
     GROUP BY c.id, c.name
     ORDER BY outstanding DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const mapped = rows.map((r) => {
    const loanTotal = toNumber(r.loan_total);
    const collected = toNumber(r.collected);
    return {
      id: r.id,
      client: r.client_name || 'Unassigned client',
      cases: toNumber(r.cases),
      assigned: toNumber(r.assigned),
      unassigned: toNumber(r.unassigned),
      loanTotal,
      collected,
      outstanding: toNumber(r.outstanding),
      recovery: pct(collected, loanTotal),
      ptpCount: toNumber(r.ptp_count),
      closed: toNumber(r.closed),
    };
  });

  return wrapResult('portfolio-performance', filters, {
    summary: [
      { key: 'clients', label: 'Clients', value: kpi.clients },
      { key: 'outstanding', label: 'Outstanding', value: kpi.outstanding, format: 'money' },
      { key: 'recovery', label: 'Recovery %', value: pct(kpi.collected, kpi.loanTotal), format: 'percent' },
      { key: 'unassigned', label: 'Unassigned cases', value: kpi.unassigned },
    ],
    series: [],
    columns: [
      { key: 'client', label: 'Client' },
      { key: 'cases', label: 'Cases', format: 'number' },
      { key: 'assigned', label: 'Assigned', format: 'number' },
      { key: 'unassigned', label: 'Unassigned', format: 'number' },
      { key: 'loanTotal', label: 'Loan', format: 'money' },
      { key: 'collected', label: 'Collected', format: 'money' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
      { key: 'recovery', label: 'Recovery %', format: 'percent' },
      { key: 'ptpCount', label: 'PTP', format: 'number' },
      { key: 'closed', label: 'Closed', format: 'number' },
    ],
    rows: mapped,
    total,
    page,
    pageSize,
    hasMore: offset + mapped.length < total,
  });
}

/* ─── 5. Promise To Pay ─────────────────────────────────────────── */

async function promiseToPay(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['DATE(p.created_at) >= ?', 'DATE(p.created_at) <= ?'];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    clauses.push('p.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('c.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('c.call_center_id = ?');
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push('p.agent_id = ?');
    params.push(Number(filters.agentId));
  }
  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }
  if (filters.status && String(filters.status).trim()) {
    clauses.push('p.status = ?');
    params.push(String(filters.status).trim());
  }
  if (filters.channel && String(filters.channel).trim()) {
    clauses.push('p.channel = ?');
    params.push(String(filters.channel).trim());
  }
  if (filters.remindersDue === '1' || filters.remindersDue === 1) {
    clauses.push("p.status = 'pending' AND p.reminder_date IS NOT NULL AND p.reminder_date <= CURDATE()");
  }
  applyAmountRange(clauses, params, filters, 'p.promised_amount');
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR u.name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM ptp_arrangements p
    INNER JOIN debtors d ON d.id = p.debtor_id
    LEFT JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = p.agent_id
  `;

  const cacheKey = kpiCacheKey('promise-to-pay', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         COALESCE(SUM(p.promised_amount), 0) AS promised,
         SUM(p.status = 'pending') AS pending_count,
         SUM(p.status = 'kept') AS kept_count,
         SUM(p.status = 'broken') AS broken_count,
         SUM(p.status = 'cancelled') AS cancelled_count,
         SUM(p.status = 'pending' AND p.reminder_date IS NOT NULL AND p.reminder_date <= CURDATE()) AS reminders_due
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const [rows] = await pool.query(
    `SELECT p.id, p.promised_amount, p.promise_date, p.reminder_date, p.status, p.channel, p.notes, p.created_at,
            d.name AS debtor_name, c.name AS client_name, u.name AS agent_name
     ${fromSql} ${whereSql}
     ORDER BY p.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  const kept = toNumber(totals.kept_count);
  const broken = toNumber(totals.broken_count);
  const total = toNumber(totals.total);

  return wrapResult('promise-to-pay', applied, {
    summary: [
      { key: 'total', label: 'Arrangements', value: total },
      { key: 'promised', label: 'Promised', value: toNumber(totals.promised), format: 'money' },
      { key: 'pending', label: 'Pending', value: toNumber(totals.pending_count) },
      { key: 'keepRate', label: 'Keep rate', value: pct(kept, kept + broken), format: 'percent' },
      { key: 'remindersDue', label: 'Reminders due', value: toNumber(totals.reminders_due) },
    ],
    series: [],
    columns: [
      { key: 'debtorName', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentName', label: 'Agent' },
      { key: 'promisedAmount', label: 'Promised', format: 'money' },
      { key: 'promiseDate', label: 'Promise date' },
      { key: 'reminderDate', label: 'Reminder' },
      { key: 'status', label: 'Status' },
      { key: 'channel', label: 'Channel' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      debtorName: r.debtor_name || '—',
      clientName: r.client_name || '—',
      agentName: r.agent_name || '—',
      promisedAmount: toNumber(r.promised_amount),
      promiseDate: r.promise_date ? String(r.promise_date).slice(0, 10) : '—',
      reminderDate: r.reminder_date ? String(r.reminder_date).slice(0, 10) : '—',
      status: r.status || '—',
      channel: r.channel || '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 6. Aging Report ───────────────────────────────────────────── */

async function agingReport(filters, viewer) {
  const { page, pageSize, offset } = parsePageParams(filters);
  const detailView =
    filters.detail === 'debtors' ||
    filters.detail === '1' ||
    filters.view === 'debtors';

  const { clauses, params } = buildScope({ viewer, filters });
  const where = ['d.deleted_at IS NULL', ...clauses];
  applyDebtorReportFilters(where, params, filters, { defaultCaseClosed: 'open' });
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [bucketRows] = await pool.query(
    `SELECT COALESCE(d.bucket, 'Current') AS bucket,
            COUNT(*) AS debtors,
            COALESCE(SUM(d.loan_amount), 0) AS loan_total,
            COALESCE(SUM(d.total_paid), 0) AS collected,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
            COALESCE(AVG(d.overdue_days), 0) AS avg_dpd
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}
     GROUP BY COALESCE(d.bucket, 'Current')`,
    params
  );
  const bucketMap = new Map(bucketRows.map((r) => [r.bucket, r]));
  const labels = BUCKET_ORDER.filter((b) => bucketMap.has(b)).concat(
    [...bucketMap.keys()].filter((b) => !BUCKET_ORDER.includes(b))
  );
  const totalOutstanding = labels.reduce(
    (s, b) => s + toNumber(bucketMap.get(b)?.outstanding),
    0
  );
  const overdue90 = ['91-180', '180+'].reduce(
    (s, b) => s + toNumber(bucketMap.get(b)?.outstanding),
    0
  );
  const currentOut = toNumber(bucketMap.get('Current')?.outstanding);
  const totalDebtors = labels.reduce((s, b) => s + toNumber(bucketMap.get(b)?.debtors), 0);
  const weightedDpd =
    totalOutstanding > 0
      ? Math.round(
          labels.reduce((s, b) => {
            const row = bucketMap.get(b);
            return s + toNumber(row?.avg_dpd) * toNumber(row?.outstanding);
          }, 0) / totalOutstanding
        )
      : 0;

  const summary = [
    { key: 'outstanding', label: 'Outstanding', value: totalOutstanding, format: 'money' },
    { key: 'overdue90', label: '90+ outstanding', value: overdue90, format: 'money' },
    {
      key: 'currentShare',
      label: 'Current share',
      value: pct(currentOut, totalOutstanding),
      format: 'percent',
    },
    { key: 'avgDpd', label: 'Weighted avg DPD', value: weightedDpd },
    { key: 'debtors', label: 'Debtors', value: totalDebtors },
  ];

  // Default aging view: bucket rollup (the actual aging report).
  if (!detailView) {
    const allRows = labels.map((bucket) => {
      const r = bucketMap.get(bucket) || {};
      const outstanding = toNumber(r.outstanding);
      return {
        id: bucket,
        bucket,
        debtors: toNumber(r.debtors),
        loanAmount: toNumber(r.loan_total),
        collected: toNumber(r.collected),
        outstanding,
        avgDpd: Math.round(toNumber(r.avg_dpd)),
        share: pct(outstanding, totalOutstanding),
      };
    });
    const pageRows = allRows.slice(offset, offset + pageSize);
    return wrapResult('aging-report', filters, {
      summary,
      series: [],
      columns: [
        { key: 'bucket', label: 'Bucket' },
        { key: 'debtors', label: 'Debtors', format: 'number' },
        { key: 'loanAmount', label: 'Loan', format: 'money' },
        { key: 'collected', label: 'Paid', format: 'money' },
        { key: 'outstanding', label: 'Outstanding', format: 'money' },
        { key: 'avgDpd', label: 'Avg DPD', format: 'number' },
        { key: 'share', label: 'Share', format: 'percent' },
      ],
      rows: pageRows,
      total: allRows.length,
      page,
      pageSize,
      hasMore: offset + pageRows.length < allRows.length,
    });
  }

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}`,
    params
  );
  const total = toNumber(countRow.cnt);

  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.account_number, d.assigned_agent, d.overdue_days, d.bucket,
            d.loan_amount, d.total_paid, d.outstanding_balance, c.name AS client_name
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}
     ORDER BY d.overdue_days DESC, d.outstanding_balance DESC, d.id DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return wrapResult('aging-report', filters, {
    summary,
    series: [],
    columns: [
      { key: 'name', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'accountNumber', label: 'Account' },
      { key: 'agent', label: 'Agent' },
      { key: 'bucket', label: 'Bucket' },
      { key: 'overdueDays', label: 'DPD', format: 'number' },
      { key: 'loanAmount', label: 'Loan', format: 'money' },
      { key: 'collected', label: 'Paid', format: 'money' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      clientName: r.client_name || '—',
      accountNumber: r.account_number || '—',
      agent: r.assigned_agent || '—',
      bucket: r.bucket || '—',
      overdueDays: toNumber(r.overdue_days),
      loanAmount: toNumber(r.loan_amount),
      collected: toNumber(r.total_paid),
      outstanding: toNumber(r.outstanding_balance),
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 7. Dispute Management ─────────────────────────────────────── */

async function disputeManagement(filters, viewer) {
  const { page, pageSize, offset } = parsePageParams(filters);
  const scope = buildScope({ viewer, filters });
  const disputeParams = [];
  const disputeWhere = ['d.deleted_at IS NULL'];

  if (filters.caseClosed === '1' || filters.caseClosed === 1) {
    disputeWhere.push('d.is_closed = 1');
  } else if (filters.caseClosed === 'any') {
    // both
  } else {
    disputeWhere.push('(d.is_closed = 0 OR d.is_closed IS NULL)');
  }

  if (filters.disputeCode && String(filters.disputeCode).trim()) {
    disputeWhere.push('cs.code = ?');
    disputeParams.push(String(filters.disputeCode).trim());
  } else {
    disputeWhere.push(`cs.code IN (${DISPUTE_STATUS_CODES.map(() => '?').join(',')})`);
    disputeParams.push(...DISPUTE_STATUS_CODES);
  }
  disputeWhere.push(...scope.clauses);
  disputeParams.push(...scope.params);

  if (filters.fileId != null && filters.fileId !== '') {
    disputeWhere.push('d.file_id = ?');
    disputeParams.push(Number(filters.fileId));
  }
  applyAmountRange(disputeWhere, disputeParams, {
    amountMin: filters.balanceMin,
    amountMax: filters.balanceMax,
  }, 'd.outstanding_balance');
  if (filters.lastContactedFrom) {
    disputeWhere.push('d.last_contacted_at >= ?');
    disputeParams.push(String(filters.lastContactedFrom));
  }
  if (filters.lastContactedTo) {
    disputeWhere.push('d.last_contacted_at <= ?');
    disputeParams.push(String(filters.lastContactedTo));
  }
  if (filters.nextActionFrom) {
    disputeWhere.push('d.next_action_date >= ?');
    disputeParams.push(String(filters.nextActionFrom));
  }
  if (filters.nextActionTo) {
    disputeWhere.push('d.next_action_date <= ?');
    disputeParams.push(String(filters.nextActionTo));
  }

  const search = String(filters.search || '').trim();
  if (search) {
    disputeWhere.push('(d.name LIKE ? OR c.name LIKE ? OR d.assigned_agent LIKE ?)');
    const like = `%${search}%`;
    disputeParams.push(like, like, like);
  }
  const whereSql = `WHERE ${disputeWhere.join(' AND ')}`;

  const cacheKey = kpiCacheKey('dispute-management', viewer, filters);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS open_cases,
              COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
              COUNT(DISTINCT cs.code) AS status_types
       FROM debtors d
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
       ${whereSql}`,
      disputeParams
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const total = toNumber(totals.open_cases);

  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.assigned_agent, d.outstanding_balance, d.last_contacted_at,
            d.next_action_date, c.name AS client_name, cs.code AS status_code, cs.name AS status_name,
            (SELECT COUNT(*) FROM contact_attempts ca2 WHERE ca2.debtor_id = d.id) AS attempt_count,
            (SELECT ca3.notes FROM contact_attempts ca3
              WHERE ca3.debtor_id = d.id AND ca3.notes IS NOT NULL AND TRIM(ca3.notes) <> ''
              ORDER BY ca3.created_at DESC LIMIT 1) AS last_note,
            (SELECT ca4.channel FROM contact_attempts ca4
              WHERE ca4.debtor_id = d.id ORDER BY ca4.created_at DESC LIMIT 1) AS last_channel
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     ${whereSql}
     ORDER BY d.last_contacted_at DESC, d.outstanding_balance DESC
     LIMIT ? OFFSET ?`,
    [...disputeParams, pageSize, offset]
  );

  return wrapResult('dispute-management', filters, {
    summary: [
      { key: 'open', label: 'Open disputes', value: total },
      { key: 'outstanding', label: 'Outstanding', value: toNumber(totals.outstanding), format: 'money' },
      { key: 'statuses', label: 'Status types', value: toNumber(totals.status_types) },
    ],
    series: [],
    columns: [
      { key: 'name', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agent', label: 'Agent' },
      { key: 'status', label: 'Status' },
      { key: 'channel', label: 'Last channel' },
      { key: 'attemptCount', label: 'Attempts', format: 'number' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
      { key: 'lastContacted', label: 'Last contacted' },
      { key: 'nextAction', label: 'Next action' },
      { key: 'notes', label: 'Latest note' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      name: r.name,
      clientName: r.client_name || '—',
      agent: r.assigned_agent || '—',
      status: r.status_code ? `${r.status_code} · ${r.status_name || ''}` : r.status_name || '—',
      channel: r.last_channel || '—',
      attemptCount: toNumber(r.attempt_count),
      outstanding: toNumber(r.outstanding_balance),
      lastContacted: r.last_contacted_at
        ? new Date(r.last_contacted_at).toLocaleString()
        : '—',
      nextAction: r.next_action_date ? String(r.next_action_date).slice(0, 10) : '—',
      notes: r.last_note || '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 8. Recovery Rate ──────────────────────────────────────────── */

async function recoveryRate(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const { clauses, params } = buildScope({ viewer, filters });
  const where = ['d.deleted_at IS NULL', ...clauses];
  applyDebtorReportFilters(where, params, filters, {
    defaultCaseClosed: 'any',
    includeSearch: false,
  });
  const search = String(filters.search || '').trim();
  if (search) {
    where.push('(c.name LIKE ? OR d.assigned_agent LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like);
  }
  const whereSql = `WHERE ${where.join(' AND ')}`;

  const [[countRow]] = await pool.query(
    `SELECT COUNT(DISTINCT c.id) AS cnt
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}`,
    params
  );
  const total = toNumber(countRow.cnt);

  const cacheKey = kpiCacheKey('recovery-rate', viewer, applied);
  let kpi = getCachedKpi(cacheKey);
  if (!kpi) {
    const [[agg]] = await pool.query(
      `SELECT
         COALESCE(SUM(d.loan_amount), 0) AS loan_total,
         COALESCE(SUM(d.total_paid), 0) AS collected,
         COALESCE(SUM(d.outstanding_balance), 0) AS outstanding
       FROM debtors d
       LEFT JOIN clients c ON c.id = d.client_id
       ${whereSql}`,
      params
    );
    const payClauses = ['p.confirmed = 1', 'p.amount > 0', 'DATE(p.payment_date) BETWEEN ? AND ?'];
    const payParams = [dateFrom, dateTo];
    const payScope = resolveReportScope(viewer, filters);
    if (payScope.mode === 'agent') {
      payClauses.push('(p.agent_user_id = ? OR p.agent_name = ?)');
      payParams.push(Number(viewer.id), String(viewer.name || ''));
    } else if (payScope.callCenterId) {
      payClauses.push(
        'EXISTS (SELECT 1 FROM clients cx WHERE cx.id = p.client_id AND cx.call_center_id = ?)'
      );
      payParams.push(payScope.callCenterId);
    }
    if (filters.clientId) {
      payClauses.push('p.client_id = ?');
      payParams.push(Number(filters.clientId));
    }
    const [[period]] = await pool.query(
      `SELECT COALESCE(SUM(p.amount), 0) AS period_collections
       FROM payments p
       WHERE ${payClauses.join(' AND ')}`,
      payParams
    );
    kpi = {
      loanTotal: toNumber(agg.loan_total),
      collected: toNumber(agg.collected),
      outstanding: toNumber(agg.outstanding),
      periodCollections: toNumber(period.period_collections),
    };
    setCachedKpi(cacheKey, kpi);
  }

  const [clientRows] = await pool.query(
    `SELECT c.id, c.name AS client_name,
            COUNT(*) AS cases,
            COALESCE(SUM(d.loan_amount), 0) AS loan_total,
            COALESCE(SUM(d.total_paid), 0) AS collected,
            COALESCE(SUM(d.outstanding_balance), 0) AS outstanding,
            (SELECT COALESCE(SUM(p.amount), 0) FROM payments p
              WHERE p.client_id = c.id AND p.confirmed = 1 AND p.amount > 0
                AND DATE(p.payment_date) BETWEEN ? AND ?) AS period_collections
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     ${whereSql}
     GROUP BY c.id, c.name
     ORDER BY collected DESC
     LIMIT ? OFFSET ?`,
    [dateFrom, dateTo, ...params, pageSize, offset]
  );

  const mapped = clientRows.map((r) => {
    const loanTotal = toNumber(r.loan_total);
    const collected = toNumber(r.collected);
    return {
      id: r.id,
      client: r.client_name || 'Unassigned',
      cases: toNumber(r.cases),
      loanTotal,
      collected,
      outstanding: toNumber(r.outstanding),
      recovery: pct(collected, loanTotal),
      periodCollections: toNumber(r.period_collections),
    };
  });

  return wrapResult('recovery-rate', applied, {
    summary: [
      { key: 'recovery', label: 'Overall recovery %', value: pct(kpi.collected, kpi.loanTotal), format: 'percent' },
      { key: 'collected', label: 'Collected', value: kpi.collected, format: 'money' },
      { key: 'outstanding', label: 'Outstanding', value: kpi.outstanding, format: 'money' },
      { key: 'period', label: 'Period collections', value: kpi.periodCollections, format: 'money' },
    ],
    series: [],
    columns: [
      { key: 'client', label: 'Client' },
      { key: 'cases', label: 'Cases', format: 'number' },
      { key: 'loanTotal', label: 'Loan', format: 'money' },
      { key: 'collected', label: 'Collected', format: 'money' },
      { key: 'outstanding', label: 'Outstanding', format: 'money' },
      { key: 'recovery', label: 'Recovery %', format: 'percent' },
      { key: 'periodCollections', label: 'Period collections', format: 'money' },
    ],
    rows: mapped,
    total,
    page,
    pageSize,
    hasMore: offset + mapped.length < total,
  });
}

/* ─── 9. GOIP / Voice Calls ─────────────────────────────────────── */

async function goipCallsReport(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['DATE(COALESCE(vc.started_at, vc.created_at)) BETWEEN ? AND ?'];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    clauses.push('vc.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('(u.call_center_id = ? OR c.call_center_id = ?)');
      params.push(scope.callCenterId, scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('(u.call_center_id = ? OR c.call_center_id = ?)');
    params.push(scope.callCenterId, scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push('vc.agent_id = ?');
    params.push(Number(filters.agentId));
  }
  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }
  if (filters.direction && String(filters.direction).trim()) {
    clauses.push('vc.direction = ?');
    params.push(String(filters.direction).trim());
  }
  if (filters.status && String(filters.status).trim()) {
    clauses.push('vc.status = ?');
    params.push(String(filters.status).trim());
  }
  if (filters.provider && String(filters.provider).trim()) {
    clauses.push('vc.provider = ?');
    params.push(String(filters.provider).trim());
  }
  if (filters.hasRecording === '1' || filters.hasRecording === 1) {
    clauses.push('vc.recording_url IS NOT NULL AND TRIM(vc.recording_url) <> ""');
  }
  if (filters.amountMin != null && filters.amountMin !== '') {
    clauses.push('vc.duration_seconds >= ?');
    params.push(Number(filters.amountMin));
  }
  if (filters.amountMax != null && filters.amountMax !== '') {
    clauses.push('vc.duration_seconds <= ?');
    params.push(Number(filters.amountMax));
  }
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push(
      '(d.name LIKE ? OR u.name LIKE ? OR vc.from_number LIKE ? OR vc.to_number LIKE ? OR vc.debtor_number LIKE ?)'
    );
    const like = `%${search}%`;
    params.push(like, like, like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM voice_calls vc
    LEFT JOIN users u ON u.id = vc.agent_id
    LEFT JOIN debtors d ON d.id = vc.debtor_id
    LEFT JOIN clients c ON c.id = d.client_id
  `;

  const cacheKey = kpiCacheKey('goip-calls-report', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(vc.direction = 'inbound') AS inbound,
         SUM(vc.direction = 'outbound') AS outbound,
         SUM(vc.status IN ('completed', 'answered', 'bridged')) AS connected,
         COALESCE(AVG(vc.duration_seconds), 0) AS avg_duration,
         COALESCE(SUM(vc.duration_seconds), 0) AS talk_seconds
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const total = toNumber(totals.total);
  const connected = toNumber(totals.connected);

  const [rows] = await pool.query(
    `SELECT vc.id, vc.direction, vc.status, vc.duration_seconds, vc.from_number, vc.to_number,
            vc.agent_number, vc.debtor_number, vc.recording_url, vc.provider,
            vc.started_at, vc.created_at, u.name AS agent_name, d.name AS debtor_name,
            c.name AS client_name
     ${fromSql} ${whereSql}
     ORDER BY COALESCE(vc.started_at, vc.created_at) DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return wrapResult('goip-calls-report', applied, {
    summary: [
      { key: 'total', label: 'Calls', value: total },
      { key: 'connectedRate', label: 'Connected rate', value: pct(connected, total), format: 'percent' },
      { key: 'avgDuration', label: 'Avg duration (s)', value: Math.round(toNumber(totals.avg_duration)) },
      { key: 'inbound', label: 'Inbound', value: toNumber(totals.inbound) },
      { key: 'outbound', label: 'Outbound', value: toNumber(totals.outbound) },
    ],
    series: [],
    columns: [
      { key: 'startedAt', label: 'Started' },
      { key: 'direction', label: 'Direction' },
      { key: 'status', label: 'Status' },
      { key: 'duration', label: 'Duration (s)', format: 'number' },
      { key: 'agentName', label: 'Agent' },
      { key: 'debtorName', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentNumber', label: 'Agent #' },
      { key: 'debtorNumber', label: 'Debtor #' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      startedAt: r.started_at || r.created_at
        ? new Date(r.started_at || r.created_at).toLocaleString()
        : '—',
      direction: r.direction || '—',
      status: r.status || '—',
      duration: toNumber(r.duration_seconds),
      agentName: r.agent_name || '—',
      debtorName: r.debtor_name || '—',
      clientName: r.client_name || '—',
      agentNumber: r.agent_number || r.from_number || '—',
      debtorNumber: r.debtor_number || r.to_number || '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 10. SMS Report ────────────────────────────────────────────── */

async function smsReport(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['DATE(sa.created_at) BETWEEN ? AND ?'];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    clauses.push('sa.user_id = ?');
    params.push(Number(viewer.id));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('u.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('u.call_center_id = ?');
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push('sa.user_id = ?');
    params.push(Number(filters.agentId));
  }
  if (filters.status && String(filters.status).trim()) {
    clauses.push('sa.status = ?');
    params.push(String(filters.status).trim());
  }
  if (filters.category && String(filters.category).trim()) {
    clauses.push('sa.category = ?');
    params.push(String(filters.category).trim());
  }
  if (filters.provider && String(filters.provider).trim()) {
    clauses.push('sa.provider = ?');
    params.push(String(filters.provider).trim());
  }
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(sa.recipient LIKE ? OR sa.message LIKE ? OR u.name LIKE ? OR sa.sender_id LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM sms_audit sa
    LEFT JOIN users u ON u.id = sa.user_id
  `;

  const cacheKey = kpiCacheKey('sms-report', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS total,
         SUM(sa.status = 'sent') AS sent,
         SUM(sa.status = 'failed') AS failed,
         COALESCE(SUM(sa.segments), 0) AS segments
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const sent = toNumber(totals.sent);
  const failed = toNumber(totals.failed);
  const total = toNumber(totals.total);

  const [rows] = await pool.query(
    `SELECT sa.id, sa.created_at, sa.recipient, sa.sender_id, sa.category, sa.status,
            sa.segments, sa.provider, sa.error_message, sa.message, u.name AS agent_name
     ${fromSql} ${whereSql}
     ORDER BY sa.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return wrapResult('sms-report', applied, {
    summary: [
      { key: 'sent', label: 'Sent', value: sent },
      { key: 'failed', label: 'Failed', value: failed },
      { key: 'delivery', label: 'Delivery rate', value: pct(sent, sent + failed), format: 'percent' },
      { key: 'segments', label: 'Segments', value: toNumber(totals.segments) },
    ],
    series: [],
    columns: [
      { key: 'createdAt', label: 'Sent at' },
      { key: 'agentName', label: 'Agent' },
      { key: 'recipient', label: 'Recipient' },
      { key: 'senderId', label: 'Sender' },
      { key: 'category', label: 'Category' },
      { key: 'status', label: 'Status' },
      { key: 'segments', label: 'Segments', format: 'number' },
      { key: 'preview', label: 'Message' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at ? new Date(r.created_at).toLocaleString() : '—',
      agentName: r.agent_name || '—',
      recipient: r.recipient || '—',
      senderId: r.sender_id || '—',
      category: r.category || '—',
      status: r.status || '—',
      segments: toNumber(r.segments),
      preview: r.message
        ? String(r.message).slice(0, 80) + (String(r.message).length > 80 ? '…' : '')
        : '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 11. Debtor Notes ──────────────────────────────────────────── */

async function debtorNotes(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = [
    'ca.notes IS NOT NULL',
    "TRIM(ca.notes) <> ''",
    'DATE(ca.created_at) BETWEEN ? AND ?',
  ];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    clauses.push('ca.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('c.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('c.call_center_id = ?');
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push('ca.agent_id = ?');
    params.push(Number(filters.agentId));
  }
  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }
  if (filters.channel && String(filters.channel).trim()) {
    clauses.push('ca.channel = ?');
    params.push(String(filters.channel).trim());
  }
  if (filters.contactStatusId != null && filters.contactStatusId !== '') {
    clauses.push('ca.contact_status_id = ?');
    params.push(Number(filters.contactStatusId));
  }
  if (filters.fileId != null && filters.fileId !== '') {
    clauses.push('d.file_id = ?');
    params.push(Number(filters.fileId));
  }
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(ca.notes LIKE ? OR d.name LIKE ? OR u.name LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM contact_attempts ca
    INNER JOIN debtors d ON d.id = ca.debtor_id
    LEFT JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = ca.agent_id
    LEFT JOIN contact_statuses cs ON cs.id = ca.contact_status_id
  `;

  const cacheKey = kpiCacheKey('debtor-notes', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT COUNT(*) AS notes,
              COUNT(DISTINCT ca.debtor_id) AS debtors,
              COUNT(DISTINCT ca.agent_id) AS agents
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const total = toNumber(totals.notes);

  const [rows] = await pool.query(
    `SELECT ca.id, ca.created_at, ca.channel, ca.notes,
            d.name AS debtor_name, c.name AS client_name, u.name AS agent_name,
            cs.name AS status_name
     ${fromSql} ${whereSql}
     ORDER BY ca.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return wrapResult('debtor-notes', applied, {
    summary: [
      { key: 'notes', label: 'Notes', value: total },
      { key: 'debtors', label: 'Debtors with notes', value: toNumber(totals.debtors) },
      { key: 'agents', label: 'Agents', value: toNumber(totals.agents) },
    ],
    series: [],
    columns: [
      { key: 'createdAt', label: 'Created' },
      { key: 'debtorName', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentName', label: 'Agent' },
      { key: 'channel', label: 'Channel' },
      { key: 'status', label: 'Status' },
      { key: 'notes', label: 'Note' },
    ],
    rows: rows.map((r) => ({
      id: r.id,
      createdAt: r.created_at ? new Date(r.created_at).toLocaleString() : '—',
      debtorName: r.debtor_name || '—',
      clientName: r.client_name || '—',
      agentName: r.agent_name || '—',
      channel: r.channel || '—',
      status: r.status_name || '—',
      notes: r.notes || '—',
    })),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

/* ─── 12. Contact Attempt ───────────────────────────────────────── */

async function contactAttempt(filters, viewer) {
  const { dateFrom, dateTo } = defaultDateRange(filters);
  const applied = { ...filters, dateFrom, dateTo };
  const { page, pageSize, offset } = parsePageParams(filters);
  const clauses = ['DATE(ca.created_at) BETWEEN ? AND ?'];
  const params = [dateFrom, dateTo];
  const scope = resolveReportScope(viewer, filters);

  if (scope.mode === 'agent') {
    clauses.push('ca.agent_id = ?');
    params.push(Number(viewer.id));
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  } else if (scope.mode === 'center') {
    if (!scope.callCenterId) clauses.push('1=0');
    else {
      clauses.push('c.call_center_id = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.callCenterId) {
    clauses.push('c.call_center_id = ?');
    params.push(scope.callCenterId);
  }
  if (scope.mode !== 'agent' && filters.agentId) {
    clauses.push('ca.agent_id = ?');
    params.push(Number(filters.agentId));
  }
  if (filters.clientId) {
    clauses.push('d.client_id = ?');
    params.push(Number(filters.clientId));
  }
  if (filters.channel && String(filters.channel).trim()) {
    clauses.push('ca.channel = ?');
    params.push(String(filters.channel).trim());
  }
  if (filters.contactStatusId != null && filters.contactStatusId !== '') {
    clauses.push('ca.contact_status_id = ?');
    params.push(Number(filters.contactStatusId));
  }
  if (filters.ptp === '1' || filters.ptp === 1) {
    clauses.push("cs.code = 'PTP'");
  }
  if (filters.hasNotes === '1' || filters.hasNotes === 1) {
    clauses.push("ca.notes IS NOT NULL AND TRIM(ca.notes) <> ''");
  }
  if (filters.fileId != null && filters.fileId !== '') {
    clauses.push('d.file_id = ?');
    params.push(Number(filters.fileId));
  }
  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR u.name LIKE ? OR c.name LIKE ? OR ca.notes LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  const whereSql = `WHERE ${clauses.join(' AND ')}`;
  const fromSql = `
    FROM contact_attempts ca
    INNER JOIN debtors d ON d.id = ca.debtor_id
    LEFT JOIN clients c ON c.id = d.client_id
    LEFT JOIN users u ON u.id = ca.agent_id
    LEFT JOIN contact_statuses cs ON cs.id = ca.contact_status_id
  `;

  const cacheKey = kpiCacheKey('contact-attempt', viewer, applied);
  let totals = getCachedKpi(cacheKey);
  if (!totals) {
    const [[row]] = await pool.query(
      `SELECT
         COUNT(*) AS attempts,
         COUNT(DISTINCT ca.debtor_id) AS debtors,
         SUM(ca.channel = 'call') AS calls,
         SUM(ca.channel = 'sms') AS sms,
         SUM(ca.channel = 'email') AS emails,
         SUM(cs.code = 'PTP') AS ptp_outcomes
       ${fromSql} ${whereSql}`,
      params
    );
    totals = row;
    setCachedKpi(cacheKey, totals);
  }

  const total = toNumber(totals.attempts);

  const [rows] = await pool.query(
    `SELECT ca.id, ca.created_at, ca.channel, ca.notes, ca.message_body,
            d.name AS debtor_name, d.next_action_date, c.name AS client_name,
            u.name AS agent_name, cs.name AS status_name, cs.code AS status_code
     ${fromSql} ${whereSql}
     ORDER BY ca.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return wrapResult('contact-attempt', applied, {
    summary: [
      { key: 'attempts', label: 'Attempts', value: total },
      { key: 'debtors', label: 'Unique debtors', value: toNumber(totals.debtors) },
      { key: 'calls', label: 'Calls', value: toNumber(totals.calls) },
      { key: 'sms', label: 'SMS', value: toNumber(totals.sms) },
      { key: 'ptp', label: 'PTP outcomes', value: toNumber(totals.ptp_outcomes) },
    ],
    series: [],
    columns: [
      { key: 'createdAt', label: 'Attempted' },
      { key: 'debtorName', label: 'Debtor' },
      { key: 'clientName', label: 'Client' },
      { key: 'agentName', label: 'Agent' },
      { key: 'channel', label: 'Channel' },
      { key: 'outcome', label: 'Outcome' },
      { key: 'preview', label: 'Notes / message' },
      { key: 'nextAction', label: 'Next action' },
    ],
    rows: rows.map((r) => {
      const preview = r.notes || r.message_body || '';
      return {
        id: r.id,
        createdAt: r.created_at ? new Date(r.created_at).toLocaleString() : '—',
        debtorName: r.debtor_name || '—',
        clientName: r.client_name || '—',
        agentName: r.agent_name || '—',
        channel: r.channel || '—',
        outcome: r.status_code
          ? `${r.status_code}${r.status_name ? ` · ${r.status_name}` : ''}`
          : r.status_name || '—',
        preview: preview
          ? String(preview).slice(0, 80) + (String(preview).length > 80 ? '…' : '')
          : '—',
        nextAction: r.next_action_date ? String(r.next_action_date).slice(0, 10) : '—',
      };
    }),
    total,
    page,
    pageSize,
    hasMore: offset + rows.length < total,
  });
}

const HANDLERS = {
  'debtor-summary': debtorSummary,
  'payment-performance': paymentPerformance,
  'collector-performance': collectorPerformance,
  'portfolio-performance': portfolioPerformance,
  'promise-to-pay': promiseToPay,
  'aging-report': agingReport,
  'dispute-management': disputeManagement,
  'recovery-rate': recoveryRate,
  'goip-calls-report': goipCallsReport,
  'sms-report': smsReport,
  'debtor-notes': debtorNotes,
  'contact-attempt': contactAttempt,
};

async function getReportData(slug, filters = {}, viewer = null) {
  if (!REPORT_SLUGS.has(slug)) {
    const err = new Error('Unknown report');
    err.status = 404;
    throw err;
  }
  const handler = HANDLERS[slug];
  return handler(filters || {}, viewer);
}

module.exports = {
  REPORT_SLUGS,
  getReportData,
  exportReport,
  exportDebtorSummary,
  getAgentNameById,
};
