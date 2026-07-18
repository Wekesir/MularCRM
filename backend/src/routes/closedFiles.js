const express = require('express');
const {
  listClosedDebtors,
  listClosedDebtorsForExport,
  listClosureReasons,
  getClosedDebtorTotals,
} = require('../services/closedFilesService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();
router.use(requireAuth);

// GET /api/closed-files?page=&pageSize=&clientId=&fileId=&agent=&closureReason=&closedFrom=&closedTo=&lastContactedFrom=&lastContactedTo=&search=
function closedFilters(req) {
  return { ...req.query, user: req.user };
}

router.get('/', async (req, res) => {
  try {
    const result = await listClosedDebtors(closedFilters(req));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list closed files', detail: error.message });
  }
});

router.get('/closure-reasons', async (_req, res) => {
  try {
    const reasons = await listClosureReasons();
    res.json(reasons);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list closure reasons', detail: error.message });
  }
});

router.get('/totals', async (req, res) => {
  try {
    const totals = await getClosedDebtorTotals(closedFilters(req));
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load closed-file totals', detail: error.message });
  }
});

router.get('/export', async (req, res) => {
  try {
    const rows = await listClosedDebtorsForExport(closedFilters(req));
    res.json(rows);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export closed files', detail: error.message });
  }
});

module.exports = router;
