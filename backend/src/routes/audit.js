const express = require('express');
const {
  listLoginAudits,
  getLoginAuditById,
  createLoginAudit,
  updateLoginAudit,
  deleteLoginAudit,
  clearLoginAudits,
  getLoginAuditStats,
  listEmailAudits,
  getEmailAuditById,
  createEmailAudit,
  updateEmailAudit,
  deleteEmailAudit,
  clearEmailAudits,
  getEmailAuditStats,
  listSmsAudits,
  getSmsAuditById,
  createSmsAudit,
  updateSmsAudit,
  deleteSmsAudit,
  clearSmsAudits,
  getSmsAuditStats,
} = require('../services/auditService');
const {
  listActivityLogs,
  getActivityLogById,
  deleteActivityLog,
  clearActivityLogs,
  getActivityStats,
} = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

function requireSystemAdmin(req, res, next) {
  if (!req.user?.isSystemAdmin) {
    return res.status(403).json({ message: 'System administrator access required' });
  }
  return next();
}

router.use(requireSystemAdmin);

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
    activeOnly: query.activeOnly,
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
  };
}

/**
 * Registers a standard CRUD + stats route group for an audit resource.
 */
function registerResource(basePath, handlers, labels) {
  router.get(`${basePath}/stats`, async (_req, res) => {
    try {
      const stats = await handlers.stats();
      res.json(stats);
    } catch (error) {
      res.status(500).json({ message: `Failed to load ${labels.plural} stats`, detail: error.message });
    }
  });

  router.get(basePath, async (req, res) => {
    try {
      const result = await handlers.list(buildListParams(req.query));
      res.json(result);
    } catch (error) {
      res.status(500).json({ message: `Failed to list ${labels.plural}`, detail: error.message });
    }
  });

  router.get(`${basePath}/:id`, async (req, res) => {
    try {
      const record = await handlers.get(req.params.id);
      if (!record) return res.status(404).json({ message: `${labels.singular} not found` });
      res.json(record);
    } catch (error) {
      res.status(500).json({ message: `Failed to get ${labels.singular}`, detail: error.message });
    }
  });

  router.post(basePath, async (req, res) => {
    try {
      const record = await handlers.create(req.body || {});
      if (!record) return res.status(400).json({ message: `Failed to create ${labels.singular}` });
      res.status(201).json(record);
    } catch (error) {
      res.status(500).json({ message: `Failed to create ${labels.singular}`, detail: error.message });
    }
  });

  router.put(`${basePath}/:id`, async (req, res) => {
    try {
      const record = await handlers.update(req.params.id, req.body || {});
      if (!record) return res.status(404).json({ message: `${labels.singular} not found` });
      res.json(record);
    } catch (error) {
      res.status(500).json({ message: `Failed to update ${labels.singular}`, detail: error.message });
    }
  });

  router.delete(basePath, async (req, res) => {
    try {
      const deleted = await handlers.clear({ olderThanDays: req.query.olderThanDays });
      res.json({ deleted });
    } catch (error) {
      res.status(500).json({ message: `Failed to clear ${labels.plural}`, detail: error.message });
    }
  });

  router.delete(`${basePath}/:id`, async (req, res) => {
    try {
      const ok = await handlers.remove(req.params.id);
      if (!ok) return res.status(404).json({ message: `${labels.singular} not found` });
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ message: `Failed to delete ${labels.singular}`, detail: error.message });
    }
  });
}

registerResource(
  '/logins',
  {
    list: listLoginAudits,
    get: getLoginAuditById,
    create: createLoginAudit,
    update: updateLoginAudit,
    remove: deleteLoginAudit,
    clear: clearLoginAudits,
    stats: getLoginAuditStats,
  },
  { singular: 'Login record', plural: 'login records' }
);

registerResource(
  '/emails',
  {
    list: listEmailAudits,
    get: getEmailAuditById,
    create: createEmailAudit,
    update: updateEmailAudit,
    remove: deleteEmailAudit,
    clear: clearEmailAudits,
    stats: getEmailAuditStats,
  },
  { singular: 'Email record', plural: 'email records' }
);

registerResource(
  '/sms',
  {
    list: listSmsAudits,
    get: getSmsAuditById,
    create: createSmsAudit,
    update: updateSmsAudit,
    remove: deleteSmsAudit,
    clear: clearSmsAudits,
    stats: getSmsAuditStats,
  },
  { singular: 'SMS record', plural: 'SMS records' }
);

registerResource(
  '/activities',
  {
    list: listActivityLogs,
    get: getActivityLogById,
    // Activities are recorded internally by system actions; not created/edited via the admin API.
    create: async () => null,
    update: async () => null,
    remove: deleteActivityLog,
    clear: clearActivityLogs,
    stats: getActivityStats,
  },
  { singular: 'Activity record', plural: 'activity records' }
);

module.exports = router;
