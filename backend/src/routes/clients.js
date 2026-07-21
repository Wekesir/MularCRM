const express = require('express');
const multer = require('multer');
const {
  listClients,
  getClientById,
  createClient,
  updateClient,
  deleteClient,
  assignClientCallCenter,
  assertCallerCanAccessClient,
} = require('../services/clientService');
const { sendOnboardingNotifications } = require('../services/onboardingNotifications');
const {
  generateTemplateBuffer,
  templateHeaders,
  parseAndImportClients,
  BulkUploadError,
  MAX_DATA_ROWS,
} = require('../services/clientBulkUploadService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { getUserEffectivePermissions } = require('../services/userService');
const { isSeniorSupervisorRole, isRegionalManagerRole } = require('../config/orgRoles');

const router = express.Router();

router.use(requireAuth);

async function assertCanManageClients(user, action) {
  if (!user) {
    const err = new Error('Authentication required');
    err.status = 401;
    throw err;
  }
  if (user.isSystemAdmin || isSeniorSupervisorRole(user) || isRegionalManagerRole(user)) return;
  const perms = await getUserEffectivePermissions(user.id);
  const node = perms?.management?.client_management;
  if (action === 'create' && node?.create) return;
  if (action === 'update' && node?.update) return;
  if (action === 'delete' && node?.delete) return;
  const err = new Error('You do not have permission to manage clients');
  err.status = 403;
  throw err;
}

// In-memory multipart upload for the bulk Excel file. .xlsx only, ~5MB cap.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const isXlsx =
      file.mimetype ===
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
      file.originalname.toLowerCase().endsWith('.xlsx');
    if (!isXlsx) {
      return cb(new BulkUploadError('Only Excel (.xlsx) files are accepted. Please download the template and upload it as .xlsx.', { code: 'INVALID_FILE' }));
    }
    cb(null, true);
  },
});

router.get('/', async (req, res) => {
  try {
    const unassignedOnly =
      req.query.unassignedOnly === '1' || req.query.unassignedOnly === 'true';
    const clients = await listClients({ user: req.user, unassignedOnly });
    res.json(clients);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list clients', detail: error.message });
  }
});

// Download the strict client-upload template (styled header + business-type
// dropdown validation + example row). Registered before '/:id' so the literal
// "template" segment is not captured as an id.
router.get('/template', async (req, res) => {
  try {
    await assertCanManageClients(req.user, 'create');
    const buffer = await generateTemplateBuffer();
    res.set(templateHeaders());
    return res.status(200).send(Buffer.from(buffer));
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      return res.status(error.status).json({ message: error.message });
    }
    console.error('[clients] template generation failed:', error);
    return res.status(500).json({ message: 'Failed to generate template', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const client = await getClientById(req.params.id);
    if (!client || client.deletedAt) return res.status(404).json({ message: 'Client not found' });
    await assertCallerCanAccessClient(req.user, client.id);
    res.json(client);
  } catch (error) {
    if (error.status === 403 || error.code === 'FORBIDDEN') {
      return res.status(403).json({ message: error.message });
    }
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to get client', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    await assertCanManageClients(req.user, 'create');
    const client = await createClient(req.body);

    // Welcome the client via email + SMS. Failures are surfaced in the
    // response but never roll back the onboarding itself.
    const notifications = await sendOnboardingNotifications(client, req.user?.id).catch((err) => ({
      email: { sent: false, message: err.message },
      sms: { sent: false, message: err.message },
    }));

    res.status(201).json({ ...client, notifications });
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'client.created',
      title: 'Client Created',
      subject: client.name,
      entityType: 'client',
      entityId: String(client.id),
    }).catch(() => {});
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'DUPLICATE') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create client', detail: error.message });
  }
});

// Bulk import clients from an Excel (.xlsx) file matching the downloaded
// template. Best-effort: valid rows are created (with onboarding email + SMS),
// invalid rows are skipped and reported back with their Excel row number.
router.post('/bulk-upload', upload.single('file'), async (req, res) => {
  try {
    await assertCanManageClients(req.user, 'create');

    if (!req.file) {
      return res.status(400).json({ message: 'No file was uploaded. Please choose an .xlsx file.' });
    }

    const result = await parseAndImportClients(req.file.buffer, req.user?.id);
    if (Array.isArray(result.created)) {
      result.created.forEach((client) => {
        recordActivityEvent({
          userId: req.user?.id,
          userName: req.user?.name,
          actionType: 'client.created',
          title: 'Client Imported',
          subject: client.name,
          entityType: 'client',
          entityId: String(client.id),
        }).catch(() => {});
      });
    }
    return res.status(200).json(result);
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      return res.status(error.status).json({ message: error.message });
    }
    if (error instanceof BulkUploadError) {
      const status = error.code === 'INVALID_FILE' || error.code === 'INVALID_STRUCTURE' ? 400 : 422;
      return res.status(status).json({ message: error.message });
    }
    if (error instanceof multer.MulterError) {
      if (error.code === 'LIMIT_FILE_SIZE') {
        return res.status(413).json({ message: `File is too large. Maximum size is 5MB (up to ${MAX_DATA_ROWS} client rows).` });
      }
      return res.status(400).json({ message: error.message });
    }
    if (error?.code === 'INVALID_FILE' || error?.code === 'INVALID_STRUCTURE') {
      return res.status(400).json({ message: error.message });
    }
    console.error('[clients] bulk upload failed:', error);
    return res.status(500).json({ message: 'Failed to process bulk upload', detail: error.message });
  }
});

// Once-only client → call center assignment (Admin may force reassign).
router.patch('/:id/call-center', async (req, res) => {
  try {
    const client = await assignClientCallCenter(req.params.id, req.body?.callCenterId, {
      performedBy: req.user,
      force: Boolean(req.body?.force),
    });
    res.json(client);
  } catch (error) {
    if (error.code === 'FORBIDDEN' || error.status === 403) {
      return res.status(403).json({ message: error.message, code: error.code });
    }
    if (error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    if (
      error.code === 'VALIDATION' ||
      error.code === 'ALREADY_ASSIGNED'
    ) {
      return res.status(400).json({ message: error.message, code: error.code });
    }
    res.status(500).json({ message: 'Failed to assign call center', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    await assertCanManageClients(req.user, 'update');
    await assertCallerCanAccessClient(req.user, req.params.id);
    const client = await updateClient(req.params.id, req.body);
    if (!client) return res.status(404).json({ message: 'Client not found' });
    res.json(client);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'client.updated',
      title: 'Client Updated',
      subject: client.name,
      entityType: 'client',
      entityId: String(client.id),
    }).catch(() => {});
  } catch (error) {
    if (error.status === 403 || error.status === 401 || error.code === 'FORBIDDEN') {
      return res.status(error.status || 403).json({ message: error.message });
    }
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    if (error.code === 'DUPLICATE') {
      return res.status(409).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update client', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    await assertCanManageClients(req.user, 'delete');
    await assertCallerCanAccessClient(req.user, req.params.id);
    const existing = await getClientById(req.params.id);
    const result = await deleteClient(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Client not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'client.deleted',
      title: 'Client Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'client',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.status === 403 || error.status === 401 || error.code === 'FORBIDDEN') {
      return res.status(error.status || 403).json({ message: error.message });
    }
    if (error.status === 404 || error.code === 'NOT_FOUND') {
      return res.status(404).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete client', detail: error.message });
  }
});

module.exports = router;
