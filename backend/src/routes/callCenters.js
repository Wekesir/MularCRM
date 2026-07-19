const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const {
  listCallCenters,
  getCallCenterById,
  createCallCenter,
  updateCallCenter,
  softDeleteCallCenter,
  getCallCenterStaff,
  listAssignableStaff,
  transferSupervisor,
  transferAgent,
  assertCanManageCallCenters,
} = require('../services/callCenterService');
const { recordActivityEvent } = require('../services/activityService');

const router = express.Router();
router.use(requireAuth);

function handleServiceError(res, error, fallback) {
  if (error.code === 'FORBIDDEN' || error.status === 403) {
    return res.status(403).json({ message: error.message });
  }
  if (error.code === 'VALIDATION' || error.code === 'DUPLICATE' || error.code === 'IN_USE') {
    return res.status(400).json({ message: error.message, code: error.code });
  }
  if (error.code === 'NOT_FOUND') {
    return res.status(404).json({ message: error.message });
  }
  return res.status(500).json({ message: fallback, detail: error.message });
}

router.get('/', async (req, res) => {
  try {
    const includeInactive =
      req.query.includeInactive === '1' || req.query.includeInactive === 'true';
    const centers = await listCallCenters({ includeInactive });
    res.json(centers);
  } catch (error) {
    handleServiceError(res, error, 'Failed to list call centers');
  }
});

router.get('/:id', async (req, res) => {
  try {
    const center = await getCallCenterById(req.params.id);
    if (!center) return res.status(404).json({ message: 'Call center not found' });
    res.json(center);
  } catch (error) {
    handleServiceError(res, error, 'Failed to get call center');
  }
});

router.get('/:id/staff', async (req, res) => {
  try {
    const staff = await getCallCenterStaff(req.params.id);
    if (!staff) return res.status(404).json({ message: 'Call center not found' });
    res.json(staff);
  } catch (error) {
    handleServiceError(res, error, 'Failed to load call center staff');
  }
});

router.get('/:id/assignable-staff', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const center = await getCallCenterById(req.params.id);
    if (!center) return res.status(404).json({ message: 'Call center not found' });

    const kind = String(req.query.kind || 'supervisor').toLowerCase();
    if (kind !== 'supervisor' && kind !== 'agent') {
      return res.status(400).json({ message: 'kind must be supervisor or agent' });
    }

    const candidates = await listAssignableStaff(kind, center.id);
    res.json({ callCenterId: center.id, kind, candidates });
  } catch (error) {
    handleServiceError(res, error, 'Failed to load assignable staff');
  }
});

router.post('/', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const center = await createCallCenter(req.body || {}, { performedBy: req.user });
    await recordActivityEvent({
      userId: req.user.id,
      userName: req.user.name,
      actionType: 'call_center.created',
      title: `Created call center ${center.name}`,
      subject: center.name,
      entityType: 'call_center',
      entityId: String(center.id),
    });
    res.status(201).json(center);
  } catch (error) {
    handleServiceError(res, error, 'Failed to create call center');
  }
});

router.put('/:id', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const center = await updateCallCenter(req.params.id, req.body || {});
    if (!center) return res.status(404).json({ message: 'Call center not found' });
    res.json(center);
  } catch (error) {
    handleServiceError(res, error, 'Failed to update call center');
  }
});

router.delete('/:id', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const result = await softDeleteCallCenter(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Call center not found' });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to delete call center');
  }
});

router.post('/:id/transfer-supervisor', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const userId = Number(req.body?.userId);
    const toCallCenterId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const result = await transferSupervisor(userId, toCallCenterId, { performedBy: req.user });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to transfer supervisor');
  }
});

router.post('/:id/transfer-agent', async (req, res) => {
  try {
    assertCanManageCallCenters(req.user);
    const userId = Number(req.body?.userId);
    const toCallCenterId = Number(req.params.id);
    if (!Number.isFinite(userId)) {
      return res.status(400).json({ message: 'userId is required' });
    }
    const result = await transferAgent(userId, toCallCenterId, { performedBy: req.user });
    res.json(result);
  } catch (error) {
    handleServiceError(res, error, 'Failed to transfer agent');
  }
});

module.exports = router;
