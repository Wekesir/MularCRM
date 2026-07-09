const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const pool = require('../db/pool');
const {
  getUserByEmail,
  getUserById,
  getUserEffectivePermissions,
} = require('./userService');
const { hashPassword, verifyPassword, hashToken } = require('./passwordService');
const { sendOtpEmail, sendPasswordResetEmail, isEmailConfigured } = require('./emailService');
const { sendOtpSms } = require('./smsService');
const { getSystemConfig } = require('./systemConfigService');
const { recordLoginEvent, recordLogoutEvent } = require('./auditService');

const OTP_TTL_MINUTES = 10;
const OTP_MAX_ATTEMPTS = 5;
const RESET_TOKEN_TTL_HOURS = 1;
const JWT_SECRET = process.env.JWT_SECRET || 'omnicrm-dev-jwt-secret-change-me';
const SESSION_TIMEZONE = process.env.AUTH_SESSION_TIMEZONE || 'Africa/Nairobi';

const rateLimitStore = new Map();

function checkRateLimit(key, maxAttempts, windowMs) {
  const now = Date.now();
  const entry = rateLimitStore.get(key) || { count: 0, resetAt: now + windowMs };
  if (now > entry.resetAt) {
    entry.count = 0;
    entry.resetAt = now + windowMs;
  }
  entry.count += 1;
  rateLimitStore.set(key, entry);
  return entry.count <= maxAttempts;
}

function formatDateInTimezone(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function getMidnightExpiryTimestamp(timeZone = SESSION_TIMEZONE) {
  const now = new Date();
  const todayStr = formatDateInTimezone(now, timeZone);
  let ts = now.getTime();

  while (formatDateInTimezone(new Date(ts), timeZone) === todayStr) {
    ts += 60_000;
  }

  return Math.floor(ts / 1000);
}

function getMidnightExpiryIso(timeZone = SESSION_TIMEZONE) {
  return new Date(getMidnightExpiryTimestamp(timeZone) * 1000).toISOString();
}

function generateOtpCode() {
  return String(crypto.randomInt(100000, 999999));
}

function maskEmail(email) {
  if (!email || !email.includes('@')) return '***';
  const [local, domain] = email.split('@');
  const visible = local.slice(0, 1);
  return `${visible}***@${domain}`;
}

async function getUserAuthRow(email) {
  const [rows] = await pool.query(
    `SELECT u.*, r.name AS role_name, r.is_system_admin
     FROM users u
     JOIN roles r ON u.role_id = r.id
     WHERE LOWER(u.email) = ?
     LIMIT 1`,
    [email.trim().toLowerCase()]
  );
  return rows[0] || null;
}

async function createOtpChallenge(userId) {
  const code = generateOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  const [result] = await pool.query(
    `INSERT INTO otp_challenges (user_id, code_hash, purpose, expires_at)
     VALUES (?, ?, 'login', ?)`,
    [userId, codeHash, expiresAt]
  );

  return { challengeId: result.insertId, code, expiresAt };
}

function getOtpEmailRecipient(userEmail) {
  const devRedirect = process.env.AUTH_DEV_OTP_EMAIL?.trim();
  if (devRedirect && process.env.NODE_ENV !== 'production') {
    return devRedirect;
  }
  return userEmail;
}

async function deliverOtp(user, code) {
  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  const otpTo = getOtpEmailRecipient(user.email);

  await sendOtpEmail({ to: otpTo, code, expiresMinutes: OTP_TTL_MINUTES, userId: user.id });

  if (otpTo !== user.email && process.env.NODE_ENV !== 'production') {
    console.info(`[auth] OTP for ${user.email} delivered to dev redirect ${otpTo}`);
  }

  let smsSent = false;
  if (user.phone) {
    const smsResult = await sendOtpSms({ to: user.phone, code, businessName, userId: user.id });
    smsSent = Boolean(smsResult.sent);
  }

  return { smsSent };
}

function buildAuthUser(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    roleId: row.role_id,
    roleName: row.role_name,
    isSystemAdmin: Boolean(row.is_system_admin),
    isActive: Boolean(row.is_active),
    mustResetPassword: Boolean(row.must_reset_password),
    avatar: '',
  };
}

function signSessionToken(user) {
  const exp = getMidnightExpiryTimestamp();
  const sessionId = crypto.randomBytes(16).toString('hex');
  const token = jwt.sign(
    {
      userId: user.id,
      email: user.email,
      sid: sessionId,
    },
    JWT_SECRET,
    { expiresIn: exp - Math.floor(Date.now() / 1000) }
  );

  return {
    token,
    expiresAt: new Date(exp * 1000).toISOString(),
    sessionId,
  };
}

async function login({ email, password, ip = 'unknown', context = {} }) {
  const normalizedEmail = email.trim().toLowerCase();
  const rateKey = `login:${normalizedEmail}:${ip}`;
  const auditContext = { ip, ...context };

  if (!checkRateLimit(rateKey, 10, 15 * 60 * 1000)) {
    const error = new Error('Too many login attempts. Try again later.');
    error.status = 429;
    throw error;
  }

  const row = await getUserAuthRow(normalizedEmail);
  if (!row || !row.is_active) {
    await recordLoginEvent({
      userId: row?.id ?? null,
      email: normalizedEmail,
      status: 'failed',
      failureReason: row ? 'Account is inactive' : 'Unknown email',
      context: auditContext,
    });
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  if (!row.password_hash || !verifyPassword(password, row.password_hash)) {
    await recordLoginEvent({
      userId: row.id,
      email: normalizedEmail,
      status: 'failed',
      failureReason: 'Invalid password',
      context: auditContext,
    });
    const error = new Error('Invalid email or password');
    error.status = 401;
    throw error;
  }

  const config = await getSystemConfig({ mask: false });
  const otpRequired = config.auth?.otpOnLogin !== false;

  if (otpRequired) {
    const emailReady = await isEmailConfigured(config);
    if (!emailReady) {
      const error = new Error('Email delivery is not configured. Contact your administrator.');
      error.status = 503;
      throw error;
    }

    const { challengeId, code } = await createOtpChallenge(row.id);
    const { smsSent } = await deliverOtp(row, code);

    return {
      challengeId,
      maskedEmail: maskEmail(row.email),
      smsSent,
      otpRequired: true,
    };
  }

  const user = buildAuthUser(row);
  const session = signSessionToken(user);
  const permissions = await getUserEffectivePermissions(user.id);

  await recordLoginEvent({
    userId: user.id,
    email: user.email,
    sessionId: session.sessionId,
    status: 'success',
    context: auditContext,
  });

  return {
    ...session,
    user,
    permissions,
    isSystemAdmin: user.isSystemAdmin,
    otpRequired: false,
  };
}

async function getOtpChallenge(challengeId) {
  const [rows] = await pool.query(
    `SELECT c.*, u.email, u.phone, u.name, u.is_active
     FROM otp_challenges c
     JOIN users u ON u.id = c.user_id
     WHERE c.id = ?
     LIMIT 1`,
    [challengeId]
  );
  return rows[0] || null;
}

async function verifyOtp({ challengeId, code, ip = 'unknown', context = {} }) {
  const rateKey = `otp:${challengeId}:${ip}`;
  const auditContext = { ip, ...context };

  if (!checkRateLimit(rateKey, 15, 15 * 60 * 1000)) {
    const error = new Error('Too many verification attempts. Try again later.');
    error.status = 429;
    throw error;
  }

  const challenge = await getOtpChallenge(challengeId);
  if (!challenge || !challenge.is_active) {
    const error = new Error('Invalid or expired verification code');
    error.status = 401;
    throw error;
  }

  if (new Date(challenge.expires_at).getTime() < Date.now()) {
    await recordLoginEvent({
      userId: challenge.user_id,
      email: challenge.email,
      status: 'failed',
      failureReason: 'Verification code expired',
      context: auditContext,
    });
    const error = new Error('Verification code has expired');
    error.status = 401;
    throw error;
  }

  if (challenge.attempts >= OTP_MAX_ATTEMPTS) {
    await recordLoginEvent({
      userId: challenge.user_id,
      email: challenge.email,
      status: 'failed',
      failureReason: 'Too many OTP attempts',
      context: auditContext,
    });
    const error = new Error('Too many failed attempts. Request a new code.');
    error.status = 401;
    throw error;
  }

  const codeHash = hashToken(String(code).trim());
  if (codeHash !== challenge.code_hash) {
    await pool.query('UPDATE otp_challenges SET attempts = attempts + 1 WHERE id = ?', [
      challengeId,
    ]);
    await recordLoginEvent({
      userId: challenge.user_id,
      email: challenge.email,
      status: 'failed',
      failureReason: 'Invalid verification code',
      context: auditContext,
    });
    const error = new Error('Invalid verification code');
    error.status = 401;
    throw error;
  }

  await pool.query('DELETE FROM otp_challenges WHERE id = ?', [challengeId]);

  const userRow = await getUserAuthRow(challenge.email);
  const user = buildAuthUser(userRow);
  const session = signSessionToken(user);
  const permissions = await getUserEffectivePermissions(user.id);

  await recordLoginEvent({
    userId: user.id,
    email: user.email,
    sessionId: session.sessionId,
    status: 'success',
    context: auditContext,
  });

  return {
    ...session,
    user,
    permissions,
    isSystemAdmin: user.isSystemAdmin,
  };
}

async function resendOtp({ challengeId, ip = 'unknown' }) {
  const rateKey = `resend:${challengeId}:${ip}`;
  if (!checkRateLimit(rateKey, 3, 15 * 60 * 1000)) {
    const error = new Error('Too many resend attempts. Try again later.');
    error.status = 429;
    throw error;
  }

  const challenge = await getOtpChallenge(challengeId);
  if (!challenge || !challenge.is_active) {
    const error = new Error('Verification session expired. Sign in again.');
    error.status = 401;
    throw error;
  }

  const code = generateOtpCode();
  const codeHash = hashToken(code);
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await pool.query(
    `UPDATE otp_challenges SET code_hash = ?, attempts = 0, expires_at = ? WHERE id = ?`,
    [codeHash, expiresAt, challengeId]
  );

  const { smsSent } = await deliverOtp(challenge, code);

  return {
    maskedEmail: maskEmail(challenge.email),
    smsSent,
  };
}

async function forgotPassword({ email, ip = 'unknown' }) {
  const normalizedEmail = email.trim().toLowerCase();
  const rateKey = `forgot:${normalizedEmail}:${ip}`;

  if (!checkRateLimit(rateKey, 5, 60 * 60 * 1000)) {
    const error = new Error('Too many reset requests. Try again later.');
    error.status = 429;
    throw error;
  }

  const row = await getUserAuthRow(normalizedEmail);
  if (row && row.is_active) {
    const emailReady = await isEmailConfigured(await getSystemConfig({ mask: false }));
    if (emailReady) {
      const token = crypto.randomBytes(32).toString('hex');
      const tokenHash = hashToken(token);
      const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_HOURS * 60 * 60 * 1000);

      await pool.query(
        `INSERT INTO password_reset_tokens (user_id, token_hash, expires_at) VALUES (?, ?, ?)`,
        [row.id, tokenHash, expiresAt]
      );

      await sendPasswordResetEmail({ to: row.email, token, userId: row.id });
    }
  }

  return {
    message: 'If an account exists for that email, we sent a password reset link.',
  };
}

async function resetPassword({ token, newPassword }) {
  if (!newPassword || newPassword.length < 8) {
    const error = new Error('Password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const tokenHash = hashToken(token);
  const [rows] = await pool.query(
    `SELECT t.*, u.email
     FROM password_reset_tokens t
     JOIN users u ON u.id = t.user_id
     WHERE t.token_hash = ? AND t.used_at IS NULL
     LIMIT 1`,
    [tokenHash]
  );

  const resetRow = rows[0];
  if (!resetRow || new Date(resetRow.expires_at).getTime() < Date.now()) {
    const error = new Error('Invalid or expired reset link');
    error.status = 400;
    throw error;
  }

  const passwordHash = hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = ?, must_reset_password = FALSE WHERE id = ?', [
    passwordHash,
    resetRow.user_id,
  ]);
  await pool.query('UPDATE password_reset_tokens SET used_at = NOW() WHERE id = ?', [
    resetRow.id,
  ]);

  return { message: 'Password updated successfully' };
}

async function changePassword(userId, { currentPassword, newPassword }) {
  if (!newPassword || newPassword.length < 8) {
    const error = new Error('New password must be at least 8 characters');
    error.status = 400;
    throw error;
  }

  const [rows] = await pool.query('SELECT password_hash FROM users WHERE id = ? LIMIT 1', [
    userId,
  ]);
  const row = rows[0];
  if (!row?.password_hash || !verifyPassword(currentPassword, row.password_hash)) {
    const error = new Error('Current password is incorrect');
    error.status = 401;
    throw error;
  }

  const passwordHash = hashPassword(newPassword);
  await pool.query('UPDATE users SET password_hash = ?, must_reset_password = FALSE WHERE id = ?', [
    passwordHash,
    userId,
  ]);

  return { message: 'Password updated successfully' };
}

async function getMe(userId) {
  const user = await getUserById(userId);
  if (!user) return null;

  const [rows] = await pool.query(
    'SELECT phone, must_reset_password FROM users WHERE id = ? LIMIT 1',
    [userId]
  );
  const extra = rows[0] || {};

  return {
    id: user.id,
    name: user.name,
    email: user.email,
    phone: extra.phone || null,
    roleId: user.roleId,
    roleName: user.roleName,
    isSystemAdmin: user.isSystemAdmin,
    isActive: user.isActive,
    mustResetPassword: Boolean(extra.must_reset_password),
    avatar: '',
  };
}

function verifySessionToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

async function logout({ sessionId = null, userId = null } = {}) {
  await recordLogoutEvent({ sessionId, userId });
  return { message: 'Signed out' };
}

module.exports = {
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  logout,
  verifySessionToken,
  getMidnightExpiryIso,
  buildAuthUser,
  signSessionToken,
};
