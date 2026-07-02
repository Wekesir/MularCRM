const express = require('express');
const {
  listTemplateVariables,
  getTemplateVariableById,
  createTemplateVariable,
  updateTemplateVariable,
  deleteTemplateVariable,
} = require('../services/templateVariableService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const variables = await listTemplateVariables();
    res.json(variables);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list template variables', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const variable = await getTemplateVariableById(req.params.id);
    if (!variable) return res.status(404).json({ message: 'Template variable not found' });
    res.json(variable);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get template variable', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const variable = await createTemplateVariable(req.body);
    res.status(201).json(variable);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'template_variable.created',
      title: 'Template Variable Created',
      subject: variable.key,
      entityType: 'template_variable',
      entityId: String(variable.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create template variable', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const variable = await updateTemplateVariable(req.params.id, req.body);
    if (!variable) return res.status(404).json({ message: 'Template variable not found' });
    res.json(variable);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'template_variable.updated',
      title: 'Template Variable Updated',
      subject: variable.key,
      entityType: 'template_variable',
      entityId: String(variable.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update template variable', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getTemplateVariableById(req.params.id);
    const result = await deleteTemplateVariable(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Template variable not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'template_variable.deleted',
      title: 'Template Variable Deleted',
      subject: existing?.key || req.params.id,
      entityType: 'template_variable',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete template variable', detail: error.message });
  }
});

module.exports = router;
