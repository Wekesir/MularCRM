const { verifySessionToken } = require('../services/authService');
const { getUserById } = require('../services/accessControlService');

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;

  if (!token) {
    return res.status(401).json({ message: 'Authentication required' });
  }

  const payload = verifySessionToken(token);
  if (!payload?.userId) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }

  const user = await getUserById(payload.userId);
  if (!user || !user.isActive) {
    return res.status(401).json({ message: 'Invalid or expired session' });
  }

  req.user = {
    id: user.id,
    email: user.email,
    name: user.name,
    isSystemAdmin: user.isSystemAdmin,
  };
  req.authToken = token;
  req.sessionId = payload.sid || null;

  return next();
}

module.exports = { requireAuth };
