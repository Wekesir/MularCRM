/**
 * Personal Agent Dashboard aggregates.
 * Always scoped to the authenticated agent (user id + assigned_agent name).
 */
const pool = require('../db/pool');
const { getAgentById, isAgentRole } = require('./agentService');
const { getKpisByUserId } = require('./agentKpiService');

const PERIODS = new Set(['daily', 'weekly', 'monthly']);

function normalizePeriod(value) {
  const p = String(value || 'daily').toLowerCase();
  return PERIODS.has(p) ? p : 'daily';
}

function periodStartSql(period) {
  if (period === 'weekly') return 'DATE_SUB(CURDATE(), INTERVAL 6 DAY)';
  if (period === 'monthly') return 'DATE_SUB(CURDATE(), INTERVAL 29 DAY)';
  return 'CURDATE()';
}

function progressPct(actual, target) {
  const t = Number(target) || 0;
  if (t <= 0) return actual > 0 ? 100 : 0;
  return Math.min(100, Math.round((Number(actual) / t) * 1000) / 10);
}

function emptyTargets() {
  return {
    calls: { daily: 0, weekly: 0, monthly: 0 },
    collection: { daily: 0, weekly: 0, monthly: 0 },
    sms: { daily: 0, weekly: 0, monthly: 0 },
    emails: { daily: 0, weekly: 0, monthly: 0 },
    ptpVolume: { daily: 0, weekly: 0, monthly: 0 },
  };
}

async function getPortfolioSummary(agentName) {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS assigned_cases,
       COUNT(DISTINCT file_id) AS active_files,
       COALESCE(SUM(loan_amount), 0) AS loan_total,
       COALESCE(SUM(total_paid), 0) AS collected,
       COALESCE(SUM(outstanding_balance), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN cs.code = 'PTP' THEN 1 ELSE 0 END), 0) AS ptp_count,
       COALESCE(SUM(CASE WHEN cs.code = 'PTP' THEN d.installment_amount ELSE 0 END), 0) AS ptp_amount,
       COALESCE(SUM(CASE WHEN d.is_closed = 1 THEN 1 ELSE 0 END), 0) AS closed_cases,
       COALESCE(SUM(CASE
         WHEN (d.is_closed = 0 OR d.is_closed IS NULL)
          AND (d.total_paid IS NULL OR d.total_paid = 0)
          AND (cs.code IS NULL OR cs.code <> 'PTP')
         THEN 1 ELSE 0 END), 0) AS open_cases
     FROM debtors d
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     WHERE d.assigned_agent = ?
       AND d.deleted_at IS NULL
       AND (d.is_closed = 0 OR d.is_closed IS NULL OR d.is_closed = 1)`,
    [agentName]
  );

  const loanTotal = Number(row?.loan_total) || 0;
  const collected = Number(row?.collected) || 0;
  const recoveryRate = loanTotal > 0 ? Math.round((collected / loanTotal) * 1000) / 10 : 0;

  return {
    assignedCases: Number(row?.assigned_cases) || 0,
    activeFiles: Number(row?.active_files) || 0,
    loanTotal,
    collected,
    outstanding: Number(row?.outstanding) || 0,
    recoveryRate,
    ptpCount: Number(row?.ptp_count) || 0,
    ptpAmount: Number(row?.ptp_amount) || 0,
    closedCases: Number(row?.closed_cases) || 0,
    openCases: Number(row?.open_cases) || 0,
  };
}

async function getCommissionsAndPayments(agentName) {
  const [[comm]] = await pool.query(
    `SELECT COALESCE(SUM(e.commission_amount), 0) AS commissions_earned
     FROM commission_earnings e
     INNER JOIN debtors d ON d.id = e.debtor_id
     WHERE d.assigned_agent = ? AND d.deleted_at IS NULL`,
    [agentName]
  );

  const [[pay]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN p.confirmed = 0 THEN 1 ELSE 0 END), 0) AS unconfirmed_count,
       COALESCE(SUM(CASE WHEN p.confirmed = 0 THEN p.amount ELSE 0 END), 0) AS unconfirmed_amount
     FROM payments p
     WHERE p.agent_name = ?`,
    [agentName]
  );

  return {
    commissionsEarned: Number(comm?.commissions_earned) || 0,
    unconfirmedPayments: Number(pay?.unconfirmed_count) || 0,
    unconfirmedAmount: Number(pay?.unconfirmed_amount) || 0,
  };
}

async function getPeriodActivity(userId, period) {
  const start = periodStartSql(period);

  const [[calls]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM activity_log
     WHERE user_id = ? AND action_type LIKE 'call%'
       AND created_at >= ${start}`,
    [userId]
  );
  const [[sms]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM sms_audit
     WHERE user_id = ? AND status = 'sent'
       AND created_at >= ${start}`,
    [userId]
  );
  const [[emails]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM email_audit
     WHERE user_id = ? AND status = 'sent'
       AND created_at >= ${start}`,
    [userId]
  );
  const [[whatsapp]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM activity_log
     WHERE user_id = ? AND action_type LIKE 'whatsapp%'
       AND created_at >= ${start}`,
    [userId]
  );

  return {
    calls: Number(calls?.cnt) || 0,
    sms: Number(sms?.cnt) || 0,
    emails: Number(emails?.cnt) || 0,
    whatsapp: Number(whatsapp?.cnt) || 0,
  };
}

async function getPeriodCollection(agentName, period) {
  const start = periodStartSql(period);
  const [[row]] = await pool.query(
    `SELECT COALESCE(SUM(p.amount), 0) AS collected
     FROM payments p
     WHERE p.agent_name = ?
       AND p.confirmed = 1
       AND p.amount > 0
       AND p.payment_date >= ${start}`,
    [agentName]
  );
  return Number(row?.collected) || 0;
}

async function getPeriodPtpCount(agentName, period) {
  // Approximate: debtors currently on PTP that were last contacted in the period,
  // falling back to created_at when last_contacted_at is null.
  const start = periodStartSql(period);
  const [[row]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM debtors d
     INNER JOIN contact_statuses cs ON cs.id = d.contact_status_id AND cs.code = 'PTP'
     WHERE d.assigned_agent = ?
       AND d.deleted_at IS NULL
       AND COALESCE(d.last_contacted_at, d.created_at) >= ${start}`,
    [agentName]
  );
  return Number(row?.cnt) || 0;
}

async function getCollectionTrend(agentName, period) {
  let buckets;
  let sql;

  if (period === 'daily') {
    buckets = 7;
    sql = `
      SELECT DATE_FORMAT(p.payment_date, '%Y-%m-%d') AS bucket,
             COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      WHERE p.agent_name = ?
        AND p.confirmed = 1
        AND p.amount > 0
        AND p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
      GROUP BY bucket
      ORDER BY bucket ASC`;
  } else if (period === 'weekly') {
    buckets = 8;
    sql = `
      SELECT DATE_FORMAT(p.payment_date, '%x-W%v') AS bucket,
             MIN(p.payment_date) AS sort_key,
             COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      WHERE p.agent_name = ?
        AND p.confirmed = 1
        AND p.amount > 0
        AND p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ? WEEK)
      GROUP BY bucket
      ORDER BY sort_key ASC`;
  } else {
    buckets = 12;
    sql = `
      SELECT DATE_FORMAT(p.payment_date, '%Y-%m') AS bucket,
             COALESCE(SUM(p.amount), 0) AS total
      FROM payments p
      WHERE p.agent_name = ?
        AND p.confirmed = 1
        AND p.amount > 0
        AND p.payment_date >= DATE_SUB(CURDATE(), INTERVAL ? MONTH)
      GROUP BY bucket
      ORDER BY bucket ASC`;
  }

  const intervalArg = period === 'daily' ? buckets - 1 : buckets - 1;
  const [rows] = await pool.query(sql, [agentName, intervalArg]);

  const map = new Map(rows.map((r) => [r.bucket, Number(r.total) || 0]));
  const labels = [];
  const values = [];

  if (period === 'daily') {
    for (let i = buckets - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setHours(12, 0, 0, 0);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      labels.push(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
      values.push(map.get(key) || 0);
    }
  } else if (period === 'weekly') {
    // Use whatever weeks came back; pad if sparse
    for (const r of rows) {
      labels.push(String(r.bucket).replace(/^\d+-W/, 'W'));
      values.push(Number(r.total) || 0);
    }
    if (labels.length === 0) {
      for (let i = buckets - 1; i >= 0; i -= 1) {
        labels.push(`W${i === 0 ? 'now' : `-${i}`}`);
        values.push(0);
      }
    }
  } else {
    for (let i = buckets - 1; i >= 0; i -= 1) {
      const d = new Date();
      d.setDate(1);
      d.setMonth(d.getMonth() - i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
      labels.push(d.toLocaleDateString(undefined, { month: 'short', year: '2-digit' }));
      values.push(map.get(key) || 0);
    }
  }

  return { labels, values };
}

async function getContactTrend(userId, period) {
  const days = period === 'monthly' ? 29 : period === 'weekly' ? 6 : 6;
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(created_at, '%Y-%m-%d') AS bucket, COUNT(*) AS total
     FROM (
       SELECT created_at FROM activity_log
         WHERE user_id = ? AND (action_type LIKE 'call%' OR action_type LIKE 'whatsapp%')
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       UNION ALL
       SELECT created_at FROM sms_audit
         WHERE user_id = ? AND status = 'sent'
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
       UNION ALL
       SELECT created_at FROM email_audit
         WHERE user_id = ? AND status = 'sent'
           AND created_at >= DATE_SUB(CURDATE(), INTERVAL ? DAY)
     ) contacts
     GROUP BY bucket
     ORDER BY bucket ASC`,
    [userId, days, userId, days, userId, days]
  );

  const map = new Map(rows.map((r) => [r.bucket, Number(r.total) || 0]));
  const labels = [];
  const values = [];
  for (let i = days; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    labels.push(d.toLocaleDateString(undefined, { weekday: 'short', day: 'numeric' }));
    values.push(map.get(key) || 0);
  }
  return { labels, values };
}

async function getRecentActivity(userId, limit = 10) {
  const [rows] = await pool.query(
    `SELECT id, user_id, user_name, action_type, title, subject, amount, created_at
     FROM activity_log
     WHERE user_id = ?
     ORDER BY created_at DESC
     LIMIT ?`,
    [userId, limit]
  );

  return rows.map((row) => {
    const type = /ptp/i.test(row.action_type || '') || /ptp/i.test(row.title || '')
      ? 'ptp'
      : /call/i.test(row.action_type || '')
        ? 'call'
        : /sms|email|whatsapp/i.test(row.action_type || '')
          ? 'contact'
          : 'note';
    return {
      id: row.id,
      type,
      title: row.title,
      subject: row.subject || '',
      amount: row.amount != null ? Number(row.amount) : null,
      actor: row.user_name || 'You',
      createdAt: row.created_at,
    };
  });
}

/**
 * @param {{ id: number, name: string, roleName?: string }} user
 * @param {{ period?: string }} options
 */
async function getAgentDashboard(user, { period: rawPeriod } = {}) {
  if (!user?.id || !isAgentRole(user)) {
    const err = new Error('Only agents can access the agent dashboard');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const agent = await getAgentById(user.id);
  if (!agent) {
    const err = new Error('Agent profile not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }

  const period = normalizePeriod(rawPeriod);
  const agentName = agent.name;

  const [portfolio, money, activity, periodCollected, periodPtp, kpiRow, collectionTrend, contactTrend, recentActivity] =
    await Promise.all([
      getPortfolioSummary(agentName),
      getCommissionsAndPayments(agentName),
      getPeriodActivity(user.id, period),
      getPeriodCollection(agentName, period),
      getPeriodPtpCount(agentName, period),
      getKpisByUserId(user.id),
      getCollectionTrend(agentName, period),
      getContactTrend(user.id, period),
      getRecentActivity(user.id, 10),
    ]);

  const targets = kpiRow || emptyTargets();
  const targetFor = (key) => Number(targets[key]?.[period]) || 0;

  const kpiActuals = {
    calls: activity.calls,
    collection: periodCollected,
    sms: activity.sms,
    emails: activity.emails,
    ptpVolume: periodPtp,
  };

  const kpi = {
    period,
    items: [
      {
        key: 'calls',
        label: 'Calls',
        kind: 'count',
        target: targetFor('calls'),
        actual: kpiActuals.calls,
        progress: progressPct(kpiActuals.calls, targetFor('calls')),
      },
      {
        key: 'collection',
        label: 'Collection',
        kind: 'money',
        target: targetFor('collection'),
        actual: kpiActuals.collection,
        progress: progressPct(kpiActuals.collection, targetFor('collection')),
      },
      {
        key: 'sms',
        label: 'SMS',
        kind: 'count',
        target: targetFor('sms'),
        actual: kpiActuals.sms,
        progress: progressPct(kpiActuals.sms, targetFor('sms')),
      },
      {
        key: 'emails',
        label: 'Emails',
        kind: 'count',
        target: targetFor('emails'),
        actual: kpiActuals.emails,
        progress: progressPct(kpiActuals.emails, targetFor('emails')),
      },
      {
        key: 'ptpVolume',
        label: 'PTP',
        kind: 'count',
        target: targetFor('ptpVolume'),
        actual: kpiActuals.ptpVolume,
        progress: progressPct(kpiActuals.ptpVolume, targetFor('ptpVolume')),
      },
    ],
  };

  const ptpCases = portfolio.ptpCount;
  const closedOrPaid = portfolio.closedCases;
  const openActive = Math.max(0, portfolio.assignedCases - ptpCases - closedOrPaid);

  return {
    period,
    agent: {
      id: agent.id,
      name: agent.name,
      experience: agent.experience,
      expertise: agent.expertise,
      workload: agent.workload,
    },
    summary: {
      assignedCases: portfolio.assignedCases,
      activeFiles: portfolio.activeFiles,
      loanTotal: portfolio.loanTotal,
      collected: portfolio.collected,
      outstanding: portfolio.outstanding,
      recoveryRate: portfolio.recoveryRate,
      ptpCount: portfolio.ptpCount,
      ptpAmount: portfolio.ptpAmount,
      commissionsEarned: money.commissionsEarned,
      unconfirmedPayments: money.unconfirmedPayments,
      unconfirmedAmount: money.unconfirmedAmount,
      periodCollected,
    },
    activity,
    kpi,
    charts: {
      caseStatus: {
        labels: ['Open', 'PTP', 'Closed'],
        values: [openActive, ptpCases, closedOrPaid],
      },
      collectionTrend,
      contactMix: {
        labels: ['Calls', 'SMS', 'Email', 'WhatsApp'],
        values: [activity.calls, activity.sms, activity.emails, activity.whatsapp],
      },
      contactTrend,
    },
    recentActivity,
  };
}

module.exports = {
  getAgentDashboard,
  normalizePeriod,
};
