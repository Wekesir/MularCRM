const pool = require('../db/pool');

/* -------------------------------------------------------------------------- */
/* Helpers (mirror auditService.js to keep this module self-contained)        */
/* -------------------------------------------------------------------------- */

function parseJson(value, fallback = null) {
  if (value === null || value === undefined) return fallback;
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

function paginationArgs({ draw, start, length, page, limit } = {}) {
  if (draw !== undefined) {
    return {
      mode: 'datatables',
      draw: Number(draw) || 0,
      offset: Math.max(Number(start) || 0, 0),
      limit: Math.min(Math.max(Number(length) || 10, 1), 200),
    };
  }
  const safePage = Math.max(Number(page) || 1, 1);
  const safeLimit = Math.min(Math.max(Number(limit) || 25, 1), 200);
  return {
    mode: 'simple',
    page: safePage,
    limit: safeLimit,
    offset: (safePage - 1) * safeLimit,
  };
}

function buildListResult({ args, rows, total, filtered }) {
  if (args.mode === 'datatables') {
    return {
      draw: args.draw,
      recordsTotal: total,
      recordsFiltered: filtered,
      data: rows,
    };
  }
  return {
    data: rows,
    page: args.page,
    limit: args.limit,
    total: filtered,
    recordsTotal: total,
    hasMore: args.offset + rows.length < filtered,
  };
}

function normalizeActivity(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    actionType: row.action_type,
    title: row.title,
    subject: row.subject,
    entityType: row.entity_type,
    entityId: row.entity_id,
    amount: row.amount !== null ? Number(row.amount) : null,
    metadata: parseJson(row.metadata, null),
    createdAt: row.created_at,
  };
}

const ACTIVITY_SELECT = `
  SELECT al.*, u.name AS user_name
  FROM activity_log al
  LEFT JOIN users u ON u.id = al.user_id
`;

/* -------------------------------------------------------------------------- */
/* Recording (system-internal, fail-safe)                                     */
/* -------------------------------------------------------------------------- */

function normalizeActivityInsertRow({
  userId = null,
  userName = null,
  actionType,
  title,
  subject = null,
  entityType = null,
  entityId = null,
  amount = null,
  metadata = null,
}) {
  if (!actionType || !title) return null;
  return [
    userId ?? null,
    userName ?? null,
    String(actionType).slice(0, 80),
    String(title).slice(0, 255),
    subject ? String(subject).slice(0, 512) : null,
    entityType ? String(entityType).slice(0, 50) : null,
    entityId != null ? String(entityId).slice(0, 120) : null,
    amount != null && Number.isFinite(Number(amount)) ? Number(amount) : null,
    metadata ? JSON.stringify(metadata) : null,
  ];
}

async function recordActivityEvent(event) {
  try {
    const row = normalizeActivityInsertRow(event || {});
    if (!row) return null;
    const [result] = await pool.query(
      `INSERT INTO activity_log
        (user_id, user_name, action_type, title, subject, entity_type, entity_id, amount, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      row
    );
    return result.insertId;
  } catch (error) {
    console.warn('[activityService] Failed to record activity event:', error.message);
    return null;
  }
}

/** Bulk-insert activity rows. Returns the number of rows inserted. */
async function recordActivityEvents(events = []) {
  const rows = (Array.isArray(events) ? events : [])
    .map((evt) => normalizeActivityInsertRow(evt || {}))
    .filter(Boolean);
  if (rows.length === 0) return 0;
  try {
    const [result] = await pool.query(
      `INSERT INTO activity_log
        (user_id, user_name, action_type, title, subject, entity_type, entity_id, amount, metadata)
       VALUES ?`,
      [rows]
    );
    return result.affectedRows || 0;
  } catch (error) {
    console.warn('[activityService] Failed to record activity events:', error.message);
    // Fall back to one-by-one so a single bad row does not drop the rest.
    let inserted = 0;
    for (const evt of events) {
      const id = await recordActivityEvent(evt);
      if (id) inserted += 1;
    }
    return inserted;
  }
}

/* -------------------------------------------------------------------------- */
/* CRUD                                                                        */
/* -------------------------------------------------------------------------- */

async function listActivityLogs(params = {}) {
  const args = paginationArgs(params);
  const conditions = [];
  const values = [];

  if (params.actionType) {
    conditions.push('al.action_type = ?');
    values.push(params.actionType);
  }
  if (params.entityType) {
    conditions.push('al.entity_type = ?');
    values.push(params.entityType);
  }
  if (params.userId) {
    conditions.push('al.user_id = ?');
    values.push(Number(params.userId));
  }
  const search = (params.search || '').trim();
  if (search) {
    conditions.push('(al.title LIKE ? OR al.subject LIKE ? OR al.user_name LIKE ? OR u.name LIKE ? OR al.action_type LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like, like, like, like);
  }
  if (params.dateFrom) {
    conditions.push('DATE(al.created_at) >= ?');
    values.push(params.dateFrom);
  }
  if (params.dateTo) {
    conditions.push('DATE(al.created_at) <= ?');
    values.push(params.dateTo);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

  const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM activity_log');
  const [[filteredRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM activity_log al LEFT JOIN users u ON u.id = al.user_id${whereClause}`,
    values
  );

  const [rows] = await pool.query(
    `${ACTIVITY_SELECT}${whereClause} ORDER BY al.created_at DESC LIMIT ? OFFSET ?`,
    [...values, args.limit, args.offset]
  );

  return buildListResult({
    args,
    rows: rows.map(normalizeActivity),
    total: Number(totalRow.total) || 0,
    filtered: Number(filteredRow.total) || 0,
  });
}

async function getActivityLogById(id) {
  const [rows] = await pool.query(`${ACTIVITY_SELECT} WHERE al.id = ?`, [id]);
  return rows.length ? normalizeActivity(rows[0]) : null;
}

async function getActivityStats() {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS last24h
     FROM activity_log`
  );

  const [byType] = await pool.query(
    `SELECT action_type AS actionType, COUNT(*) AS count
     FROM activity_log
     GROUP BY action_type
     ORDER BY count DESC
     LIMIT 12`
  );

  return {
    total: Number(totals.total) || 0,
    last24h: Number(totals.last24h) || 0,
    byType: byType.map((row) => ({ actionType: row.actionType, count: Number(row.count) || 0 })),
  };
}

module.exports = {
  recordActivityEvent,
  recordActivityEvents,
  listActivityLogs,
  getActivityLogById,
  getActivityStats,
};
