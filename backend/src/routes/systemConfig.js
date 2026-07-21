const express = require('express');
const { getSystemConfig, updateSystemConfig } = require('../services/systemConfigService');
const { getSmsBalance, sendTestSms } = require('../services/smsService');
const { getActiveDialerStatus, testOutboundCall } = require('../services/dialerService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

const router = express.Router();

router.get('/', async (_req, res) => {
  try {
    const config = await getSystemConfig();
    res.json(config);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load system configuration', detail: error.message });
  }
});

router.get('/branding', async (_req, res) => {
  try {
    const config = await getSystemConfig();
    res.json({
      business: config.business,
      theme: config.theme,
    });
  } catch (error) {
    res.status(500).json({ message: 'Failed to load branding configuration', detail: error.message });
  }
});

router.put('/', requireAuth, async (req, res) => {
  try {
    const updates = { ...req.body };

    // Derive service account email from pasted JSON when provided.
    if (updates.backup?.googleDrive?.serviceAccountKey) {
      try {
        const { parseServiceAccountKey } = require('../services/databaseBackupService');
        const parsed = parseServiceAccountKey(updates.backup.googleDrive.serviceAccountKey);
        updates.backup = {
          ...updates.backup,
          googleDrive: {
            ...updates.backup.googleDrive,
            serviceAccountEmail: parsed.client_email,
          },
        };
      } catch {
        /* validation happens on backup run */
      }
    }

    if (updates.backup?.frequency) {
      const { normalizeFrequency } = require('../services/backupCronService');
      updates.backup = {
        ...updates.backup,
        frequency: normalizeFrequency(updates.backup.frequency),
      };
    }

    if (updates.integrations?.livePayments?.frequency) {
      const { normalizeFrequency } = require('../services/livePaymentsCronService');
      updates.integrations = {
        ...updates.integrations,
        livePayments: {
          ...updates.integrations.livePayments,
          frequency: normalizeFrequency(updates.integrations.livePayments.frequency),
        },
      };
    }

    const config = await updateSystemConfig(updates);

    if (updates.backup) {
      try {
        const { rescheduleBackupCron } = require('../services/backupCronService');
        await rescheduleBackupCron();
      } catch (error) {
        console.error('[backup-cron] reschedule after config save failed:', error.message);
      }
    }

    if (updates.integrations?.livePayments) {
      try {
        const { rescheduleLivePaymentsCron } = require('../services/livePaymentsCronService');
        await rescheduleLivePaymentsCron();
      } catch (error) {
        console.error('[live-payments-cron] reschedule after config save failed:', error.message);
      }
    }

    res.json(config);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'config.updated',
      title: 'System Configuration Updated',
      subject: 'System configuration',
      entityType: 'system_config',
      entityId: '1',
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to update system configuration', detail: error.message });
  }
});

router.get('/sms/balance', requireAuth, async (_req, res) => {
  try {
    const result = await getSmsBalance();
    if (!result.ok) {
      return res.status(400).json({ message: result.error, ...result });
    }
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to fetch SMS balance', detail: error.message });
  }
});

router.post('/sms/test', requireAuth, async (req, res) => {
  try {
    const { mobile, message } = req.body || {};
    if (!mobile) {
      return res.status(400).json({ message: 'Mobile number is required' });
    }
    const result = await sendTestSms({ to: mobile, message });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Failed to send test SMS',
      code: error.code,
    });
  }
});

/** Active dialer status — safe for all authenticated users (no secrets). */
router.get('/voice/active', requireAuth, async (_req, res) => {
  try {
    const status = await getActiveDialerStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load active dialer', detail: error.message });
  }
});

/** Place a test call through the chosen dialer (system admin only). */
router.post('/voice/test', requireAuth, requireSystemAdmin, async (req, res) => {
  try {
    const result = await testOutboundCall(req.user, req.body || {});
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'config.voice.test',
      title: 'Voice Dialer Test Call',
      subject: result.dialerLabel || 'Voice',
      entityType: 'system_config',
      entityId: '1',
      metadata: {
        dialerProvider: result.dialerProvider,
        voiceCallId: result.call?.id,
      },
    }).catch(() => {});
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Failed to place test call',
      code: error.code,
    });
  }
});

module.exports = router;
