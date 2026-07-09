const express = require('express');
const {
  login,
  verifyOtp,
  resendOtp,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  logout,
} = require('../services/authService');
const {
  getRegistrationOptions,
  verifyRegistration,
  getAuthenticationOptions,
  verifyAuthentication,
  listUserPasskeys,
  deleteUserPasskey,
} = require('../services/webauthnService');
const { requireAuth } = require('../middleware/requireAuth');

const router = express.Router();

function getClientIp(req) {
  return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

function getClientContext(req) {
  return {
    ip: getClientIp(req),
    userAgent: req.headers['user-agent'] || '',
  };
}

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password are required' });
    }
    const context = getClientContext(req);
    const result = await login({ email, password, ip: context.ip, context });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Login failed' });
  }
});

router.post('/verify-otp', async (req, res) => {
  try {
    const { challengeId, code } = req.body || {};
    if (!challengeId || !code) {
      return res.status(400).json({ message: 'Verification code is required' });
    }
    const context = getClientContext(req);
    const result = await verifyOtp({
      challengeId: Number(challengeId),
      code,
      ip: context.ip,
      context,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Verification failed' });
  }
});

router.post('/resend-otp', async (req, res) => {
  try {
    const { challengeId } = req.body || {};
    if (!challengeId) {
      return res.status(400).json({ message: 'Verification session is required' });
    }
    const result = await resendOtp({
      challengeId: Number(challengeId),
      ip: getClientIp(req),
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Failed to resend code' });
  }
});

router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body || {};
    if (!email) {
      return res.status(400).json({ message: 'Email is required' });
    }
    const result = await forgotPassword({ email, ip: getClientIp(req) });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Request failed' });
  }
});

router.post('/reset-password', async (req, res) => {
  try {
    const { token, newPassword } = req.body || {};
    if (!token || !newPassword) {
      return res.status(400).json({ message: 'Token and new password are required' });
    }
    const result = await resetPassword({ token, newPassword });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Reset failed' });
  }
});

router.post('/change-password', requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ message: 'Current and new passwords are required' });
    }
    const result = await changePassword(req.user.id, { currentPassword, newPassword });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Password change failed' });
  }
});

router.get('/me', requireAuth, async (req, res) => {
  try {
    const user = await getMe(req.user.id);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (error) {
    res.status(500).json({ message: 'Failed to load profile', detail: error.message });
  }
});

router.post('/logout', requireAuth, async (req, res) => {
  try {
    await logout({ sessionId: req.sessionId, userId: req.user.id });
  } catch {
    /* logout audit is best-effort */
  }
  res.json({ message: 'Signed out' });
});

router.get('/webauthn/register/options', requireAuth, async (req, res) => {
  try {
    const options = await getRegistrationOptions(req.user);
    res.json(options);
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Failed to start passkey registration' });
  }
});

router.post('/webauthn/register/verify', requireAuth, async (req, res) => {
  try {
    const { response, deviceName } = req.body || {};
    if (!response) {
      return res.status(400).json({ message: 'Passkey response is required' });
    }
    const result = await verifyRegistration({
      user: req.user,
      response,
      deviceName,
    });
    res.json(result);
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Passkey registration failed' });
  }
});

router.post('/webauthn/authenticate/options', async (req, res) => {
  try {
    const { email } = req.body || {};
    const options = await getAuthenticationOptions({ email });
    res.json(options);
  } catch (error) {
    res
      .status(error.status || 500)
      .json({ message: error.message || 'Failed to start passkey sign-in' });
  }
});

router.post('/webauthn/authenticate/verify', async (req, res) => {
  try {
    const { response } = req.body || {};
    if (!response) {
      return res.status(400).json({ message: 'Passkey response is required' });
    }
    const context = getClientContext(req);
    const result = await verifyAuthentication({
      response,
      ip: context.ip,
      context,
    });
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Passkey sign-in failed' });
  }
});

router.get('/webauthn/credentials', requireAuth, async (req, res) => {
  try {
    const credentials = await listUserPasskeys(req.user.id);
    res.json({ credentials });
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Failed to load passkeys' });
  }
});

router.delete('/webauthn/credentials/:id', requireAuth, async (req, res) => {
  try {
    const result = await deleteUserPasskey(req.user.id, Number(req.params.id));
    res.json(result);
  } catch (error) {
    res.status(error.status || 500).json({ message: error.message || 'Failed to remove passkey' });
  }
});

module.exports = router;
