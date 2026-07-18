const express = require('express');
const {
  listClientCaseSummary,
  listClientFiles,
  listUnassignedFiles,
  getFileAllocation,
  assignFileAgents,
  unassignFileAgents,
  reallocateFileAgents,
  assignCases,
  unassignCases,
} = require('../services/caseManagementService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireCaseAssigner } = require('../middleware/requireCaseAssigner');

const router = express.Router();

router.use(requireAuth);

// Per-client case aggregates that power the Case Management table.
router.get('/', async (req, res) => {
  try {
    const summary = await listClientCaseSummary({
      search: req.query.search || '',
      user: req.user,
    });
    res.json(summary);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load case summary', detail: error.message });
  }
});

// Batch files that still have unassigned cases — Unassigned Files module.
router.get('/unassigned-files', requireCaseAssigner, async (req, res) => {
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

// All batch files (debtor_files) for a single client — opened by the
// "View Files" button on a client row.
router.get('/clients/:clientId/files', async (req, res) => {
  try {
    const files = await listClientFiles(req.params.clientId, { user: req.user });
    res.json(files);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load client files', detail: error.message });
  }
});

// Current per-agent allocation breakdown for a case file.
router.get('/files/:fileId/allocation', async (req, res) => {
  try {
    const allocation = await getFileAllocation(req.params.fileId, { user: req.user });
    if (!allocation) return res.status(404).json({ message: 'Case file not found' });
    res.json(allocation);
  } catch (error) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to load allocation', detail: error.message });
  }
});

// Round-robin assign the file's unassigned cases to the selected agents.
router.post('/files/:fileId/assign', requireCaseAssigner, async (req, res) => {
  try {
    const result = await assignFileAgents(req.params.fileId, req.body?.agentIds || [], {
      performedBy: req.user,
    });
    res.json(result);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message });
    }
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    res.status(500).json({ message: 'Failed to assign agents', detail: error.message });
  }
});

// Clear assignments for the chosen agents within the file.
router.post('/files/:fileId/unassign', requireCaseAssigner, async (req, res) => {
  try {
    const result = await unassignFileAgents(req.params.fileId, req.body?.agentIds || [], {
      performedBy: req.user,
    });
    res.json(result);
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    res.status(500).json({ message: 'Failed to unassign agents', detail: error.message });
  }
});

// Move cases from one agent to another within the file.
router.post('/files/:fileId/reallocate', requireCaseAssigner, async (req, res) => {
  try {
    const result = await reallocateFileAgents(
      req.params.fileId,
      { fromAgentId: req.body?.fromAgentId, toAgentId: req.body?.toAgentId },
      { performedBy: req.user }
    );
    res.json(result);
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    res.status(500).json({ message: 'Failed to reallocate cases', detail: error.message });
  }
});

// Assign a specific set of cases (by debtor id) to chosen agents (round-robin).
router.post('/files/:fileId/cases/assign', requireCaseAssigner, async (req, res) => {
  try {
    const result = await assignCases(
      req.params.fileId,
      req.body?.debtorIds || [],
      req.body?.agentIds || [],
      { performedBy: req.user }
    );
    res.json(result);
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    res.status(500).json({ message: 'Failed to assign cases', detail: error.message });
  }
});

// Clear assignments on a specific set of cases (by debtor id).
router.post('/files/:fileId/cases/unassign', requireCaseAssigner, async (req, res) => {
  try {
    const result = await unassignCases(req.params.fileId, req.body?.debtorIds || [], {
      performedBy: req.user,
    });
    res.json(result);
  } catch (error) {
    if (error.code === 'VALIDATION') return res.status(400).json({ message: error.message });
    if (error.code === 'NOT_FOUND') return res.status(404).json({ message: error.message });
    res.status(500).json({ message: 'Failed to unassign cases', detail: error.message });
  }
});

module.exports = router;
