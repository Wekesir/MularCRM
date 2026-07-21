require('dotenv').config();

const express = require('express');
const cors = require('cors');
const pool = require('./db/pool');
const { initDatabase } = require('./db/init');
const { ensureBackendUp, markBackendReady } = require('./middleware/ensureBackendUp');
const { ensureDatabaseUp } = require('./middleware/ensureDatabaseUp');
const systemConfigRouter = require('./routes/systemConfig');
const accessControlRouter = require('./routes/accessControl');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors({ origin: process.env.CORS_ORIGIN || 'http://localhost:5173' }));
app.use(express.json({ limit: '10mb' }));

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ status: 'ok', backend: 'up', database: 'connected' });
  } catch (error) {
    res.status(503).json({
      status: 'error',
      backend: 'up',
      database: 'disconnected',
      message: error.message,
    });
  }
});

app.use('/api', ensureBackendUp, ensureDatabaseUp(pool));

app.get('/api', (_req, res) => {
  res.json({ message: 'Welcome to OMNICRM API' });
});

app.use('/api/system-config', systemConfigRouter);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/access', accessControlRouter);
app.use('/api/users', require('./routes/users'));
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/reports', require('./routes/reports'));
app.use('/api/audit', require('./routes/audit'));
app.use('/api/sms-logs', require('./routes/smsLogs'));
app.use('/api/email-logs', require('./routes/emailLogs'));
app.use('/api/clients', require('./routes/clients'));
app.use('/api/call-centers', require('./routes/callCenters'));
app.use('/api/debtors', require('./routes/debtors'));
app.use('/api/closed-files', require('./routes/closedFiles'));
app.use('/api/case-management', require('./routes/caseManagement'));
app.use('/api/unassigned-files', require('./routes/unassignedFiles'));
app.use('/api/debt-categories', require('./routes/debtCategories'));
app.use('/api/regions', require('./routes/regions'));

app.use('/api/debt-types', require('./routes/debtTypes'));
app.use('/api/currencies', require('./routes/currencies'));
app.use('/api/contact-statuses', require('./routes/contactStatuses'));
app.use('/api/dashboard', require('./routes/dashboard'));
app.use('/api/agents', require('./routes/agents'));
app.use('/api/agent-experience-levels', require('./routes/agentExperienceLevels'));
app.use('/api/agent-expertise-areas', require('./routes/agentExpertiseAreas'));
app.use('/api/template-variables', require('./routes/templateVariables'));
app.use('/api/templates', require('./routes/templates'));
app.use('/api/payments', require('./routes/payments'));
app.use('/api/ptp', require('./routes/ptp'));
app.use('/api/loan-restructures', require('./routes/loanRestructures'));
app.use('/api/commissions', require('./routes/commissions'));
app.use('/api/client-commission-rates', require('./routes/clientCommissionRates'));
app.use('/api/backup', require('./routes/backup'));
app.use('/api/live-payments', require('./routes/livePayments'));
app.use('/api/webhooks/africastalking', require('./routes/africastalkingWebhooks'));
app.use('/api/integrations/yeastar', require('./routes/yeastarIntegration'));

async function start() {
  try {
    await initDatabase();
  } catch (error) {
    console.error('Failed to initialize database:', error.message);
  }

  try {
    const { startBackupCron } = require('./services/backupCronService');
    await startBackupCron();
  } catch (error) {
    console.error('Failed to start backup cron:', error.message);
  }

  try {
    const { startLivePaymentsCron } = require('./services/livePaymentsCronService');
    await startLivePaymentsCron();
  } catch (error) {
    console.error('Failed to start live payments cron:', error.message);
  }

  app.listen(PORT, () => {
    markBackendReady();
    console.log(`Backend running on port ${PORT}`);
  });
}

start();
