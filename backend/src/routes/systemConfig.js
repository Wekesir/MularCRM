const express = require('express');
const { getSystemConfig, updateSystemConfig } = require('../services/systemConfigService');
const { getSmsBalance, sendTestSms } = require('../services/smsService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

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
    const config = await updateSystemConfig(req.body);
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

module.exports = router;
