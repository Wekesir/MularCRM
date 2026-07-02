const express = require('express');
const {
  listEmailTemplates,
  getEmailTemplateById,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  listSmsTemplates,
  getSmsTemplateById,
  createSmsTemplate,
  updateSmsTemplate,
  deleteSmsTemplate,
} = require('../services/templateService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

// ── Email templates ──

router.get('/email', async (req, res) => {
  try {
    const templates = await listEmailTemplates({
      clientId: req.query.clientId,
      systemOnly: req.query.systemOnly === '1' || req.query.systemOnly === 'true',
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list email templates', detail: error.message });
  }
});

router.get('/email/:id', async (req, res) => {
  try {
    const template = await getEmailTemplateById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get email template', detail: error.message });
  }
});

router.post('/email', async (req, res) => {
  try {
    const template = await createEmailTemplate(req.body);
    res.status(201).json(template);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'email_template.created',
      title: 'Email Template Created',
      subject: template.name,
      entityType: 'email_template',
      entityId: String(template.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create email template', detail: error.message });
  }
});

router.put('/email/:id', async (req, res) => {
  try {
    const template = await updateEmailTemplate(req.params.id, req.body);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'email_template.updated',
      title: 'Email Template Updated',
      subject: template.name,
      entityType: 'email_template',
      entityId: String(template.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update email template', detail: error.message });
  }
});

router.delete('/email/:id', async (req, res) => {
  try {
    const existing = await getEmailTemplateById(req.params.id);
    const result = await deleteEmailTemplate(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Template not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'email_template.deleted',
      title: 'Email Template Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'email_template',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete email template', detail: error.message });
  }
});

// ── SMS templates ──

router.get('/sms', async (req, res) => {
  try {
    const templates = await listSmsTemplates({
      clientId: req.query.clientId,
      systemOnly: req.query.systemOnly === '1' || req.query.systemOnly === 'true',
    });
    res.json(templates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list SMS templates', detail: error.message });
  }
});

router.get('/sms/:id', async (req, res) => {
  try {
    const template = await getSmsTemplateById(req.params.id);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get SMS template', detail: error.message });
  }
});

router.post('/sms', async (req, res) => {
  try {
    const template = await createSmsTemplate(req.body);
    res.status(201).json(template);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'sms_template.created',
      title: 'SMS Template Created',
      subject: template.name,
      entityType: 'sms_template',
      entityId: String(template.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create SMS template', detail: error.message });
  }
});

router.put('/sms/:id', async (req, res) => {
  try {
    const template = await updateSmsTemplate(req.params.id, req.body);
    if (!template) return res.status(404).json({ message: 'Template not found' });
    res.json(template);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'sms_template.updated',
      title: 'SMS Template Updated',
      subject: template.name,
      entityType: 'sms_template',
      entityId: String(template.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update SMS template', detail: error.message });
  }
});

router.delete('/sms/:id', async (req, res) => {
  try {
    const existing = await getSmsTemplateById(req.params.id);
    const result = await deleteSmsTemplate(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Template not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'sms_template.deleted',
      title: 'SMS Template Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'sms_template',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete SMS template', detail: error.message });
  }
});

module.exports = router;
