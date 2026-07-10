const cron = require('node-cron');
const { getSystemConfig } = require('./systemConfigService');
const {
  runLivePaymentsPull,
  getLivePaymentsConfig,
  getLastLivePaymentsStatus,
} = require('./livePaymentsApiService');

/**
 * Poll intervals for live payments.
 * Shorter intervals approximate near-realtime payment visibility for agents.
 */
const FREQUENCY_CRON = {
  every_1_min: '* * * * *',
  every_5_min: '*/5 * * * *',
  every_15_min: '*/15 * * * *',
  every_30_min: '*/30 * * * *',
  hourly: '0 * * * *',
  daily: '0 6 * * *',
};

const FREQUENCY_LABELS = {
  every_1_min: 'Every 1 minute',
  every_5_min: 'Every 5 minutes',
  every_15_min: 'Every 15 minutes',
  every_30_min: 'Every 30 minutes',
  hourly: 'Hourly',
  daily: 'Daily at 06:00',
};

const TIMEZONE = process.env.AUTH_SESSION_TIMEZONE || 'Africa/Nairobi';

let scheduledTask = null;
let currentFrequency = null;

function normalizeFrequency(value) {
  const freq = String(value || 'daily').toLowerCase();
  return FREQUENCY_CRON[freq] ? freq : 'daily';
}

async function executeScheduledLivePaymentsPull() {
  try {
    if (getLastLivePaymentsStatus().running) {
      console.info('[live-payments-cron] skipped — previous pull still running');
      return;
    }

    const config = await getSystemConfig({ mask: false });
    const livePayments = getLivePaymentsConfig(config);

    if (!livePayments.enabled) {
      console.info('[live-payments-cron] skipped — master switch disabled');
      return;
    }

    const enabledClients = (livePayments.clients || []).filter(
      (c) => c?.enabled && c?.endpointUrl
    );
    if (enabledClients.length === 0) {
      console.warn('[live-payments-cron] skipped — no enabled client endpoints');
      return;
    }

    await runLivePaymentsPull({ triggeredBy: 'cron' });
  } catch (error) {
    if (error.status === 409) {
      console.info('[live-payments-cron] skipped — pull already in progress');
      return;
    }
    console.error('[live-payments-cron] run failed:', error.message);
  }
}

function stopLivePaymentsCron() {
  if (scheduledTask) {
    scheduledTask.stop();
    scheduledTask = null;
    currentFrequency = null;
  }
}

async function rescheduleLivePaymentsCron() {
  stopLivePaymentsCron();

  const config = await getSystemConfig({ mask: false });
  const livePayments = getLivePaymentsConfig(config);
  const frequency = normalizeFrequency(livePayments.frequency);
  const expression = FREQUENCY_CRON[frequency];

  if (!livePayments.enabled) {
    console.info('[live-payments-cron] not scheduled — disabled');
    return { enabled: false, frequency, expression: null, timezone: TIMEZONE };
  }

  if (!cron.validate(expression)) {
    console.error('[live-payments-cron] invalid expression:', expression);
    return { enabled: false, frequency, expression: null, timezone: TIMEZONE };
  }

  scheduledTask = cron.schedule(
    expression,
    () => {
      executeScheduledLivePaymentsPull();
    },
    { timezone: TIMEZONE }
  );

  currentFrequency = frequency;
  console.info(
    `[live-payments-cron] scheduled ${frequency} (${expression}) timezone=${TIMEZONE}`
  );

  return { enabled: true, frequency, expression, timezone: TIMEZONE };
}

async function startLivePaymentsCron() {
  try {
    return await rescheduleLivePaymentsCron();
  } catch (error) {
    console.error('[live-payments-cron] failed to start:', error.message);
    return { enabled: false, error: error.message };
  }
}

function getLivePaymentsCronInfo() {
  return {
    scheduled: Boolean(scheduledTask),
    frequency: currentFrequency,
    label: currentFrequency ? FREQUENCY_LABELS[currentFrequency] || currentFrequency : null,
    timezone: TIMEZONE,
  };
}

module.exports = {
  startLivePaymentsCron,
  rescheduleLivePaymentsCron,
  stopLivePaymentsCron,
  getLivePaymentsCronInfo,
  FREQUENCY_CRON,
  FREQUENCY_LABELS,
  normalizeFrequency,
};
