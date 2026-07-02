const crypto = require('crypto');
const pool = require('../db/pool');
const {
  getUserByEmail,
  getRoleById,
  getEffectivePermissions,
} = require('./accessControlService');

const UNLOCK_TTL_MS = 8 * 60 * 60 * 1000;

function slugToPermissionKey(slug) {
  return slug.replace(/-/g, '_');
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (!stored || !password) return false;
  const [salt, hash] = stored.split(':');
  if (!salt || !hash) return false;
  const hashVerify = crypto.scryptSync(password, salt, 64).toString('hex');
  return crypto.timingSafeEqual(Buffer.from(hash, 'hex'), Buffer.from(hashVerify, 'hex'));
}

function createUnlockToken(userId, reportSlug) {
  const expiresAt = Date.now() + UNLOCK_TTL_MS;
  const payload = `${userId}:${reportSlug}:${expiresAt}`;
  const signature = crypto
    .createHmac('sha256', process.env.REPORT_UNLOCK_SECRET || 'omnicrm-report-unlock-dev')
    .update(payload)
    .digest('hex');
  return {
    token: Buffer.from(`${payload}:${signature}`).toString('base64url'),
    expiresAt: new Date(expiresAt).toISOString(),
  };
}

function verifyUnlockToken(token, userId, reportSlug) {
  if (!token) return false;
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const parts = decoded.split(':');
    if (parts.length < 4) return false;

    const signature = parts.pop();
    const expiresAt = Number(parts.pop());
    const slug = parts.pop();
    const uid = Number(parts.join(':'));

    if (uid !== userId || slug !== reportSlug) return false;
    if (Date.now() > expiresAt) return false;

    const payload = `${uid}:${slug}:${expiresAt}`;
    const expected = crypto
      .createHmac('sha256', process.env.REPORT_UNLOCK_SECRET || 'omnicrm-report-unlock-dev')
      .update(payload)
      .digest('hex');

    return crypto.timingSafeEqual(Buffer.from(signature, 'hex'), Buffer.from(expected, 'hex'));
  } catch {
    return false;
  }
}

async function getUserContext(email) {
  const user = await getUserByEmail(email);
  if (!user || !user.isActive) return null;

  const role = await getRoleById(user.roleId);
  if (!role) return null;

  const permissions = getEffectivePermissions(
    { isSystemAdmin: role.isSystemAdmin, permissions: role.permissions },
    user.permissionOverrides
  );

  return {
    userId: user.id,
    email: user.email,
    isSystemAdmin: role.isSystemAdmin,
    permissions,
  };
}

function canReadReport(context, slug) {
  if (!context) return false;
  if (context.isSystemAdmin) return true;

  const modulePerms = context.permissions?.reporting_analytics;
  if (!modulePerms) return false;

  // Legacy flat module permission (before per-report submodules)
  if (modulePerms.read === true) return true;

  const key = slugToPermissionKey(slug);
  return Boolean(modulePerms[key]?.read);
}

async function getReportPasswordHash(slug) {
  const [rows] = await pool.query(
    'SELECT password_hash FROM report_access WHERE report_slug = ? LIMIT 1',
    [slug]
  );
  return rows[0]?.password_hash ?? null;
}

async function getReportGateStatus(email, slug, unlockToken = null) {
  const context = await getUserContext(email);
  const canRead = canReadReport(context, slug);
  const passwordHash = await getReportPasswordHash(slug);
  const requiresPassword = Boolean(passwordHash);
  const unlocked =
    canRead &&
    (!requiresPassword ||
      verifyUnlockToken(unlockToken, context?.userId, slug));

  return {
    canRead,
    requiresPassword,
    unlocked: Boolean(unlocked),
    isSystemAdmin: Boolean(context?.isSystemAdmin),
  };
}

async function unlockReport(email, slug, password) {
  const context = await getUserContext(email);
  if (!context) {
    return { ok: false, error: 'User not found' };
  }

  if (!canReadReport(context, slug)) {
    return { ok: false, error: 'You do not have permission to access this report' };
  }

  const passwordHash = await getReportPasswordHash(slug);
  if (passwordHash && !verifyPassword(password, passwordHash)) {
    return { ok: false, error: 'Incorrect report password' };
  }

  if (!passwordHash) {
    return {
      ok: true,
      requiresPassword: false,
      unlocked: true,
      token: null,
      expiresAt: null,
    };
  }

  const { token, expiresAt } = createUnlockToken(context.userId, slug);
  return {
    ok: true,
    requiresPassword: true,
    unlocked: true,
    token,
    expiresAt,
  };
}

async function listReportAccessSettings() {
  const [rows] = await pool.query(
    'SELECT report_slug, password_hash IS NOT NULL AS password_set, updated_at FROM report_access ORDER BY report_slug ASC'
  );
  return rows.map((row) => ({
    slug: row.report_slug,
    passwordSet: Boolean(row.password_set),
    updatedAt: row.updated_at,
  }));
}

async function setReportPassword(slug, password) {
  if (!password || password.length < 6) {
    throw new Error('Password must be at least 6 characters');
  }

  const hash = hashPassword(password);
  await pool.query(
    `INSERT INTO report_access (report_slug, password_hash)
     VALUES (?, ?)
     ON DUPLICATE KEY UPDATE password_hash = VALUES(password_hash), updated_at = CURRENT_TIMESTAMP`,
    [slug, hash]
  );

  return { slug, passwordSet: true };
}

async function clearReportPassword(slug) {
  await pool.query('DELETE FROM report_access WHERE report_slug = ?', [slug]);
  return { slug, passwordSet: false };
}

async function getUserPermissionsByEmail(email) {
  const context = await getUserContext(email);
  if (!context) return null;

  return {
    userId: context.userId,
    email: context.email,
    isSystemAdmin: context.isSystemAdmin,
    permissions: context.permissions,
  };
}

module.exports = {
  slugToPermissionKey,
  canReadReport,
  getReportGateStatus,
  unlockReport,
  listReportAccessSettings,
  setReportPassword,
  clearReportPassword,
  getUserPermissionsByEmail,
  verifyUnlockToken,
};
