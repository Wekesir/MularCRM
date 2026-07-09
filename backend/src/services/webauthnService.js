const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');
const { isoBase64URL } = require('@simplewebauthn/server/helpers');
const pool = require('../db/pool');
const { getUserEffectivePermissions } = require('./userService');
const { getSystemConfig } = require('./systemConfigService');
const { recordLoginEvent } = require('./auditService');
const { buildAuthUser, signSessionToken } = require('./authService');

const CHALLENGE_TTL_MS = 5 * 60 * 1000;

function getRpConfig() {
  const frontendUrl = process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173';
  let origin = frontendUrl.replace(/\/$/, '');
  let rpID = process.env.WEBAUTHN_RP_ID?.trim();

  try {
    const parsed = new URL(origin);
    origin = parsed.origin;
    if (!rpID) {
      rpID = parsed.hostname;
    }
  } catch {
    if (!rpID) rpID = 'localhost';
  }

  return {
    rpID,
    rpName: process.env.WEBAUTHN_RP_NAME?.trim() || 'OMNICRM',
    origin,
  };
}

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function encodePublicKey(publicKey) {
  return isoBase64URL.fromBuffer(publicKey);
}

function decodePublicKey(stored) {
  return isoBase64URL.toBuffer(stored);
}

function parseTransports(value) {
  if (!value) return undefined;
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    try {
      const parsed = JSON.parse(value);
      return Array.isArray(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  return undefined;
}

async function storeChallenge({ userId = null, challenge, purpose }) {
  const expiresAt = new Date(Date.now() + CHALLENGE_TTL_MS);
  await pool.query(
    `INSERT INTO webauthn_challenges (user_id, challenge, purpose, expires_at)
     VALUES (?, ?, ?, ?)`,
    [userId, challenge, purpose, expiresAt]
  );
}

async function consumeLatestChallenge({ purpose, userId = null, challenge = null }) {
  let rows;
  if (challenge) {
    [rows] = await pool.query(
      `SELECT * FROM webauthn_challenges
       WHERE challenge = ? AND purpose = ? AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [challenge, purpose]
    );
  } else if (userId != null) {
    [rows] = await pool.query(
      `SELECT * FROM webauthn_challenges
       WHERE user_id = ? AND purpose = ? AND expires_at > NOW()
       ORDER BY id DESC
       LIMIT 1`,
      [userId, purpose]
    );
  } else {
    throw httpError('Passkey challenge expired or invalid. Try again.', 400);
  }

  const row = rows[0];
  if (!row) {
    throw httpError('Passkey challenge expired or invalid. Try again.', 400);
  }
  if (userId != null && row.user_id != null && Number(row.user_id) !== Number(userId)) {
    throw httpError('Passkey challenge does not match this user.', 400);
  }

  await pool.query('DELETE FROM webauthn_challenges WHERE id = ?', [row.id]);
  await pool.query('DELETE FROM webauthn_challenges WHERE expires_at <= NOW()');
  return row;
}

async function listCredentialsForUser(userId) {
  const [rows] = await pool.query(
    `SELECT id, credential_id, public_key, counter, transports, device_name, created_at, last_used_at
     FROM webauthn_credentials
     WHERE user_id = ?
     ORDER BY created_at DESC`,
    [userId]
  );
  return rows;
}

async function getCredentialByCredentialId(credentialId) {
  const [rows] = await pool.query(
    `SELECT
       c.id AS credential_db_id,
       c.credential_id,
       c.public_key,
       c.counter,
       c.transports,
       u.id,
       u.name,
       u.email,
       u.phone,
       u.role_id,
       u.is_active,
       u.must_reset_password,
       u.deleted_at,
       r.name AS role_name,
       r.is_system_admin
     FROM webauthn_credentials c
     JOIN users u ON u.id = c.user_id
     JOIN roles r ON u.role_id = r.id
     WHERE c.credential_id = ?
     LIMIT 1`,
    [credentialId]
  );
  return rows[0] || null;
}

async function getRegistrationOptions(user) {
  const { rpID, rpName } = getRpConfig();
  let displayRpName = rpName;
  try {
    const config = await getSystemConfig({ mask: true });
    if (config.business?.name) displayRpName = config.business.name;
  } catch {
    /* keep default */
  }

  const existing = await listCredentialsForUser(user.id);
  const options = await generateRegistrationOptions({
    rpName: displayRpName,
    rpID,
    userName: user.email,
    userDisplayName: user.name || user.email,
    userID: new TextEncoder().encode(String(user.id)),
    attestationType: 'none',
    excludeCredentials: existing.map((cred) => ({
      id: cred.credential_id,
      transports: parseTransports(cred.transports),
    })),
    // Prefer local platform authenticator (fingerprint / Face ID / Windows Hello)
    // over synced Google Password Manager passkeys.
    authenticatorSelection: {
      authenticatorAttachment: 'platform',
      residentKey: 'discouraged',
      requireResidentKey: false,
      userVerification: 'required',
    },
  });

  // Browser hint (not yet a SimpleWebAuthn generate* arg) — prefer this device.
  options.hints = ['client-device'];

  await storeChallenge({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'registration',
  });

  return options;
}

async function verifyRegistration({ user, response, deviceName }) {
  const { rpID, origin } = getRpConfig();
  const challengeRow = await consumeLatestChallenge({
    purpose: 'registration',
    userId: user.id,
  });

  let verification;
  try {
    verification = await verifyRegistrationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
    });
  } catch (error) {
    throw httpError(error.message || 'Passkey registration failed', 400);
  }

  const { verified, registrationInfo } = verification;
  if (!verified || !registrationInfo?.credential) {
    throw httpError('Passkey registration could not be verified', 400);
  }

  const { credential, credentialDeviceType, credentialBackedUp } = registrationInfo;
  const transports = credential.transports || response.transports || [];

  // Synced / multi-device passkeys (e.g. Google Password Manager) unlock with a
  // Google PIN, not the laptop fingerprint reader. Reject them so users re-try
  // with a local platform authenticator when the OS/browser can provide one.
  if (credentialBackedUp || credentialDeviceType === 'multiDevice') {
    throw httpError(
      'Chrome created a synced Google Password Manager passkey, which unlocks with a Google PIN — not your laptop fingerprint. Remove any localhost passkey from Chrome → Password Manager, then try again and choose this device if offered. On Linux, Chrome often cannot use the fingerprint sensor for WebAuthn; try Windows/macOS, or use password + OTP.',
      400
    );
  }

  const label =
    (deviceName && String(deviceName).trim().slice(0, 255)) ||
    `${credentialDeviceType || 'device'}`;

  try {
    const [result] = await pool.query(
      `INSERT INTO webauthn_credentials
         (user_id, credential_id, public_key, counter, transports, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        credential.id,
        encodePublicKey(credential.publicKey),
        credential.counter ?? 0,
        JSON.stringify(transports),
        label,
      ]
    );

    return {
      id: result.insertId,
      deviceName: label,
      createdAt: new Date().toISOString(),
    };
  } catch (error) {
    if (error.code === 'ER_DUP_ENTRY') {
      throw httpError('This passkey is already registered', 409);
    }
    throw error;
  }
}

async function getAuthenticationOptions({ email } = {}) {
  const { rpID } = getRpConfig();

  if (!email?.trim()) {
    throw httpError('Enter your email to sign in with fingerprint', 400);
  }

  const normalized = email.trim().toLowerCase();
  const [rows] = await pool.query(
    `SELECT u.id, u.is_active, u.deleted_at
     FROM users u
     WHERE LOWER(u.email) = ?
     LIMIT 1`,
    [normalized]
  );
  const user = rows[0];
  if (!user || !user.is_active || user.deleted_at) {
    throw httpError('No passkey is registered for this account', 404);
  }

  const credentials = await listCredentialsForUser(user.id);
  if (!credentials.length) {
    throw httpError('No passkey is registered for this account', 404);
  }

  const allowCredentials = credentials.map((cred) => {
    const stored = parseTransports(cred.transports);
    // Drop hybrid/cable transports that steer Chrome toward phone/GPM flows.
    const transports = (stored || ['internal']).filter((t) => t === 'internal');
    return {
      id: cred.credential_id,
      transports: transports.length ? transports : ['internal'],
    };
  });

  const options = await generateAuthenticationOptions({
    rpID,
    allowCredentials,
    userVerification: 'required',
  });

  // Prefer this device's platform authenticator over Google Password Manager.
  options.hints = ['client-device'];

  await storeChallenge({
    userId: user.id,
    challenge: options.challenge,
    purpose: 'authentication',
  });

  return options;
}

async function verifyAuthentication({ response, ip = 'unknown', context = {} }) {
  const { rpID, origin } = getRpConfig();
  const credentialId = response?.id;
  if (!credentialId) {
    throw httpError('Invalid passkey response', 400);
  }

  const credRow = await getCredentialByCredentialId(credentialId);
  if (!credRow || !credRow.is_active || credRow.deleted_at) {
    throw httpError('Passkey not recognized', 401);
  }

  let clientChallenge;
  try {
    const clientData = JSON.parse(
      Buffer.from(isoBase64URL.toBuffer(response.response.clientDataJSON)).toString('utf8')
    );
    clientChallenge = clientData.challenge;
  } catch {
    throw httpError('Invalid passkey response', 400);
  }

  const challengeRow = await consumeLatestChallenge({
    challenge: clientChallenge,
    purpose: 'authentication',
  });

  if (challengeRow.user_id != null && Number(challengeRow.user_id) !== Number(credRow.id)) {
    throw httpError('Passkey challenge does not match this credential', 400);
  }

  let verification;
  try {
    verification = await verifyAuthenticationResponse({
      response,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: origin,
      expectedRPID: rpID,
      requireUserVerification: true,
      credential: {
        id: credRow.credential_id,
        publicKey: decodePublicKey(credRow.public_key),
        counter: Number(credRow.counter),
        transports: parseTransports(credRow.transports),
      },
    });
  } catch (error) {
    await recordLoginEvent({
      userId: credRow.id,
      email: credRow.email,
      status: 'failed',
      failureReason: 'Passkey verification failed',
      context: { ip, ...context },
    });
    throw httpError(error.message || 'Passkey sign-in failed', 401);
  }

  const { verified, authenticationInfo } = verification;
  if (!verified) {
    throw httpError('Passkey sign-in could not be verified', 401);
  }

  await pool.query(
    `UPDATE webauthn_credentials
     SET counter = ?, last_used_at = NOW()
     WHERE id = ?`,
    [authenticationInfo.newCounter, credRow.credential_db_id]
  );

  const user = buildAuthUser(credRow);
  const session = signSessionToken(user);
  const permissions = await getUserEffectivePermissions(user.id);

  await recordLoginEvent({
    userId: user.id,
    email: user.email,
    sessionId: session.sessionId,
    status: 'success',
    context: { ip, ...context },
  });

  return {
    ...session,
    user,
    permissions,
    isSystemAdmin: user.isSystemAdmin,
    otpRequired: false,
  };
}

async function listUserPasskeys(userId) {
  const rows = await listCredentialsForUser(userId);
  return rows.map((row) => ({
    id: row.id,
    deviceName: row.device_name || 'Device',
    createdAt: row.created_at,
    lastUsedAt: row.last_used_at,
    transports: parseTransports(row.transports) || [],
  }));
}

async function deleteUserPasskey(userId, credentialDbId) {
  const [result] = await pool.query(
    `DELETE FROM webauthn_credentials WHERE id = ? AND user_id = ?`,
    [credentialDbId, userId]
  );
  if (result.affectedRows === 0) {
    throw httpError('Passkey not found', 404);
  }
  return { message: 'Passkey removed' };
}

module.exports = {
  getRpConfig,
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listUserPasskeys,
  deleteUserPasskey,
};
