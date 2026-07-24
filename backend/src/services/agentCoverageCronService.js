const cron = require('node-cron');
const { syncCoverageWindows } = require('./agentCoverageService');
const { syncStaffCoverageWindows } = require('./staffCoverageService');

const TIMEZONE = process.env.AUTH_SESSION_TIMEZONE || 'Africa/Nairobi';
/** Every 5 minutes — activate due scheduled coverages and end expired ones. */
const CRON_EXPR = '*/5 * * * *';

let scheduledTask = null;

async function executeCoverageSync() {
  try {
    const [agentResult, staffResult] = await Promise.all([
      syncCoverageWindows(),
      syncStaffCoverageWindows(),
    ]);
    if (agentResult.activated || agentResult.ended) {
      console.info(
        `[coverage-cron] agents activated=${agentResult.activated} ended=${agentResult.ended}`
      );
    }
    if (staffResult.activated || staffResult.ended) {
      console.info(
        `[coverage-cron] staff activated=${staffResult.activated} ended=${staffResult.ended}`
      );
    }
  } catch (error) {
    console.error('[coverage-cron] sync failed:', error.message);
  }
}

async function startCoverageCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
  if (!cron.validate(CRON_EXPR)) {
    throw new Error(`Invalid coverage cron expression: ${CRON_EXPR}`);
  }
  scheduledTask = cron.schedule(CRON_EXPR, () => {
    executeCoverageSync();
  }, { timezone: TIMEZONE });
  // Run once on boot so scheduled windows apply without waiting for the first tick.
  await executeCoverageSync();
  console.info(`[coverage-cron] scheduled ${CRON_EXPR} (${TIMEZONE})`);
  return scheduledTask;
}

function stopCoverageCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
  }
}

module.exports = {
  startCoverageCron,
  stopCoverageCron,
  executeCoverageSync,
};
