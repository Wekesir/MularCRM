const express = require('express');
const {
  listRates,
  createRate,
  updateRate,
  deleteRate,
} = require('../services/clientCommissionRateService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

const router = express.Router();
router.use(requireAuth);

// GET /api/client-commission-rates — list the full rate matrix (all clients x categories).
router.get('/', async (_req, res) => {
  try {
    const rates = await listRates();
    res.json(rates);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list commission rates', detail: error.message });
  }
});

router.post('/', requireSystemAdmin, async (req, res) => {
  try {
    const rate = await createRate(req.body);
    res.status(201).json(rate);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'commission_rate.created',
      title: 'Commission Rate Created',
      subject: rate.debtCategoryName
        ? `${rate.clientName} · ${rate.debtCategoryName}`
        : `${rate.clientName} · default`,
      entityType: 'commission_rate',
      entityId: String(rate.id),
      metadata: { rate: rate.rate },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create commission rate', detail: error.message });
  }
});

router.put('/:id', requireSystemAdmin, async (req, res) => {
  try {
    const rate = await updateRate(req.params.id, req.body);
    if (!rate) return res.status(404).json({ message: 'Commission rate not found' });
    res.json(rate);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'commission_rate.updated',
      title: 'Commission Rate Updated',
      subject: rate.debtCategoryName
        ? `${rate.clientName} · ${rate.debtCategoryName}`
        : `${rate.clientName} · default`,
      entityType: 'commission_rate',
      entityId: String(rate.id),
      metadata: { rate: rate.rate },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update commission rate', detail: error.message });
  }
});

router.delete('/:id', requireSystemAdmin, async (req, res) => {
  try {
    const result = await deleteRate(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Commission rate not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'commission_rate.deleted',
      title: 'Commission Rate Deleted',
      subject: `Rate #${req.params.id}`,
      entityType: 'commission_rate',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete commission rate', detail: error.message });
  }
});

module.exports = router;
