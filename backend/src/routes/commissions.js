const express = require('express');
const {
  listClientCategorySummary,
  listEarnings,
  getTotals,
  markEarningsInvoiced,
  recordClientPayout,
  listPayouts,
} = require('../services/commissionService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

const router = express.Router();
router.use(requireAuth);

// GET /api/commissions/summary?clientId=&debtCategoryId=&status=&agentName=&periodFrom=&periodTo=&search=
router.get('/summary', async (req, res) => {
  try {
    const rows = await listClientCategorySummary({ ...req.query, user: req.user });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load commission summary', detail: error.message });
  }
});

router.get('/earnings', async (req, res) => {
  try {
    const result = await listEarnings({ ...req.query, user: req.user });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load commission earnings', detail: error.message });
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getTotals({ ...req.query, user: req.user });
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load commission totals', detail: error.message });
  }
});

router.get('/payouts', async (req, res) => {
  try {
    const rows = await listPayouts({ ...req.query, user: req.user });
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load commission payouts', detail: error.message });
  }
});

// POST /api/commissions/earnings/invoice  { ids: [number] }  — mark accrued
// earnings as invoiced. System admins only.
router.post('/earnings/invoice', requireSystemAdmin, async (req, res) => {
  try {
    const ids = Array.isArray(req.body?.ids) ? req.body.ids : [];
    const result = await markEarningsInvoiced(ids);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'commission.invoiced',
      title: 'Commission Earnings Invoiced',
      subject: `${result.updated} earning(s)`,
      entityType: 'commission',
      entityId: null,
      metadata: { ids },
    }).catch(() => {});
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark earnings invoiced', detail: error.message });
  }
});

// POST /api/commissions/payouts  { clientId, amount, paidDate, reference }
router.post('/payouts', requireSystemAdmin, async (req, res) => {
  try {
    const result = await recordClientPayout({
      clientId: req.body?.clientId,
      amount: req.body?.amount,
      paidDate: req.body?.paidDate,
      reference: req.body?.reference,
      userId: req.user?.id,
    });
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'commission.payout_recorded',
      title: 'Commission Payout Recorded',
      subject: `Client #${req.body?.clientId}`,
      amount: Number(req.body?.amount) || 0,
      entityType: 'commission',
      entityId: String(result.payoutId),
      metadata: { clientId: req.body?.clientId, settled: result.settled },
    }).catch(() => {});
    res.status(201).json(result);
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to record payout', detail: error.message });
  }
});

module.exports = router;
