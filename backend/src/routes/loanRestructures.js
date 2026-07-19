const express = require('express');
const {
  createRestructure,
  listRestructures,
  getRestructureTotals,
  getRestructureDetail,
  approveRestructure,
  rejectRestructure,
  cancelRestructure,
  updateInstallmentStatus,
  generateSchedule,
} = require('../services/loanRestructureService');
const { requireAuth } = require('../middleware/requireAuth');
const { recordActivityEvent } = require('../services/activityService');

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback) {
  const status = error.status || (error.code === 'NOT_FOUND' ? 404 : error.code === 'FORBIDDEN' ? 403 : error.code === 'CONFLICT' ? 409 : error.code === 'BAD_REQUEST' ? 400 : 500);
  res.status(status).json({ message: error.message || fallback, detail: error.message });
}

// GET /api/loan-restructures/preview-schedule?installmentAmount=&installmentCount=&firstDueDate=
router.get('/preview-schedule', (req, res) => {
  try {
    const schedule = generateSchedule({
      installmentAmount: req.query.installmentAmount,
      installmentCount: req.query.installmentCount,
      firstDueDate: req.query.firstDueDate,
    });
    const amount = Number(req.query.installmentAmount) || 0;
    const count = Math.floor(Number(req.query.installmentCount) || 0);
    res.json({
      schedule,
      totalPlanAmount: amount * Math.max(0, count),
    });
  } catch (error) {
    sendError(res, error, 'Failed to generate schedule');
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getRestructureTotals(req.query, req.user);
    res.json(totals);
  } catch (error) {
    sendError(res, error, 'Failed to load restructure totals');
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await listRestructures(req.query, req.user);
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Failed to list restructures');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getRestructureDetail(req.params.id, req.user);
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to load restructure');
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await createRestructure(req.body || {}, req.user);
    res.status(201).json(created);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'restructure.submitted',
      title: 'Restructure Submitted',
      subject: created.debtorName,
      entityType: 'debtor',
      entityId: String(created.debtorId),
      metadata: {
        restructureId: created.id,
        installmentAmount: created.installmentAmount,
        installmentCount: created.installmentCount,
        totalPlanAmount: created.totalPlanAmount,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to submit restructure');
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const updated = await approveRestructure(req.params.id, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'restructure.approved',
      title: 'Restructure Approved',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: {
        restructureId: updated.id,
        cancelledPtps: updated.cancelledPtps,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to approve restructure');
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const updated = await rejectRestructure(req.params.id, req.body || {}, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'restructure.rejected',
      title: 'Restructure Rejected',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: {
        restructureId: updated.id,
        rejectionReason: updated.rejectionReason,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to reject restructure');
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const updated = await cancelRestructure(req.params.id, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'restructure.cancelled',
      title: 'Restructure Cancelled',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: { restructureId: updated.id },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to cancel restructure');
  }
});

router.patch('/:id/installments/:installmentId', async (req, res) => {
  try {
    const updated = await updateInstallmentStatus(
      req.params.id,
      req.params.installmentId,
      req.body?.status,
      req.user
    );
    res.json(updated);
  } catch (error) {
    sendError(res, error, 'Failed to update installment');
  }
});

module.exports = router;
