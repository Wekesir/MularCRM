const express = require('express');
const {
  listPtpArrangements,
  getPtpTotals,
  updatePtpArrangement,
} = require('../services/ptpService');
const { requireAuth } = require('../middleware/requireAuth');
const { recordActivityEvent } = require('../services/activityService');

const router = express.Router();
router.use(requireAuth);

// GET /api/ptp?page=&pageSize=&clientId=&agentId=&status=&channel=&search=&reminderDue=&promiseFrom=&promiseTo=&reminderFrom=&reminderTo=
router.get('/', async (req, res) => {
  try {
    const result = await listPtpArrangements(req.query, req.user);
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list PTP arrangements', detail: error.message });
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getPtpTotals(req.query, req.user);
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load PTP totals', detail: error.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const ptp = await updatePtpArrangement(req.params.id, req.body || {}, req.user);
    res.json(ptp);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'ptp.updated',
      title: 'PTP Updated',
      subject: ptp.debtorName,
      entityType: 'ptp',
      entityId: String(ptp.id),
      metadata: {
        status: ptp.status,
        reminderDate: ptp.reminderDate,
        promisedAmount: ptp.promisedAmount,
      },
    }).catch(() => {});
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'ptp.updated',
      title: 'PTP Updated',
      subject: ptp.debtorName,
      entityType: 'debtor',
      entityId: String(ptp.debtorId),
      metadata: {
        ptpId: ptp.id,
        status: ptp.status,
        reminderDate: ptp.reminderDate,
        promisedAmount: ptp.promisedAmount,
      },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND' || error.status === 404) {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === 'BAD_REQUEST' || error.status === 400) {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update PTP arrangement', detail: error.message });
  }
});

module.exports = router;
