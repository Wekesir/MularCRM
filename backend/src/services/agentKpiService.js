const pool = require('../db/pool');
const { getAgentById } = require('./agentService');

// (key, label, kind) — kind is 'count' (INT) or 'money' (DECIMAL).
const KPI_FIELDS = [
  { key: 'calls', kind: 'count' },
  { key: 'collection', kind: 'money' },
  { key: 'sms', kind: 'count' },
  { key: 'emails', kind: 'count' },
  { key: 'ptpVolume', kind: 'count' },
];

const PERIODS = ['daily', 'weekly', 'monthly'];

const DB_COLUMN_BY_KEY = {
  calls: 'calls',
  collection: 'collection',
  sms: 'sms',
  emails: 'emails',
  ptpVolume: 'ptp_volume',
};

function normalizeKpi(row) {
  if (!row) return null;
  return {
    userId: row.user_id,
    calls: { daily: Number(row.calls_daily) || 0, weekly: Number(row.calls_weekly) || 0, monthly: Number(row.calls_monthly) || 0 },
    collection: { daily: Number(row.collection_daily) || 0, weekly: Number(row.collection_weekly) || 0, monthly: Number(row.collection_monthly) || 0 },
    sms: { daily: Number(row.sms_daily) || 0, weekly: Number(row.sms_weekly) || 0, monthly: Number(row.sms_monthly) || 0 },
    emails: { daily: Number(row.emails_daily) || 0, weekly: Number(row.emails_weekly) || 0, monthly: Number(row.emails_monthly) || 0 },
    ptpVolume: { daily: Number(row.ptp_volume_daily) || 0, weekly: Number(row.ptp_volume_weekly) || 0, monthly: Number(row.ptp_volume_monthly) || 0 },
    effectiveFrom: row.effective_from || null,
    notes: row.notes || null,
    updatedAt: row.updated_at,
  };
}

function coerceNumber(value, { money = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return money ? Math.round(n * 100) / 100 : Math.round(n);
}

function parseKpiPayload(data = {}) {
  const cleaned = {};
  for (const { key, kind } of KPI_FIELDS) {
    const input = data[key] || {};
    const money = kind === 'money';
    for (const period of PERIODS) {
      const col = `${DB_COLUMN_BY_KEY[key]}_${period}`;
      cleaned[col] = coerceNumber(input[period], { money });
    }
  }
  const effectiveFrom = data.effectiveFrom
    ? String(data.effectiveFrom).slice(0, 10)
    : null;
  const notes = data.notes ? String(data.notes).trim().slice(0, 255) || null : null;
  return { cleaned, effectiveFrom, notes };
}

async function getKpisByUserId(userId) {
  const [rows] = await pool.query(
    'SELECT * FROM agent_kpis WHERE user_id = ? LIMIT 1',
    [userId]
  );
  return normalizeKpi(rows[0]);
}

async function upsertKpis(userId, data = {}, updatedBy = null) {
  const agent = await getAgentById(userId);
  if (!agent) {
    const err = new Error('Agent not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const { cleaned, effectiveFrom, notes } = parseKpiPayload(data);
  const columns = Object.keys(cleaned);
  const values = Object.values(cleaned);

  const allColumns = [...columns, 'effective_from', 'notes', 'updated_by'];
  const allValues = [...values, effectiveFrom, notes, updatedBy ?? null];

  const updateClause = [
    ...columns.map((c) => `${c} = VALUES(${c})`),
    'effective_from = VALUES(effective_from)',
    'notes = VALUES(notes)',
    'updated_by = VALUES(updated_by)',
  ].join(', ');

  await pool.query(
    `INSERT INTO agent_kpis (${allColumns.join(', ')})
     VALUES (${allColumns.map(() => '?').join(', ')})
     ON DUPLICATE KEY UPDATE ${updateClause}`,
    allValues
  );

  return getKpisByUserId(userId);
}

module.exports = {
  KPI_FIELDS,
  PERIODS,
  getKpisByUserId,
  upsertKpis,
};
