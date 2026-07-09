const express = require('express');
const {
  listCurrencies,
  getCurrencyById,
  createCurrency,
  updateCurrency,
  deleteCurrency,
} = require('../services/currencyService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const currencies = await listCurrencies();
    res.json(currencies);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list currencies', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const currency = await getCurrencyById(req.params.id);
    if (!currency) return res.status(404).json({ message: 'Currency not found' });
    res.json(currency);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get currency', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const currency = await createCurrency(req.body);
    res.status(201).json(currency);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'currency.created',
      title: 'Currency Created',
      subject: currency.code,
      entityType: 'currency',
      entityId: String(currency.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create currency', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const currency = await updateCurrency(req.params.id, req.body);
    if (!currency) return res.status(404).json({ message: 'Currency not found' });
    res.json(currency);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'currency.updated',
      title: 'Currency Updated',
      subject: currency.code,
      entityType: 'currency',
      entityId: String(currency.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update currency', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getCurrencyById(req.params.id);
    const result = await deleteCurrency(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Currency not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'currency.deleted',
      title: 'Currency Deleted',
      subject: existing?.code || req.params.id,
      entityType: 'currency',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete currency', detail: error.message });
  }
});

module.exports = router;
