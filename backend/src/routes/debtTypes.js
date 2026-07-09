const express = require('express');
const {
  listDebtTypes,
  getDebtTypeById,
  createDebtType,
  updateDebtType,
  deleteDebtType,
} = require('../services/debtTypeService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const types = await listDebtTypes();
    res.json(types);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list debt types', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const type = await getDebtTypeById(req.params.id);
    if (!type) return res.status(404).json({ message: 'Debt type not found' });
    res.json(type);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get debt type', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const type = await createDebtType(req.body);
    res.status(201).json(type);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_type.created',
      title: 'Debt Type Created',
      subject: type.name,
      entityType: 'debt_type',
      entityId: String(type.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create debt type', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const type = await updateDebtType(req.params.id, req.body);
    if (!type) return res.status(404).json({ message: 'Debt type not found' });
    res.json(type);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_type.updated',
      title: 'Debt Type Updated',
      subject: type.name,
      entityType: 'debt_type',
      entityId: String(type.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update debt type', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getDebtTypeById(req.params.id);
    const result = await deleteDebtType(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Debt type not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debt_type.deleted',
      title: 'Debt Type Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'debt_type',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete debt type', detail: error.message });
  }
});

module.exports = router;
