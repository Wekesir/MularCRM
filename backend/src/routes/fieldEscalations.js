const express = require('express');
const {
  listEligibleDebtors,
  listEscalations,
  getEscalationTotals,
  getEscalationDetail,
  requestEscalation,
  approveEscalation,
  rejectEscalation,
  assignFieldAgent,
  cancelEscalation,
  listFieldAgentsForCenter,
  getEscalationConfig,
} = require('../services/fieldEscalationService');
const { requireAuth } = require('../middleware/requireAuth');
const { recordActivityEvent } = require('../services/activityService');
const { updateSystemConfig } = require('../services/systemConfigService');
const { isSeniorSupervisorRole } = require('../config/orgRoles');

const router = express.Router();
router.use(requireAuth);

function sendError(res, error, fallback) {
  const status =
    error.status ||
    (error.code === 'NOT_FOUND'
      ? 404
      : error.code === 'FORBIDDEN'
        ? 403
        : error.code === 'CONFLICT'
          ? 409
          : error.code === 'BAD_REQUEST'
            ? 400
            : 500);
  res.status(status).json({ message: error.message || fallback, detail: error.message });
}

router.get('/config', async (req, res) => {
  try {
    const config = await getEscalationConfig();
    res.json(config);
  } catch (error) {
    sendError(res, error, 'Failed to load field escalation config');
  }
});

router.put('/config', async (req, res) => {
  try {
    if (!req.user?.isSystemAdmin && !isSeniorSupervisorRole(req.user)) {
      return res.status(403).json({ message: 'Only senior supervisors can update escalation settings' });
    }
    const body = req.body || {};
    const fieldEscalation = {
      enabled: body.enabled !== false,
      refusalStatusCodes: Array.isArray(body.refusalStatusCodes)
        ? body.refusalStatusCodes.map((c) => String(c).toUpperCase())
        : undefined,
      minRefusalContacts: body.minRefusalContacts != null ? Number(body.minRefusalContacts) : undefined,
      lookbackDays: body.lookbackDays != null ? Number(body.lookbackDays) : undefined,
      waitPeriodDays: body.waitPeriodDays != null ? Number(body.waitPeriodDays) : undefined,
      requirePaymentGap: body.requirePaymentGap !== false,
    };
    // Drop undefined keys so deep merge preserves existing
    Object.keys(fieldEscalation).forEach((k) => {
      if (fieldEscalation[k] === undefined) delete fieldEscalation[k];
    });
    await updateSystemConfig({ fieldEscalation });
    const config = await getEscalationConfig();
    res.json(config);
  } catch (error) {
    sendError(res, error, 'Failed to update field escalation config');
  }
});

router.get('/eligible', async (req, res) => {
  try {
    const result = await listEligibleDebtors(req.user, req.query);
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Failed to list eligible debtors');
  }
});

router.get('/field-agents', async (req, res) => {
  try {
    const agents = await listFieldAgentsForCenter(req.user, req.query.callCenterId);
    res.json(agents);
  } catch (error) {
    sendError(res, error, 'Failed to list field agents');
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getEscalationTotals(req.query, req.user);
    res.json(totals);
  } catch (error) {
    sendError(res, error, 'Failed to load escalation totals');
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await listEscalations(req.query, req.user);
    res.json(result);
  } catch (error) {
    sendError(res, error, 'Failed to list escalations');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const item = await getEscalationDetail(req.params.id, req.user);
    res.json(item);
  } catch (error) {
    sendError(res, error, 'Failed to load escalation');
  }
});

router.post('/', async (req, res) => {
  try {
    const created = await requestEscalation(req.body || {}, req.user);
    res.status(201).json(created);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'field_escalation.requested',
      title: 'Field Escalation Requested',
      subject: created.debtorName,
      entityType: 'debtor',
      entityId: String(created.debtorId),
      metadata: {
        escalationId: created.id,
        refusalCount: created.refusalCount,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to request field escalation');
  }
});

router.post('/:id/approve', async (req, res) => {
  try {
    const updated = await approveEscalation(req.params.id, req.body || {}, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'field_escalation.approved',
      title: 'Field Escalation Approved',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: { escalationId: updated.id },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to approve field escalation');
  }
});

router.post('/:id/reject', async (req, res) => {
  try {
    const updated = await rejectEscalation(req.params.id, req.body || {}, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'field_escalation.rejected',
      title: 'Field Escalation Rejected',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: {
        escalationId: updated.id,
        rejectionReason: updated.rejectionReason,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to reject field escalation');
  }
});

router.post('/:id/assign', async (req, res) => {
  try {
    const updated = await assignFieldAgent(req.params.id, req.body || {}, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'field_escalation.assigned',
      title: 'Field Agent Assigned',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: {
        escalationId: updated.id,
        fieldAgentUserId: updated.toFieldAgentUserId,
        fieldAgentName: updated.toFieldAgentName,
      },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to assign field agent');
  }
});

router.post('/:id/cancel', async (req, res) => {
  try {
    const updated = await cancelEscalation(req.params.id, req.user);
    res.json(updated);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'field_escalation.cancelled',
      title: 'Field Escalation Cancelled',
      subject: updated.debtorName,
      entityType: 'debtor',
      entityId: String(updated.debtorId),
      metadata: { escalationId: updated.id },
    }).catch(() => {});
  } catch (error) {
    sendError(res, error, 'Failed to cancel field escalation');
  }
});

module.exports = router;
