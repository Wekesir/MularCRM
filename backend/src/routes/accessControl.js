const express = require('express');
const {
  getPermissionRegistry,
  listRoles,
  listRolesPaginated,
  getRoleById,
  createRole,
  updateRole,
  deleteRole,
  listUsers,
  listUsersPaginated,
  getUserById,
  createUser,
  updateUser,
  deleteUser,
  getUserEffectivePermissions,
} = require('../services/accessControlService');
const { generateTemporaryPassword } = require('../services/passwordService');
const { sendWelcomeEmail } = require('../services/emailService');
const { sendWelcomeSms } = require('../services/smsService');
const { getSystemConfig } = require('../services/systemConfigService');
const { recordActivityEvent } = require('../services/activityService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

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
    console.warn('[accessControl] Welcome email failed:', error.message);
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
      console.warn('[accessControl] Welcome SMS failed:', error.message);
      result.sms = 'failed';
    }
  } else {
    result.sms = 'no_phone';
  }

  return result;
}

router.use(requireAuth);

function getSearchValue(query) {
  if (query.search && typeof query.search === 'object') {
    return query.search.value || '';
  }
  return query['search[value]'] || '';
}

router.get('/permission-registry', (_req, res) => {
  res.json(getPermissionRegistry());
});

router.get('/roles', async (req, res) => {
  try {
    if (req.query.draw !== undefined) {
      const result = await listRolesPaginated({
        draw: req.query.draw,
        start: req.query.start,
        length: req.query.length,
        search: getSearchValue(req.query),
      });
      return res.json(result);
    }

    const roles = await listRoles();
    res.json(roles);
  } catch (error) {
    res.status(500).json({ message: 'Failed to list roles', detail: error.message });
  }
});

router.get('/roles/:id', async (req, res) => {
  try {
    const role = await getRoleById(req.params.id);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get role', detail: error.message });
  }
});

router.post('/roles', async (req, res) => {
  try {
    const role = await createRole(req.body);
    res.status(201).json(role);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.created',
      title: 'Role Created',
      subject: role.name,
      entityType: 'role',
      entityId: String(role.id),
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to create role', detail: error.message });
  }
});

router.put('/roles/:id', async (req, res) => {
  try {
    const role = await updateRole(req.params.id, req.body);
    if (!role) return res.status(404).json({ message: 'Role not found' });
    res.json(role);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.updated',
      title: 'Role Updated',
      subject: role.name,
      entityType: 'role',
      entityId: String(role.id),
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to update role', detail: error.message });
  }
});

router.delete('/roles/:id', async (req, res) => {
  try {
    const existing = await getRoleById(req.params.id);
    const result = await deleteRole(req.params.id);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'role.deleted',
      title: 'Role Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'role',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete role', detail: error.message });
  }
});

router.get('/users', async (req, res) => {
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

router.get('/users/:id', async (req, res) => {
  try {
    const user = await getUserById(req.params.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user', detail: error.message });
  }
});

router.get('/users/:id/permissions', async (req, res) => {
  try {
    const permissions = await getUserEffectivePermissions(req.params.id);
    if (!permissions) return res.status(404).json({ message: 'User not found' });
    res.json(permissions);
  } catch (error) {
    res.status(500).json({ message: 'Failed to get user permissions', detail: error.message });
  }
});

router.post('/users', async (req, res) => {
  try {
    // Temporary password is always system-generated, never set by the registrar.
    const temporaryPassword = generateTemporaryPassword();

    const user = await createUser({ ...req.body, password: temporaryPassword });
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

router.put('/users/:id', async (req, res) => {
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

router.delete('/users/:id', async (req, res) => {
  try {
    const existing = await getUserById(req.params.id);
    const result = await deleteUser(req.params.id);
    if (result.error) return res.status(400).json({ message: result.error });
    res.json(result);
    recordActivityEvent({
      userId: req.user?.id,
      userName: req.user?.name,
      actionType: 'user.deleted',
      title: 'User Deleted',
      subject: existing?.name || req.params.id,
      entityType: 'user',
      entityId: req.params.id,
    }).catch(() => {});
  } catch (error) {
    res.status(500).json({ message: 'Failed to delete user', detail: error.message });
  }
});

module.exports = router;
