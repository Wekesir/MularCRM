const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');
const {
  runDatabaseBackup,
  getLastBackupStatus,
  parseServiceAccountKey,
} = require('../services/databaseBackupService');
const { getBackupCronInfo } = require('../services/backupCronService');

const router = express.Router();

router.use(requireAuth);
router.use(requireSystemAdmin);

router.get('/status', (_req, res) => {
  res.json({
    lastRun: getLastBackupStatus(),
    cron: getBackupCronInfo(),
  });
});

router.post('/run', async (_req, res) => {
  try {
    const result = await runDatabaseBackup({ triggeredBy: 'manual' });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Backup failed',
      lastRun: getLastBackupStatus(),
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

module.exports = router;
