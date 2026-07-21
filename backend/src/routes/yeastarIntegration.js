const express = require('express');
const path = require('path');
const fs = require('fs');
const {
  assertIntegrationAuth,
  searchContacts,
  listIntegrationUsers,
  journalCall,
} = require('../services/yeastarIntegrationService');
const { getSystemConfig } = require('../services/systemConfigService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

function sendError(res, error, fallback) {
  const status =
    error.status ||
    (error.code === 'UNAUTHORIZED' ? 401 : error.code === 'BAD_REQUEST' ? 400 : 500);
  res.status(status).json({ message: error.message || fallback, detail: error.message });
}

async function withIntegrationAuth(req, res, next) {
  try {
    req.yeastarConfig = await assertIntegrationAuth(req);
    next();
  } catch (error) {
    sendError(res, error, 'Unauthorized');
  }
}

function buildTemplateXml(req) {
  const templatePath = path.join(__dirname, '../../docs/yeastar-omnicrm-crm-template.xml');
  let xml = fs.readFileSync(templatePath, 'utf8');

  return getSystemConfig({ mask: false }).then((config) => {
    const appBase =
      String(config.voice?.appBaseUrl || '').replace(/\/$/, '') ||
      `${req.protocol}://${req.get('host')}`.replace(/:\d+$/, '');
    // Prefer API host from callbackBaseUrl when set (backend public URL)
    const apiHost =
      String(config.voice?.callbackBaseUrl || '').replace(/\/$/, '') ||
      String(config.voice?.appBaseUrl || '').replace(/\/$/, '') ||
      `${req.protocol}://${req.get('host')}`;
    const apiBase = `${apiHost}/api/integrations/yeastar`;
    return xml
      .replaceAll('{{API_BASE_URL}}', apiBase)
      .replaceAll('{{APP_BASE_URL}}', appBase);
  });
}

// PBX → CRM (integration API key)
router.get('/contacts/search', withIntegrationAuth, async (req, res) => {
  try {
    const phone = req.query.phone || req.query.Phone || req.query.number || '';
    res.json(await searchContacts(phone, req.yeastarConfig));
  } catch (error) {
    sendError(res, error, 'Failed to search contacts');
  }
});

router.get('/contacts', withIntegrationAuth, async (req, res) => {
  try {
    const phone = req.query.phone || req.query.Phone || req.query.number || '';
    res.json(await searchContacts(phone, req.yeastarConfig));
  } catch (error) {
    sendError(res, error, 'Failed to search contacts');
  }
});

router.get('/users', withIntegrationAuth, async (req, res) => {
  try {
    res.json(await listIntegrationUsers(req.yeastarConfig));
  } catch (error) {
    sendError(res, error, 'Failed to list users');
  }
});

router.post('/calls/journal', withIntegrationAuth, async (req, res) => {
  try {
    const call = await journalCall(req.body || {}, req.yeastarConfig);
    res.status(201).json({ call, id: call?.id, success: true });
  } catch (error) {
    sendError(res, error, 'Failed to journal call');
  }
});

// Admin download of CRM template (session auth)
router.get('/crm-template.xml', requireAuth, async (req, res) => {
  try {
    if (!req.user?.isSystemAdmin) {
      return res.status(403).json({ message: 'System admin required' });
    }
    const xml = await buildTemplateXml(req);
    res.setHeader('Content-Type', 'application/xml; charset=utf-8');
    res.setHeader(
      'Content-Disposition',
      'attachment; filename="yeastar-omnicrm-crm-template.xml"'
    );
    res.send(xml);
  } catch (error) {
    sendError(res, error, 'Failed to load CRM template');
  }
});

module.exports = router;
