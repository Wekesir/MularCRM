const express = require('express');
const {
  listUsers,
  listUsersPaginated,
  listDeletedUsers,
  listDeletedUsersPaginated,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  restoreUser,
  getUserEffectivePermissions,
} = require('../services/userService');
const { generateTemporaryPassword } = require('../services/passwordService');
const {
  sendWelcomeEmail,
  sendAccountDeletedEmail,
} = require('../services/emailService');
const { sendWelcomeSms, sendAccountDeletedSms } = require('../services/smsService');
const { getSystemConfig } = require('../services/systemConfigService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');
const { requireSystemAdmin } = require('../middleware/requireSystemAdmin');

const router = express.Router();

router.use(requireAuth);

function getSearchValue(query) {
  if (query.search && typeof query.search === 'object') {
    return query.search.value || '';
  }
  return query['search[value]'] || '';
}

// Sends the welcome email (with temp password) and a heads-up SMS.
// Failures are logged but never block user creation.
async function notifyNewUser({ user, temporaryPassword }) {
  const result = { email: null, sms: null };

  try {
    await sendWelcomeEmail({
      to: user.email,
      name: user.name,
      temporaryPassword,
      userId: user.id,
    });
    result.email = 'sent';
  } catch (error) {
    console.warn('[users] Welcome email failed:', error.message);
    result.email = 'failed';
  }

  if (user.phone) {
    try {
      const config = await getSystemConfig({ mask: false });
      const businessName = config.business?.name || 'OMNICRM';
      const smsResult = await sendWelcomeSms({
        to: user.phone,
        businessName,
        userId: user.id,
      });
      result.sms = smsResult.sent ? 'sent' : 'skipped';
    } catch (error) {
      console.warn('[users] Welcome SMS failed:', error.message);
      result.sms = 'failed';
    }
  } else {
    result.sms = 'no_phone';
  }

  return result;
}

// Notifies a user that their platform access has been removed (soft delete).
// Email + SMS are sent in parallel; failures are logged but never block deletion.
async function notifyUserDeleted(user) {
  const result = { email: null, sms: null };

  const config = await getSystemConfig({ mask: false });
  const businessName = config.business?.name || 'OMNICRM';
  const emailTemplateId = config.notifications?.accountDeletedEmailTemplateId || null;
  const smsTemplateId = config.notifications?.accountDeletedSmsTemplateId || null;

  const [emailResult, smsResult] = await Promise.allSettled([
    sendAccountDeletedEmail({
      to: user.email,
      name: user.name,
      userId: user.id,
      templateId: emailTemplateId,
    }),
    user.phone
      ? sendAccountDeletedSms({
          to: user.phone,
          businessName,
          name: user.name,
          userId: user.id,
          templateId: smsTemplateId,
        })
      : Promise.resolve({ sent: false, reason: 'no_phone' }),
  ]);

  if (emailResult.status === 'fulfilled') {
    result.email = 'sent';
  } else {
    console.warn('[users] Account-deleted email failed:', emailResult.reason?.message);
    result.email = 'failed';
  }

  if (smsResult.status === 'fulfilled') {
    const sms = smsResult.value;
    result.sms = !user.phone ? 'no_phone' : sms.sent ? 'sent' : 'skipped';
  } else {
    console.warn('[users] Account-deleted SMS failed:', smsResult.reason?.message);
    result.sms = user.phone ? 'failed' : 'no_phone';
  }

  return result;
}

router.get('/', async (req, res) => {
  try {
    if (req.query.draw !== undefined) {
      const result = await listUsersPaginated({
        draw: req.query.draw,
        start: req.query.start,
        length: req.query.length,
        search: getSearchValue(req.query),
      });
      return res.json(result);
    }

    const users = await listUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list users', detail: error.message });
  }
});

// Must be registered BEFORE /:id so "deleted" is not captured as an id.
router.get('/deleted', requireSystemAdmin, async (req, res) => {
  try {
    if (req.query.draw !== undefined) {
      const result = await listDeletedUsersPaginated({
        draw: req.query.draw,
        start: req.query.start,
        length: req.query.length,
        search: getSearchValue(req.query),
      });
      return res.json(result);
    }

    const users = await listDeletedUsers();
    res.json(users);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list deleted users', detail: error.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user', detail: error.message });
  }
});

router.get('/:id/permissions', async (req, res) => {
  try {
    const permissions = await getUserEffectivePermissions(req.params.id);
    if (!permissions) return res.status(404).json({ message: 'User not found' });
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user permissions', detail: error.message });
  }
});

router.post('/', async (req, res) => {
  try {
    // Temporary password is always system-generated, never set by the registrar.
    const temporaryPassword = generateTemporaryPassword();

    const user = await createUser({ ...req.body, password: temporaryPassword });

    if (user && user.error) {
      if (user.code === 'USER_DELETED' || user.code === 'USER_EXISTS') {
        return res.status(409).json({
          message: user.error,
          code: user.code,
          deletedUserId: user.deletedUserId,
          deletedName: user.deletedName,
          email: user.email,
        });
      }
      return res.status(400).json({ message: user.error });
    }

    const notifications = await notifyNewUser({ user, temporaryPassword });

    res.status(201).json({ ...user, notifications });
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'user.created',
      title: 'User Created',
      subject: user.name,
      entityType: 'user',
      entityId: String(user.id),
      metadata: { createdUserId: user.id, email: user.email },
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to create user', detail: error.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const user = await updateUser(req.params.id, req.body);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'user.updated',
      title: 'User Updated',
      subject: user.name,
      entityType: 'user',
      entityId: String(user.id),
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to update user', detail: error.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const existing = await getUserById(req.params.id);
    const result = await deleteUser(req.params.id);
    if (result.error) return res.status(400).json({ message: result.error });

    // Notify the deleted user via email + SMS. Non-blocking: failures do not
    // affect the delete result. The user row still exists (soft delete) so the
    // audit FK linkage is preserved.
    let notifications = null;
    if (result.user) {
      try {
        notifications = await notifyUserDeleted(result.user);
      } catch (error) {
        console.warn('[users] Deleted-user notification failed:', error.message);
      }
    }

    res.json({ success: true, notifications });
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'user.deleted',
      title: 'User Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'user',
      entityId: req.params.id,
      metadata: { deletedUserId: existing?.id, email: existing?.email },
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user', detail: error.message });
  }
});

router.post('/:id/restore', requireSystemAdmin, async (req, res) => {
  try {
    const result = await restoreUser(req.params.id);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'user.restored',
      title: 'User Restored',
      subject: result.user?.name || req.params.id,
      entityType: 'user',
      entityId: req.params.id,
      metadata: { restoredUserId: result.user?.id, email: result.user?.email },
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to restore user', detail: error.message });
  }
});

module.exports = router;
