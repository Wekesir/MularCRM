const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');
const {
  runDatabaseBackup,
  getLastBackupStatus,
  parseServiceAccountKey,
} = require('../services/databaseBackupService');
const { getBackupCronInfo } = require('../services/backupCronService');
const {
  buildAuthUrl,
  handleOAuthCallback,
  disconnectOwnerOAuth,
  getOAuthStatus,
  getOAuthRedirectUri,
  getFrontendBackupUrl,
} = require('../services/backupGoogleOAuthService');
const { getSystemConfig } = require('../services/systemConfigService');

const router = express.Router();

// Google redirects here in the browser — must stay public (state is signed).
router.get('/google/callback', async (req, res) => {
  try {
    const { code, state, error } = req.query;
    if (error) {
      const target = `${getFrontendBackupUrl()}?google=error&message=${encodeURIComponent(String(error))}`;
      res.redirect(target);
      return;
    }
    const result = await handleOAuthCallback({ code, state });
    res.redirect(result.redirectTo);
  } catch (err) {
    const target = `${getFrontendBackupUrl()}?google=error&message=${encodeURIComponent(err.message || 'OAuth failed')}`;
    res.redirect(target);
  }
});

router.use(requireAuth);
router.use(requireSystemAdmin);

router.get('/status', async (_req, res) => {
  const lastRun = await getLastBackupStatus();
  const config = await getSystemConfig({ mask: true });
  res.json({
    lastRun: {
      ...lastRun,
      awaitingOwnership: Boolean(lastRun.awaitingOwnership),
      phase: lastRun.phase || (lastRun.awaitingOwnership ? 'awaiting_ownership' : 'idle'),
    },
    cron: getBackupCronInfo(),
    oauth: getOAuthStatus(config.backup?.googleDrive || {}),
  });
});

router.post('/run', async (_req, res) => {
  try {
    const result = await runDatabaseBackup({ triggeredBy: 'manual' });
    if (result.awaitingOwnership) {
      res.status(202).json(result);
      return;
    }
    res.json(result);
  } catch (error) {
    const lastRun = await getLastBackupStatus();
    res.status(error.status || 500).json({
      message: error.message || 'Backup failed',
      awaitingOwnership: Boolean(error.awaitingOwnership || lastRun.awaitingOwnership),
      driveFileId: error.driveFileId || lastRun.driveFileId || null,
      phase: error.phase || lastRun.phase,
      lastRun,
    });
  }
});

router.post('/parse-service-account', (req, res) => {
  try {
    const { serviceAccountKey } = req.body || {};
    const parsed = parseServiceAccountKey(serviceAccountKey);
    res.json({
      serviceAccountEmail: parsed.client_email,
      projectId: parsed.project_id || null,
    });
  } catch (error) {
    res.status(error.status || 400).json({ message: error.message });
  }
});

router.get('/google/auth-url', async (req, res) => {
  try {
    const config = await getSystemConfig({ mask: false });
    const { url, redirectUri } = buildAuthUrl({
      userId: req.user?.id,
      googleDrive: config.backup?.googleDrive || {},
    });
    res.json({ url, redirectUri });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

router.get('/google/oauth-status', async (_req, res) => {
  const config = await getSystemConfig({ mask: true });
  res.json({
    ...getOAuthStatus(config.backup?.googleDrive || {}),
    redirectUri: getOAuthRedirectUri(),
  });
});

router.post('/google/disconnect', async (_req, res) => {
  try {
    await disconnectOwnerOAuth();
    const config = await getSystemConfig({ mask: true });
    res.json({
      message: 'Google account disconnected',
      oauth: getOAuthStatus(config.backup?.googleDrive || {}),
    });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message });
  }
});

module.exports = router;
