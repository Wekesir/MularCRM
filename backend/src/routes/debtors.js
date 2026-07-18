const express = require('express');
const multer = require('multer');
const {
  listDebtors,
  listAllDebtors,
  listDebtorBuckets,
  listDebtorAgents,
  getDebtorTotals,
  getDebtorById,
  getDebtorHistory,
  listDebtorFiles,
  softDeleteDebtorFile,
  closeDebtorCase,
  reopenDebtorCase,
} = require('../services/debtorService');
const {
  generateTemplateBuffer,
  templateHeaders,
  parseAndImportDebtors,
  BulkUploadError,
  MAX_DATA_ROWS,
} = require('../services/debtorBulkUploadService');
const { recordActivityEvent, recordActivityEvents } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');
const { getUserEffectivePermissions } = require('../services/userService');
const { isSeniorSupervisorRole } = require('../config/orgRoles');

const router = express.Router();

router.use(requireAuth);

async function assertCanBulkUploadDebtors(user) {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  if (user.isSystemAdmin || isSeniorSupervisorRole(user)) return;
  const perms = await getUserEffectivePermissions(user.id);
  if (perms?.management?.debtor_management?.create) return;
  const err = new Error('You do not have permission to upload debtor files');
  err.status = 403;
  throw err;
}

// Pull the advanced-filter params from the query string into a single object
// shared by the list, totals, buckets, agents and export endpoints.
function debtorFilters(req) {
  const q = req.query || {};
  return {
    user: req.user || null,
    fileId: q.fileId || null,
    clientId: q.clientId || null,
    bucket: q.bucket || null,
    agent: q.agent || null,
    contactStatusId: q.contactStatusId || null,
    assignmentStatus: q.assignmentStatus || null,
    closed: q.closed === undefined ? null : q.closed,
    ptp: q.ptp === undefined ? null : q.ptp,
    discounted: q.discounted === undefined ? null : q.discounted,
    dpdMin: q.dpdMin || null,
    dpdMax: q.dpdMax || null,
    balanceMin: q.balanceMin || null,
    balanceMax: q.balanceMax || null,
    lastContactedFrom: q.lastContactedFrom || null,
    lastContactedTo: q.lastContactedTo || null,
    nextActionFrom: q.nextActionFrom || null,
    nextActionTo: q.nextActionTo || null,
    search: q.search || null,
  };
}

// In-memory multipart upload for the bulk CSV file. .csv only, ~5MB cap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isCsv =
      file.mimetype === 'text/csv' ||
      file.mimetype === 'application/csv' ||
      file.originalname.toLowerCase().endsWith('.csv');
    if (!isCsv) {
      return cb(
        new BulkUploadError(
          'Only CSV (.csv) files are accepted. Please download the template and upload it as .csv.',
          { code: 'INVALID_FILE' }
        )
      );
    }
    cb(null, true);
  },
});

router.get('/', async (req, res) => {
  try {
    const result = await listDebtors({
      ...debtorFilters(req),
      page: req.query.page || 1,
      pageSize: req.query.pageSize || 25,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list debtors', detail: error.message });
  }
});

// Distinct buckets for the filter dropdown (respects current filters).
router.get('/buckets', async (req, res) => {
  try {
    const buckets = await listDebtorBuckets(debtorFilters(req));
    res.json(buckets);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list buckets', detail: error.message });
  }
});

// Distinct assigned-agent values for the Agent filter dropdown.
router.get('/agents', async (req, res) => {
  try {
    const agents = await listDebtorAgents(debtorFilters(req));
    res.json(agents);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list agents', detail: error.message });
  }
});

// Unpaginated export of every debtor matching the current filters (CSV/Excel
// export buttons hit this so they get the full filtered set, not just a page).
router.get('/export', async (req, res) => {
  try {
    const items = await listAllDebtors(debtorFilters(req));
    res.json(items);
  } catch (error) {
    res.status(500).json({ message: 'Failed to export debtors', detail: error.message });
  }
});

// Aggregate totals for stat cards (respects the same filters as the list).
router.get('/totals', async (req, res) => {
  try {
    const totals = await getDebtorTotals(debtorFilters(req));
    res.json(totals);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load debtor totals', detail: error.message });
  }
});

// List bulk-upload batches (debtor_files) — used by the file filter on the
// debtor management page. Registered before '/:id' so the literal "files"
// segment is not captured as an id.
router.get('/files', async (req, res) => {
  try {
    const files = await listDebtorFiles({ user: req.user });
    res.json(files);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list debtor files', detail: error.message });
  }
});

// Soft-delete a batch file and every debtor that belongs to it. The file and
// its debtors are marked deleted_at (not physically removed), so they stop
// appearing in listings but the data is retained.
router.delete('/files/:id', async (req, res) => {
  try {
    const result = await softDeleteDebtorFile(req.params.id, { user: req.user });
    if (!result.deleted) {
      return res.status(404).json({ message: 'File not found or already deleted.' });
    }
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debtor_file.deleted',
      title: 'Debtor File Deleted',
      subject: `Batch #${result.fileId}`,
      entityType: 'debtor_file',
      entityId: String(result.fileId),
    }).catch(() => {});

    const deletedDebtors = Array.isArray(result.debtors) ? result.debtors : [];
    if (deletedDebtors.length > 0) {
      recordActivityEvents(
        deletedDebtors.map((d) => ({
          userId: req.user?.id,
          userName: req.user?.name,
          actionType: 'debtor.soft_deleted',
          title: 'Debtor Removed from Portfolio',
          subject: d.name || `Debtor #${d.id}`,
          entityType: 'debtor',
          entityId: String(d.id),
          metadata: {
            fileId: result.fileId,
            source: 'file_delete',
          },
        }))
      ).catch(() => {});
    }

    return res.json({ message: 'File and its debtors have been deleted.', fileId: result.fileId });
  } catch (error) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return res.status(403).json({ message: error.message });
    }
    console.error('[debtors] file delete failed:', error);
    return res.status(500).json({ message: 'Failed to delete file', detail: error.message });
  }
});

// Download the debtor CSV template. Registered before '/:id' so the literal
// "template" segment is not captured as an id.
router.get('/template', async (_req, res) => {
  try {
    const buffer = generateTemplateBuffer();
    res.set(templateHeaders());
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    console.error('[debtors] template generation failed:', error);
    return res
      .status(500)
      .json({ message: 'Failed to generate template', detail: error.message });
  }
});

router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  try {
    await assertCanBulkUploadDebtors(req.user);

    if (!req.file) {
      return res
        .status(400)
        .json({ message: 'No file was uploaded. Please choose a .csv file.' });
    }

    // Form selections sent alongside the file (one batch → one client/category/type/currency).
    // Call center is automatic when the client is already bound; otherwise required.
    const options = {
      clientId: req.body.clientId || null,
      debtCategoryId: req.body.debtCategoryId || null,
      debtTypeId: req.body.debtTypeId || null,
      currencyId: req.body.currencyId || null,
      callCenterId: req.body.callCenterId || null,
      forceCallCenter:
        req.body.forceCallCenter === '1' ||
        req.body.forceCallCenter === 'true' ||
        req.body.forceCallCenter === true,
      performedBy: req.user,
    };

    const result = await parseAndImportDebtors(req.file.buffer, req.user?.id, options);
    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof BulkUploadError) {
      const status =
        error.code === 'INVALID_FILE' || error.code === 'INVALID_STRUCTURE' ? 400 : 422;
      return res.status(status).json({ message: error.message });
    }
    if (error.code === 'ALREADY_ASSIGNED' || error.code === 'FORBIDDEN' || error.code === 'VALIDATION') {
      return res.status(error.status || 400).json({ message: error.message });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res
          .status(413)
          .json({ message: `File is too large. Maximum size is 5MB (up to ${MAX_DATA_ROWS} debtor rows).` });
      }
      return res.status(400).json({ message: error.message });
    }
    if (error?.code === 'INVALID_FILE' || error?.code === 'INVALID_STRUCTURE') {
      return res.status(400).json({ message: error.message });
    }
    console.error('[debtors] bulk upload failed:', error);
    return res
      .status(500)
      .json({ message: 'Failed to process bulk upload', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const debtor = await getDebtorById(req.params.id, { user: req.user });
    if (!debtor) return res.status(404).json({ message: 'Debtor not found' });
    res.json(debtor);
  } catch (error) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return res.status(403).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to get debtor', detail: error.message });
  }
});

router.get('/:id/history', async (req, res) => {
  try {
    const result = await getDebtorHistory(req.params.id, { user: req.user });
    if (!result) return res.status(404).json({ message: 'Debtor not found' });
    res.json(result);
  } catch (error) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return res.status(403).json({ message: error.message });
    }
    res
      .status(500)
      .json({ message: 'Failed to load debtor history', detail: error.message });
  }
});

// Close a case (system admin) — moves it to the Closed Files page.
router.post('/:id/close', requireSystemAdmin, async (req, res) => {
  try {
    const debtor = await closeDebtorCase(req.params.id, req.body?.reason);
    res.json(debtor);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debtor.case_closed',
      title: 'Case Closed',
      subject: debtor.name,
      entityType: 'debtor',
      entityId: String(debtor.id),
      metadata: { closureReason: debtor.closureReason },
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to close case', detail: error.message });
  }
});

// Reopen a previously closed case (system admin).
router.post('/:id/reopen', requireSystemAdmin, async (req, res) => {
  try {
    const debtor = await reopenDebtorCase(req.params.id);
    res.json(debtor);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'debtor.case_reopened',
      title: 'Case Reopened',
      subject: debtor.name,
      entityType: 'debtor',
      entityId: String(debtor.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to reopen case', detail: error.message });
  }
});

module.exports = router;
