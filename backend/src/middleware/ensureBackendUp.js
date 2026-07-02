let isReady = false;

function markBackendReady() {
  isReady = true;
}

function ensureBackendUp(_req, res, next) {
  if (!isReady) {
    return res.status(503).json({
      status: 'error',
      service: 'backend',
      message: 'Backend is not ready',
    });
  }

  next();
}

module.exports = { ensureBackendUp, markBackendReady };
