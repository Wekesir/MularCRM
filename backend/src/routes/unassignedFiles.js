const express = require('express');
const { listUnassignedFiles } = require('../services/caseManagementService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireCaseAssigner } = require('../middleware/requireCaseAssigner');

const router = express.Router();

router.use(requireAuth);
router.use(requireCaseAssigner);

/**
 * GET /api/unassigned-files
 * Open batch files that still have at least one unassigned debtor case.
 * Query: ?search= optional file/client name filter
 */
router.get('/', async (req, res) => {
  try {
    const files = await listUnassignedFiles({
      search: req.query.search || '',
      user: req.user,
    });
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load unassigned files', detail: error.message });
  }
});

module.exports = router;
