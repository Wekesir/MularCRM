const express = require('express');
const { requireAuth } = require('../middleware/requireAuth');
const {
  listCoverages,
  createCoverage,
  endCoverage,
  countActiveStaffCoverages,
} = require('../services/staffCoverageService');
const {
  handoffStaffRole,
  getSuccessionStatus,
} = require('../services/staffHandoffService');

const router = express.Router();

router.use(requireAuth);

function errorStatus(error) {
  return (
    error.status ||
    (error.code === 'FORBIDDEN'
      ? 403
      : error.code === 'NOT_FOUND'
        ? 404
        : error.code === 'SUCCESSION_PENDING'
          ? 409
          : 400)
  );
}

// GET /api/staff/coverages
router.get('/coverages', async (req, res) => {
  try {
    const coverages = await listCoverages({
      user: req.user,
      status: req.query.status || undefined,
      userId: req.query.userId || undefined,
      callCenterId: req.query.callCenterId || undefined,
    });
    res.json(coverages);
  } catch (error) {
    res.status(errorStatus(error)).json({ message: error.message, code: error.code });
  }
});

router.get('/coverages/active-count', async (req, res) => {
  try {
    const count = await countActiveStaffCoverages({ user: req.user });
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to count staff coverages', detail: error.message });
  }
});

router.post('/coverages', async (req, res) => {
  try {
    const coverage = await createCoverage(req.body || {}, { performedBy: req.user });
    res.status(201).json(coverage);
  } catch (error) {
    res.status(errorStatus(error)).json({ message: error.message, code: error.code });
  }
});

router.post('/coverages/:coverageId/end', async (req, res) => {
  try {
    const coverage = await endCoverage(req.params.coverageId, {
      performedBy: req.user,
      status: req.body?.status,
    });
    res.json(coverage);
  } catch (error) {
    res.status(errorStatus(error)).json({ message: error.message, code: error.code });
  }
});

router.get('/:id/succession', async (req, res) => {
  try {
    const status = await getSuccessionStatus(req.params.id);
    res.json(status);
  } catch (error) {
    res.status(errorStatus(error)).json({ message: error.message, code: error.code });
  }
});

router.post('/:id/handoff', async (req, res) => {
  try {
    const result = await handoffStaffRole(
      req.params.id,
      {
        mode: req.body?.mode,
        toUserId: req.body?.toUserId,
      },
      { performedBy: req.user }
    );
    res.json(result);
  } catch (error) {
    res.status(errorStatus(error)).json({ message: error.message, code: error.code });
  }
});

module.exports = router;
