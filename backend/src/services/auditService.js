const pool = require('../db/pool');
const { parseUserAgent } = require('../utils/userAgent');

/* -------------------------------------------------------------------------- */
/* Helpers                                                                    */
/* -------------------------------------------------------------------------- */

function toRecipientString(value) {
  if (Array.isArray(value)) return value.join(', ');
  return value ? String(value) : '';
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

function estimateSegments(message) {
  const length = String(message || '').length;
  if (length === 0) return 0;
  return length <= 160 ? 1 : Math.ceil(length / 153);
}

async function resolveUserIdByEmail(email) {
  if (!email) return null;
  const [rows] = await pool.query('SELECT id FROM users WHERE LOWER(email) = ? LIMIT 1', [
    String(email).trim().toLowerCase(),
  ]);
  return rows[0]?.id ?? null;
}

async function resolveUserIdByPhone(phone) {
  if (!phone) return null;
  const digits = String(phone).replace(/\D/g, '').slice(-9);
  if (!digits) return null;
  const [rows] = await pool.query(
    "SELECT id FROM users WHERE REPLACE(REPLACE(phone, '+', ''), ' ', '') LIKE ? LIMIT 1",
    [`%${digits}`]
  );
  return rows[0]?.id ?? null;
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

/* -------------------------------------------------------------------------- */
/* Normalizers                                                                */
/* -------------------------------------------------------------------------- */

function normalizeLogin(row) {
  const loginAt = row.login_at ? new Date(row.login_at) : null;
  const logoutAt = row.logout_at ? new Date(row.logout_at) : null;
  const durationSeconds =
    loginAt && logoutAt ? Math.max(0, Math.round((logoutAt - loginAt) / 1000)) : null;

  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    email: row.email,
    sessionId: row.session_id,
    status: row.status,
    failureReason: row.failure_reason,
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    browser: row.browser,
    browserVersion: row.browser_version,
    os: row.os,
    deviceType: row.device_type,
    deviceVendor: row.device_vendor,
    loginAt: row.login_at,
    logoutAt: row.logout_at,
    durationSeconds,
    active: row.status === 'success' && !row.logout_at,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function normalizeEmail(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    recipient: row.recipient,
    sender: row.sender,
    subject: row.subject,
    body: row.body,
    category: row.category,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id,
    errorMessage: row.error_message,
    metadata: parseJson(row.metadata, null),
    notes: row.notes,
    createdAt: row.created_at,
  };
}

function normalizeSms(row) {
  return {
    id: row.id,
    userId: row.user_id,
    userName: row.user_name || null,
    recipient: row.recipient,
    senderId: row.sender_id,
    message: row.message,
    category: row.category,
    provider: row.provider,
    status: row.status,
    providerMessageId: row.provider_message_id,
    providerCode: row.provider_code,
    errorMessage: row.error_message,
    segments: row.segments,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

/* -------------------------------------------------------------------------- */
/* Recording (system-internal, fail-safe)                                     */
/* -------------------------------------------------------------------------- */

async function recordLoginEvent({
  userId = null,
  email = null,
  sessionId = null,
  status = 'success',
  failureReason = null,
  context = {},
}) {
  try {
    const ua = parseUserAgent(context.userAgent || '');
    const [result] = await pool.query(
      `INSERT INTO login_audit
        (user_id, email, session_id, status, failure_reason, ip_address, user_agent,
         browser, browser_version, os, device_type, device_vendor, login_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
      [
        userId,
        email,
        sessionId,
        status,
        failureReason,
        context.ip || null,
        ua.raw || null,
        ua.browser,
        ua.browserVersion,
        ua.os,
        ua.deviceType,
        ua.deviceVendor,
      ]
    );
    return result.insertId;
  } catch (error) {
    console.warn('[auditService] Failed to record login event:', error.message);
    return null;
  }
}

async function recordLogoutEvent({ sessionId = null, userId = null }) {
  try {
    if (sessionId) {
      const [result] = await pool.query(
        `UPDATE login_audit SET logout_at = NOW()
         WHERE session_id = ? AND status = 'success' AND logout_at IS NULL`,
        [sessionId]
      );
      if (result.affectedRows > 0) return true;
    }

    if (userId) {
      await pool.query(
        `UPDATE login_audit SET logout_at = NOW()
         WHERE user_id = ? AND status = 'success' AND logout_at IS NULL
         ORDER BY login_at DESC LIMIT 1`,
        [userId]
      );
    }
    return true;
  } catch (error) {
    console.warn('[auditService] Failed to record logout event:', error.message);
    return false;
  }
}

async function recordEmailEvent({
  userId = null,
  recipient,
  sender = null,
  subject = null,
  body = null,
  category = 'general',
  provider = null,
  status = 'sent',
  providerMessageId = null,
  errorMessage = null,
  metadata = null,
}) {
  try {
    const recipientStr = toRecipientString(recipient);
    const resolvedUserId = userId ?? (await resolveUserIdByEmail(recipientStr.split(',')[0]?.trim()));

    const [result] = await pool.query(
      `INSERT INTO email_audit
        (user_id, recipient, sender, subject, body, category, provider, status,
         provider_message_id, error_message, metadata)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedUserId,
        recipientStr,
        sender,
        subject,
        body,
        category,
        provider,
        status,
        providerMessageId,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        metadata ? JSON.stringify(metadata) : null,
      ]
    );
    return result.insertId;
  } catch (error) {
    console.warn('[auditService] Failed to record email event:', error.message);
    return null;
  }
}

async function recordSmsEvent({
  userId = null,
  recipient,
  senderId = null,
  message = null,
  category = 'general',
  provider = null,
  status = 'sent',
  providerMessageId = null,
  providerCode = null,
  errorMessage = null,
}) {
  try {
    const resolvedUserId = userId ?? (await resolveUserIdByPhone(recipient));

    const [result] = await pool.query(
      `INSERT INTO sms_audit
        (user_id, recipient, sender_id, message, category, provider, status,
         provider_message_id, provider_code, error_message, segments)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        resolvedUserId,
        recipient ? String(recipient) : '',
        senderId,
        message,
        category,
        provider,
        status,
        providerMessageId,
        providerCode !== null && providerCode !== undefined ? String(providerCode) : null,
        errorMessage ? String(errorMessage).slice(0, 500) : null,
        estimateSegments(message),
      ]
    );
    return result.insertId;
  } catch (error) {
    console.warn('[auditService] Failed to record SMS event:', error.message);
    return null;
  }
}

/* -------------------------------------------------------------------------- */
/* Login audit CRUD                                                           */
/* -------------------------------------------------------------------------- */

const LOGIN_SELECT = `
  SELECT la.*, u.name AS user_name
  FROM login_audit la
  LEFT JOIN users u ON u.id = la.user_id
`;

async function listLoginAudits(params = {}) {
  const args = paginationArgs(params);
  const conditions = [];
  const values = [];

  if (params.status) {
    conditions.push('la.status = ?');
    values.push(params.status);
  }
  if (params.userId) {
    conditions.push('la.user_id = ?');
    values.push(Number(params.userId));
  }
  if (params.activeOnly === true || params.activeOnly === 'true') {
    conditions.push("la.status = 'success' AND la.logout_at IS NULL");
  }
  const search = (params.search || '').trim();
  if (search) {
    conditions.push(
      '(la.email LIKE ? OR la.ip_address LIKE ? OR la.browser LIKE ? OR la.os LIKE ? OR u.name LIKE ?)'
    );
    const like = `%${search}%`;
    values.push(like, like, like, like, like);
  }
  if (params.dateFrom) {
    conditions.push('DATE(la.login_at) >= ?');
    values.push(params.dateFrom);
  }
  if (params.dateTo) {
    conditions.push('DATE(la.login_at) <= ?');
    values.push(params.dateTo);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

  const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM login_audit');
  const [[filteredRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM login_audit la LEFT JOIN users u ON u.id = la.user_id${whereClause}`,
    values
  );

  const [rows] = await pool.query(
    `${LOGIN_SELECT}${whereClause} ORDER BY la.created_at DESC LIMIT ? OFFSET ?`,
    [...values, args.limit, args.offset]
  );

  return buildListResult({
    args,
    rows: rows.map(normalizeLogin),
    total: Number(totalRow.total) || 0,
    filtered: Number(filteredRow.total) || 0,
  });
}

async function getLoginAuditById(id) {
  const [rows] = await pool.query(`${LOGIN_SELECT} WHERE la.id = ?`, [id]);
  return rows.length ? normalizeLogin(rows[0]) : null;
}

async function createLoginAudit(payload = {}) {
  const ua = payload.userAgent ? parseUserAgent(payload.userAgent) : null;
  const [result] = await pool.query(
    `INSERT INTO login_audit
      (user_id, email, session_id, status, failure_reason, ip_address, user_agent,
       browser, browser_version, os, device_type, device_vendor, login_at, logout_at, notes)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.userId ?? null,
      payload.email ?? null,
      payload.sessionId ?? null,
      payload.status === 'failed' ? 'failed' : 'success',
      payload.failureReason ?? null,
      payload.ipAddress ?? null,
      ua?.raw ?? payload.userAgent ?? null,
      ua?.browser ?? payload.browser ?? null,
      ua?.browserVersion ?? payload.browserVersion ?? null,
      ua?.os ?? payload.os ?? null,
      ua?.deviceType ?? payload.deviceType ?? null,
      ua?.deviceVendor ?? payload.deviceVendor ?? null,
      payload.loginAt ? new Date(payload.loginAt) : new Date(),
      payload.logoutAt ? new Date(payload.logoutAt) : null,
      payload.notes ?? null,
    ]
  );
  return getLoginAuditById(result.insertId);
}

async function updateLoginAudit(id, payload = {}) {
  const existing = await getLoginAuditById(id);
  if (!existing) return null;

  await pool.query(
    `UPDATE login_audit SET
      status = ?,
      failure_reason = ?,
      logout_at = ?,
      notes = ?
     WHERE id = ?`,
    [
      payload.status ?? existing.status,
      payload.failureReason !== undefined ? payload.failureReason : existing.failureReason,
      payload.logoutAt !== undefined
        ? payload.logoutAt
          ? new Date(payload.logoutAt)
          : null
        : existing.logoutAt,
      payload.notes !== undefined ? payload.notes : existing.notes,
      id,
    ]
  );
  return getLoginAuditById(id);
}

async function deleteLoginAudit(id) {
  const [result] = await pool.query('DELETE FROM login_audit WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function clearLoginAudits({ olderThanDays } = {}) {
  if (olderThanDays) {
    const [result] = await pool.query(
      'DELETE FROM login_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [Number(olderThanDays)]
    );
    return result.affectedRows;
  }
  const [result] = await pool.query('DELETE FROM login_audit');
  return result.affectedRows;
}

async function getLoginAuditStats() {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'success') AS successful,
       SUM(status = 'failed') AS failed,
       SUM(status = 'success' AND logout_at IS NULL) AS active,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS last24h
     FROM login_audit`
  );
  return {
    total: Number(totals.total) || 0,
    successful: Number(totals.successful) || 0,
    failed: Number(totals.failed) || 0,
    active: Number(totals.active) || 0,
    last24h: Number(totals.last24h) || 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Email audit CRUD                                                           */
/* -------------------------------------------------------------------------- */

const EMAIL_SELECT = `
  SELECT ea.*, u.name AS user_name
  FROM email_audit ea
  LEFT JOIN users u ON u.id = ea.user_id
`;

async function listEmailAudits(params = {}) {
  const args = paginationArgs(params);
  const conditions = [];
  const values = [];

  if (params.status) {
    conditions.push('ea.status = ?');
    values.push(params.status);
  }
  if (params.category) {
    conditions.push('ea.category = ?');
    values.push(params.category);
  }
  if (params.userId) {
    conditions.push('ea.user_id = ?');
    values.push(Number(params.userId));
  }
  const search = (params.search || '').trim();
  if (search) {
    conditions.push('(ea.recipient LIKE ? OR ea.subject LIKE ? OR ea.sender LIKE ? OR u.name LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like, like, like);
  }
  if (params.dateFrom) {
    conditions.push('DATE(ea.created_at) >= ?');
    values.push(params.dateFrom);
  }
  if (params.dateTo) {
    conditions.push('DATE(ea.created_at) <= ?');
    values.push(params.dateTo);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

  const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM email_audit');
  const [[filteredRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM email_audit ea LEFT JOIN users u ON u.id = ea.user_id${whereClause}`,
    values
  );

  const [rows] = await pool.query(
    `${EMAIL_SELECT}${whereClause} ORDER BY ea.created_at DESC LIMIT ? OFFSET ?`,
    [...values, args.limit, args.offset]
  );

  return buildListResult({
    args,
    rows: rows.map(normalizeEmail),
    total: Number(totalRow.total) || 0,
    filtered: Number(filteredRow.total) || 0,
  });
}

async function getEmailAuditById(id) {
  const [rows] = await pool.query(`${EMAIL_SELECT} WHERE ea.id = ?`, [id]);
  return rows.length ? normalizeEmail(rows[0]) : null;
}

async function createEmailAudit(payload = {}) {
  const id = await recordEmailEvent({
    userId: payload.userId ?? null,
    recipient: payload.recipient,
    sender: payload.sender ?? null,
    subject: payload.subject ?? null,
    body: payload.body ?? null,
    category: payload.category ?? 'general',
    provider: payload.provider ?? null,
    status: payload.status === 'failed' ? 'failed' : 'sent',
    providerMessageId: payload.providerMessageId ?? null,
    errorMessage: payload.errorMessage ?? null,
    metadata: payload.metadata ?? null,
  });
  if (!id) return null;
  if (payload.notes) {
    await pool.query('UPDATE email_audit SET notes = ? WHERE id = ?', [payload.notes, id]);
  }
  return getEmailAuditById(id);
}

async function updateEmailAudit(id, payload = {}) {
  const existing = await getEmailAuditById(id);
  if (!existing) return null;

  await pool.query(
    `UPDATE email_audit SET status = ?, error_message = ?, notes = ? WHERE id = ?`,
    [
      payload.status ?? existing.status,
      payload.errorMessage !== undefined ? payload.errorMessage : existing.errorMessage,
      payload.notes !== undefined ? payload.notes : existing.notes,
      id,
    ]
  );
  return getEmailAuditById(id);
}

async function deleteEmailAudit(id) {
  const [result] = await pool.query('DELETE FROM email_audit WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function clearEmailAudits({ olderThanDays } = {}) {
  if (olderThanDays) {
    const [result] = await pool.query(
      'DELETE FROM email_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [Number(olderThanDays)]
    );
    return result.affectedRows;
  }
  const [result] = await pool.query('DELETE FROM email_audit');
  return result.affectedRows;
}

async function getEmailAuditStats({ dateFrom, dateTo } = {}) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'sent') AS sent,
       SUM(status = 'failed') AS failed,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS last24h
     FROM email_audit`
  );

  const isCustomRange = Boolean(dateFrom || dateTo);
  const conditions = [];
  const values = [];
  if (dateFrom) {
    conditions.push('DATE(created_at) >= ?');
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('DATE(created_at) <= ?');
    values.push(dateTo);
  }
  if (!isCustomRange) {
    conditions.push('YEAR(created_at) = YEAR(CURDATE())', 'MONTH(created_at) = MONTH(CURDATE())');
  }

  const [[rangeTotals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'sent') AS sent,
       SUM(status = 'failed') AS failed
     FROM email_audit
     WHERE ${conditions.join(' AND ')}`,
    values
  );

  return {
    total: Number(totals.total) || 0,
    sent: Number(totals.sent) || 0,
    failed: Number(totals.failed) || 0,
    last24h: Number(totals.last24h) || 0,
    sentThisMonth: Number(rangeTotals.sent) || 0,
    failedThisMonth: Number(rangeTotals.failed) || 0,
    totalThisMonth: Number(rangeTotals.total) || 0,
    isCustomRange,
  };
}

/* -------------------------------------------------------------------------- */
/* SMS audit CRUD                                                             */
/* -------------------------------------------------------------------------- */

const SMS_SELECT = `
  SELECT sa.*, u.name AS user_name
  FROM sms_audit sa
  LEFT JOIN users u ON u.id = sa.user_id
`;

async function listSmsAudits(params = {}) {
  const args = paginationArgs(params);
  const conditions = [];
  const values = [];

  if (params.status) {
    conditions.push('sa.status = ?');
    values.push(params.status);
  }
  if (params.category) {
    conditions.push('sa.category = ?');
    values.push(params.category);
  }
  if (params.userId) {
    conditions.push('sa.user_id = ?');
    values.push(Number(params.userId));
  }
  const search = (params.search || '').trim();
  if (search) {
    conditions.push('(sa.recipient LIKE ? OR sa.message LIKE ? OR sa.sender_id LIKE ? OR u.name LIKE ?)');
    const like = `%${search}%`;
    values.push(like, like, like, like);
  }
  if (params.dateFrom) {
    conditions.push('DATE(sa.created_at) >= ?');
    values.push(params.dateFrom);
  }
  if (params.dateTo) {
    conditions.push('DATE(sa.created_at) <= ?');
    values.push(params.dateTo);
  }

  const whereClause = conditions.length ? ` WHERE ${conditions.join(' AND ')}` : '';

  const [[totalRow]] = await pool.query('SELECT COUNT(*) AS total FROM sms_audit');
  const [[filteredRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM sms_audit sa LEFT JOIN users u ON u.id = sa.user_id${whereClause}`,
    values
  );

  const [rows] = await pool.query(
    `${SMS_SELECT}${whereClause} ORDER BY sa.created_at DESC LIMIT ? OFFSET ?`,
    [...values, args.limit, args.offset]
  );

  return buildListResult({
    args,
    rows: rows.map(normalizeSms),
    total: Number(totalRow.total) || 0,
    filtered: Number(filteredRow.total) || 0,
  });
}

async function getSmsAuditById(id) {
  const [rows] = await pool.query(`${SMS_SELECT} WHERE sa.id = ?`, [id]);
  return rows.length ? normalizeSms(rows[0]) : null;
}

async function createSmsAudit(payload = {}) {
  const id = await recordSmsEvent({
    userId: payload.userId ?? null,
    recipient: payload.recipient,
    senderId: payload.senderId ?? null,
    message: payload.message ?? null,
    category: payload.category ?? 'general',
    provider: payload.provider ?? null,
    status: payload.status === 'failed' ? 'failed' : 'sent',
    providerMessageId: payload.providerMessageId ?? null,
    providerCode: payload.providerCode ?? null,
    errorMessage: payload.errorMessage ?? null,
  });
  if (!id) return null;
  if (payload.notes) {
    await pool.query('UPDATE sms_audit SET notes = ? WHERE id = ?', [payload.notes, id]);
  }
  return getSmsAuditById(id);
}

async function updateSmsAudit(id, payload = {}) {
  const existing = await getSmsAuditById(id);
  if (!existing) return null;

  await pool.query(
    `UPDATE sms_audit SET status = ?, error_message = ?, notes = ? WHERE id = ?`,
    [
      payload.status ?? existing.status,
      payload.errorMessage !== undefined ? payload.errorMessage : existing.errorMessage,
      payload.notes !== undefined ? payload.notes : existing.notes,
      id,
    ]
  );
  return getSmsAuditById(id);
}

async function deleteSmsAudit(id) {
  const [result] = await pool.query('DELETE FROM sms_audit WHERE id = ?', [id]);
  return result.affectedRows > 0;
}

async function clearSmsAudits({ olderThanDays } = {}) {
  if (olderThanDays) {
    const [result] = await pool.query(
      'DELETE FROM sms_audit WHERE created_at < DATE_SUB(NOW(), INTERVAL ? DAY)',
      [Number(olderThanDays)]
    );
    return result.affectedRows;
  }
  const [result] = await pool.query('DELETE FROM sms_audit');
  return result.affectedRows;
}

async function getSmsAuditStats({ dateFrom, dateTo } = {}) {
  const [[totals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'sent') AS sent,
       SUM(status = 'failed') AS failed,
       COALESCE(SUM(segments), 0) AS segments,
       SUM(created_at >= DATE_SUB(NOW(), INTERVAL 1 DAY)) AS last24h
     FROM sms_audit`
  );

  const isCustomRange = Boolean(dateFrom || dateTo);
  const conditions = [];
  const values = [];
  if (dateFrom) {
    conditions.push('DATE(created_at) >= ?');
    values.push(dateFrom);
  }
  if (dateTo) {
    conditions.push('DATE(created_at) <= ?');
    values.push(dateTo);
  }
  if (!isCustomRange) {
    conditions.push('YEAR(created_at) = YEAR(CURDATE())', 'MONTH(created_at) = MONTH(CURDATE())');
  }

  const [[rangeTotals]] = await pool.query(
    `SELECT
       COUNT(*) AS total,
       SUM(status = 'sent') AS sent,
       SUM(status = 'failed') AS failed
     FROM sms_audit
     WHERE ${conditions.join(' AND ')}`,
    values
  );

  return {
    total: Number(totals.total) || 0,
    sent: Number(totals.sent) || 0,
    failed: Number(totals.failed) || 0,
    segments: Number(totals.segments) || 0,
    last24h: Number(totals.last24h) || 0,
    sentThisMonth: Number(rangeTotals.sent) || 0,
    failedThisMonth: Number(rangeTotals.failed) || 0,
    totalThisMonth: Number(rangeTotals.total) || 0,
    isCustomRange,
  };
}

module.exports = {
  // recording (system-internal)
  recordLoginEvent,
  recordLogoutEvent,
  recordEmailEvent,
  recordSmsEvent,
  // login audit CRUD
  listLoginAudits,
  getLoginAuditById,
  createLoginAudit,
  updateLoginAudit,
  deleteLoginAudit,
  clearLoginAudits,
  getLoginAuditStats,
  // email audit CRUD
  listEmailAudits,
  getEmailAuditById,
  createEmailAudit,
  updateEmailAudit,
  deleteEmailAudit,
  clearEmailAudits,
  getEmailAuditStats,
  // sms audit CRUD
  listSmsAudits,
  getSmsAuditById,
  createSmsAudit,
  updateSmsAudit,
  deleteSmsAudit,
  clearSmsAudits,
  getSmsAuditStats,
};
