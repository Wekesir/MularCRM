const express = require('express');
const {
  listContactStatuses,
  getContactStatusById,
  createContactStatus,
  updateContactStatus,
  deleteContactStatus,
} = require('../services/contactStatusService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/', async (_req, res) => {
  try {
    const statuses = await listContactStatuses();
    res.json(statuses);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list contact statuses', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const status = await getContactStatusById(req.params.id);
    if (!status) return res.status(404).json({ message: 'Contact status not found' });
    res.json(status);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get contact status', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const status = await createContactStatus(req.body);
    res.status(201).json(status);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'contact_status.created',
      title: 'Contact Status Created',
      subject: status.name,
      entityType: 'contact_status',
      entityId: String(status.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to create contact status', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const status = await updateContactStatus(req.params.id, req.body);
    if (!status) return res.status(404).json({ message: 'Contact status not found' });
    res.json(status);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'contact_status.updated',
      title: 'Contact Status Updated',
      subject: status.name,
      entityType: 'contact_status',
      entityId: String(status.id),
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION' || error.code === 'DUPLICATE') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to update contact status', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getContactStatusById(req.params.id);
    const result = await deleteContactStatus(req.params.id);
    if (!result.deleted) return res.status(404).json({ message: 'Contact status not found' });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'contact_status.deleted',
      title: 'Contact Status Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'contact_status',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    if (error.code === 'VALIDATION') {
      return res.status(400).json({ message: error.message });
    }
    res.status(500).json({ message: 'Failed to delete contact status', detail: error.message });
  }
});

module.exports = router;
