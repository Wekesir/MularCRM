const express = require('express');
const { listPayments, getPaymentTotals } = require('../services/paymentService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

// GET /api/payments?page=&pageSize=&clientId=&debtCategoryId=&fileId=&agentName=&source=&dateFrom=&dateTo=&search=
router.get('/', async (req, res) => {
  try {
    const result = await listPayments(req.query);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list payments', detail: error.message });
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getPaymentTotals(req.query);
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load payment totals', detail: error.message });
  }
});

module.exports = router;
