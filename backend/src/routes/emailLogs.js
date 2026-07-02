const express = require('express');
const { listEmailAudits, getEmailAuditStats } = require('../services/auditService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

function getSearchValue(query) {
  if (query.search && typeof query.search === 'object') {
    return query.search.value || '';
  }
  return query['search[value]'] || query.search || '';
}

function buildListParams(query) {
  return {
    draw: query.draw,
    start: query.start,
    length: query.length,
    page: query.page,
    limit: query.limit,
    search: getSearchValue(query),
    status: query.status,
    category: query.category,
    userId: query.userId,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

// DataTables server-side list of sent emails (read-only)
router.get('/', async (req, res) => {
  try {
    const result = await listEmailAudits(buildListParams(req.query));
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load email logs', detail: error.message });
  }
});

// Stats for the Bulk Emails page and Communication Channels stat cards.
// Defaults to the current calendar month; pass dateFrom/dateTo to view a custom range.
router.get('/stats', async (req, res) => {
  try {
    const stats = await getEmailAuditStats({
      dateFrom: req.query.dateFrom || undefined,
      dateTo: req.query.dateTo || undefined,
    });
    res.json(stats);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load email stats', detail: error.message });
  }
});

module.exports = router;
