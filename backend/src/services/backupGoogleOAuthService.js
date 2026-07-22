const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { google } = require('googleapis');
const pool = require('../db/pool');
const { getSystemConfig, updateSystemConfig } = require('./systemConfigService');

const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive';
const STATE_TTL_SEC = 15 * 60;

function httpError(message, status = 400) {
  const error = new Error(message);
  error.status = status;
  return error;
}

function getJwtSecret() {
  return process.env.JWT_SECRET || 'omnicrm-dev-jwt-secret-change-me';
}

function getBackendPublicUrl() {
  const explicit = (process.env.BACKEND_PUBLIC_URL || '').trim().replace(/\/$/, '');
  if (explicit) return explicit;
  const port = process.env.PORT || process.env.BACKEND_PORT || 3000;
  return `http://localhost:${port}`;
}

function getFrontendBackupUrl() {
  const base = (process.env.FRONTEND_URL || process.env.CORS_ORIGIN || 'http://localhost:5173')
    .trim()
    .replace(/\/$/, '');
  return `${base}/system-configurations/database-backup`;
}

function getOAuthRedirectUri() {
  return `${getBackendPublicUrl()}/api/backup/google/callback`;
}

function resolveOAuthClientConfig(googleDrive = {}) {
  const clientId =
    (googleDrive.oauthClientId || '').trim() ||
    (process.env.GOOGLE_BACKUP_OAUTH_CLIENT_ID || '').trim();
  const clientSecret =
    (googleDrive.oauthClientSecret || '').trim() ||
    (process.env.GOOGLE_BACKUP_OAUTH_CLIENT_SECRET || '').trim();

  return {
    clientId,
    clientSecret,
    redirectUri: getOAuthRedirectUri(),
  };
}

function createOAuth2Client(googleDrive = {}) {
  const { clientId, clientSecret, redirectUri } = resolveOAuthClientConfig(googleDrive);
  if (!clientId || !clientSecret) {
    throw httpError(
      'Google OAuth client ID and secret are required. Add them under Backup settings or set GOOGLE_BACKUP_OAUTH_CLIENT_ID / GOOGLE_BACKUP_OAUTH_CLIENT_SECRET.',
      400
    );
  }
  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}

function hasOwnerOAuth(googleDrive = {}) {
  return Boolean((googleDrive.oauthRefreshToken || '').trim());
}

async function getOwnerDriveClient(googleDrive = {}) {
  if (!hasOwnerOAuth(googleDrive)) {
    throw httpError(
      'Backup owner Google account is not connected. Click Connect Google account once to enable auto ownership acceptance.',
      400
    );
  }

  const oauth2Client = createOAuth2Client(googleDrive);
  oauth2Client.setCredentials({
    refresh_token: googleDrive.oauthRefreshToken,
  });

  // Refresh proactively so failures surface early.
  await oauth2Client.getAccessToken();
  return google.drive({ version: 'v3', auth: oauth2Client });
}

function getOAuthStatus(googleDrive = {}) {
  const { clientId, clientSecret, redirectUri } = resolveOAuthClientConfig(googleDrive);
  // Masked configs expose oauthRefreshTokenSet instead of the token value.
  const connected =
    hasOwnerOAuth(googleDrive) || Boolean(googleDrive.oauthRefreshTokenSet);
  return {
    connected,
    connectedEmail: googleDrive.oauthConnectedEmail || null,
    clientConfigured: Boolean(
      clientId &&
        (clientSecret ||
          googleDrive.oauthClientSecretSet ||
          (process.env.GOOGLE_BACKUP_OAUTH_CLIENT_SECRET || '').trim())
    ),
    clientIdSet: Boolean(clientId),
    clientSecretSet: Boolean(
      (googleDrive.oauthClientSecret || '').trim() ||
        googleDrive.oauthClientSecretSet ||
        (process.env.GOOGLE_BACKUP_OAUTH_CLIENT_SECRET || '').trim()
    ),
    redirectUri,
  };
}

function buildAuthUrl({ userId, googleDrive }) {
  const oauth2Client = createOAuth2Client(googleDrive);
  const state = jwt.sign(
    {
      purpose: 'backup-google-oauth',
      userId: userId || null,
      nonce: crypto.randomBytes(8).toString('hex'),
    },
    getJwtSecret(),
    { expiresIn: STATE_TTL_SEC }
  );

  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    include_granted_scopes: true,
    scope: [DRIVE_SCOPE, 'openid', 'email', 'profile'],
    state,
  });

  return { url, redirectUri: getOAuthRedirectUri() };
}

async function handleOAuthCallback({ code, state }) {
  if (!code) throw httpError('Missing OAuth authorization code', 400);
  if (!state) throw httpError('Missing OAuth state', 400);

  try {
    jwt.verify(state, getJwtSecret());
  } catch {
    throw httpError('OAuth state is invalid or expired. Start Connect Google account again.', 400);
  }

  const config = await getSystemConfig({ mask: false });
  const googleDrive = config.backup?.googleDrive || {};
  const oauth2Client = createOAuth2Client(googleDrive);

  const { tokens } = await oauth2Client.getToken(code);
  if (!tokens.refresh_token && !googleDrive.oauthRefreshToken) {
    throw httpError(
      'Google did not return a refresh token. Revoke prior app access at https://myaccount.google.com/permissions and connect again with consent.',
      400
    );
  }

  oauth2Client.setCredentials(tokens);
  const oauth2 = google.oauth2({ version: 'v2', auth: oauth2Client });
  const me = await oauth2.userinfo.get();
  const connectedEmail = me.data.email || googleDrive.ownerEmail || null;

  await updateSystemConfig({
    backup: {
      googleDrive: {
        oauthRefreshToken: tokens.refresh_token || googleDrive.oauthRefreshToken,
        oauthConnectedEmail: connectedEmail,
        // Keep ownerEmail aligned with the connected account when empty.
        ...(googleDrive.ownerEmail
          ? {}
          : connectedEmail
            ? { ownerEmail: connectedEmail }
            : {}),
      },
    },
  });

  return {
    connectedEmail,
    redirectTo: `${getFrontendBackupUrl()}?google=connected`,
  };
}

async function disconnectOwnerOAuth() {
  // preserveSecrets treats '' as "keep existing", so clear via a full write.
  const existing = await getSystemConfig({ mask: false });
  const next = JSON.parse(JSON.stringify(existing));
  if (!next.backup) next.backup = {};
  if (!next.backup.googleDrive) next.backup.googleDrive = {};
  next.backup.googleDrive.oauthRefreshToken = '';
  next.backup.googleDrive.oauthConnectedEmail = '';
  await pool.query(
    'INSERT INTO system_config (id, config) VALUES (1, ?) ON DUPLICATE KEY UPDATE config = VALUES(config)',
    [JSON.stringify(next)]
  );
}

/**
 * Accept a pending ownership transfer as the connected personal Gmail user.
 */
async function acceptOwnershipAsOwner(ownerDrive, fileId, ownerEmail) {
  try {
    await ownerDrive.permissions.create({
      fileId,
      transferOwnership: true,
      moveToNewOwnersRoot: false,
      supportsAllDrives: true,
      requestBody: {
        role: 'owner',
        type: 'user',
        emailAddress: ownerEmail,
      },
      fields: 'id',
    });
  } catch (error) {
    const message =
      error?.errors?.[0]?.message ||
      error?.response?.data?.error?.message ||
      error?.message ||
      'Failed to accept Drive ownership';

    // Already owner is fine.
    if (/already.+owner|duplicate/i.test(message)) {
      return;
    }
    const err = new Error(message);
    err.status = error?.code === 403 ? 403 : 500;
    throw err;
  }
}

module.exports = {
  DRIVE_SCOPE,
  getOAuthRedirectUri,
  getOAuthStatus,
  resolveOAuthClientConfig,
  hasOwnerOAuth,
  getOwnerDriveClient,
  buildAuthUrl,
  handleOAuthCallback,
  disconnectOwnerOAuth,
  acceptOwnershipAsOwner,
  getFrontendBackupUrl,
};
