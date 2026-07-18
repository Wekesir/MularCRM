const express = require('express');
const {
  handleVoiceSessionCallback,
  handleVoiceEventCallback,
} = require('../services/africasTalkingVoiceService');

const router = express.Router();

/** AT posts form-urlencoded bodies for voice callbacks. */
router.use(express.urlencoded({ extended: true }));

/**
 * Session callback — return XML instructions (Dial / Reject).
 * Configure this URL in the Africa's Talking Voice dashboard.
 */
router.post('/voice', async (req, res) => {
  try {
    const body = { ...(req.body || {}), ...(req.query || {}) };
    const result = await handleVoiceSessionCallback(body);
    res.type('application/xml').status(200).send(result.xml);
  } catch (error) {
    console.error('[AT voice session]', error.message);
    res
      .type('application/xml')
      .status(200)
      .send(
        '<?xml version="1.0" encoding="UTF-8"?><Response><Reject/></Response>'
      );
  }
});

/**
 * Events / CDR callback — update call status, duration, recording.
 */
router.post('/voice/events', async (req, res) => {
  try {
    const body = { ...(req.body || {}), ...(req.query || {}) };
    await handleVoiceEventCallback(body);
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[AT voice events]', error.message);
    res.status(200).json({ ok: false });
  }
});

module.exports = router;
