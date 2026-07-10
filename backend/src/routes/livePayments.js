const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');
const { getSystemConfig } = require('../services/systemConfigService');
const {
  runLivePaymentsPull,
  testLivePaymentsConnection,
  getLastLivePaymentsStatus,
  getLivePaymentsConfig,
} = require('../services/livePaymentsApiService');
const { getLivePaymentsCronInfo } = require('../services/livePaymentsCronService');

const router = express.Router();

router.use(requireAuth);
router.use(requireSystemAdmin);

router.get('/status', (_req, res) => {
  res.json({
    lastRun: getLastLivePaymentsStatus(),
    cron: getLivePaymentsCronInfo(),
  });
});

router.post('/pull', async (req, res) => {
  try {
    const { clientId = null, date = null } = req.body || {};
    const result = await runLivePaymentsPull({
      clientId: clientId != null && clientId !== '' ? Number(clientId) : null,
      date,
      userId: req.user?.id ?? null,
      triggeredBy: 'manual',
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({
      message: error.message || 'Live payments pull failed',
      lastRun: getLastLivePaymentsStatus(),
    });
  }
});

router.post('/test-connection', async (req, res) => {
  try {
    const body = req.body || {};
    let clientConfig = body;

    // Allow testing by clientId against saved (unmasked) config.
    if (body.clientId != null && !body.endpointUrl) {
      const config = await getSystemConfig({ mask: false });
      const livePayments = getLivePaymentsConfig(config);
      const found = (livePayments.clients || []).find(
        (c) => Number(c.clientId) === Number(body.clientId)
      );
      if (!found) {
        return res.status(404).json({ message: 'No live-payments config for that client' });
      }
      clientConfig = found;
    }

    if (!clientConfig.endpointUrl) {
      return res.status(400).json({ message: 'endpointUrl is required' });
    }

    // If apiKey blank but clientId known, use saved key.
    if (!clientConfig.apiKey && body.clientId != null) {
      const config = await getSystemConfig({ mask: false });
      const livePayments = getLivePaymentsConfig(config);
      const found = (livePayments.clients || []).find(
        (c) => Number(c.clientId) === Number(body.clientId)
      );
      if (found?.apiKey) clientConfig = { ...clientConfig, apiKey: found.apiKey };
    }

    const result = await testLivePaymentsConnection(clientConfig);
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Connection test failed' });
  }
});

module.exports = router;
