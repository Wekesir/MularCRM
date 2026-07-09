const pool = require('../db/pool');

function normalizeNotification(row) {
  return {
    id: row.id,
    title: row.title,
    message: row.message,
    type: row.type,
    read: Boolean(row.read_at),
    createdAt: row.created_at,
  };
}

async function resolveUserId(email) {
  const lookupEmail = email || 'admin@omnicrm.com';
  const [rows] = await pool.query('SELECT id FROM users WHERE email = ? LIMIT 1', [lookupEmail]);
  return rows[0]?.id ?? null;
}

async function getUnreadCount(email) {
  const userId = await resolveUserId(email);
  if (!userId) return 0;

  const [rows] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );

  return Number(rows[0].total) || 0;
}

async function listNotificationsPaginated({ email, page = 1, limit = 15 } = {}) {
  const userId = await resolveUserId(email);
  if (!userId) {
    return { data: [], page, limit, total: 0, hasMore: false };
  }

  const safeLimit = Math.min(Math.max(Number(limit) || 15, 1), 50);
  const safePage = Math.max(Number(page) || 1, 1);
  const offset = (safePage - 1) * safeLimit;

  const [countRows] = await pool.query(
    'SELECT COUNT(*) AS total FROM notifications WHERE user_id = ?',
    [userId]
  );
  const total = Number(countRows[0].total) || 0;

  const [rows] = await pool.query(
    `SELECT id, title, message, type, read_at, created_at
     FROM notifications
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ? OFFSET ?`,
    [userId, safeLimit, offset]
  );

  return {
    data: rows.map(normalizeNotification),
    page: safePage,
    limit: safeLimit,
    total,
    hasMore: offset + rows.length < total,
  };
}

async function markNotificationRead(id, email) {
  const userId = await resolveUserId(email);
  if (!userId) return false;

  const [result] = await pool.query(
    'UPDATE notifications SET read_at = COALESCE(read_at, CURRENT_TIMESTAMP) WHERE id = ? AND user_id = ?',
    [id, userId]
  );

  return result.affectedRows > 0;
}

async function markAllNotificationsRead(email) {
  const userId = await resolveUserId(email);
  if (!userId) return 0;

  const [result] = await pool.query(
    'UPDATE notifications SET read_at = CURRENT_TIMESTAMP WHERE user_id = ? AND read_at IS NULL',
    [userId]
  );

  return result.affectedRows;
}

async function createNotification({ userId, title, message, type = 'info' }) {
  if (!userId) return null;
  const safeTitle = String(title || '').slice(0, 255);
  const safeMessage = String(message || '');
  if (!safeTitle && !safeMessage) return null;

  const allowedTypes = ['info', 'success', 'warning'];
  const safeType = allowedTypes.includes(type) ? type : 'info';

  const [result] = await pool.query(
    'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)',
    [userId, safeTitle || null, safeMessage, safeType]
  );
  return { id: result.insertId, userId, title: safeTitle, message: safeMessage, type: safeType };
}

module.exports = {
  getUnreadCount,
  listNotificationsPaginated,
  markNotificationRead,
  markAllNotificationsRead,
  createNotification,
};
