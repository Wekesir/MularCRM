const express = require('express');
const {
  getUnreadCount,
  listNotificationsPaginated,
  markNotificationRead,
  markAllNotificationsRead,
} = require('../services/notificationService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

router.use(requireAuth);

router.get('/unread-count', async (req, res) => {
  try {
    const count = await getUnreadCount(req.user.email);
    res.json({ count });
  } catch (error) {
    res.status(500).json({ message: 'Failed to get unread count', detail: error.message });
  }
});

router.get('/', async (req, res) => {
  try {
    const result = await listNotificationsPaginated({
      email: req.user.email,
      page: req.query.page,
      limit: req.query.limit,
    });
    res.json(result);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list notifications', detail: error.message });
  }
});

router.patch('/read-all', async (req, res) => {
  try {
    const updated = await markAllNotificationsRead(req.user.email);
    res.json({ updated });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark notifications read', detail: error.message });
  }
});

router.patch('/:id/read', async (req, res) => {
  try {
    const ok = await markNotificationRead(req.params.id, req.user.email);
    if (!ok) return res.status(404).json({ message: 'Notification not found' });
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ message: 'Failed to mark notification read', detail: error.message });
  }
});

module.exports = router;
