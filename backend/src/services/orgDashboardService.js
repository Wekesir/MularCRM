/**
 * Organisation-wide dashboard aggregates for Managers / Admins.
 * Agents use agentDashboardService instead.
 */
const pool = require('../db/pool');
const { isAgentRole, AGENT_ROLE_NAMES } = require('./agentService');

function monthLabels(count = 12) {
  const labels = [];
  const keys = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setDate(1);
    d.setHours(12, 0, 0, 0);
    d.setMonth(d.getMonth() - i);
    keys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
    labels.push(d.toLocaleDateString(undefined, { month: 'short' }));
  }
  return { labels, keys };
}

async function getHeadcount() {
  const [[debtors]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM debtors
     WHERE deleted_at IS NULL
       AND (is_closed = 0 OR is_closed IS NULL)`
  );

  const [[clients]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM clients WHERE deleted_at IS NULL`
  );

  const [[agents]] = await pool.query(
    `SELECT COUNT(*) AS cnt
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
       AND u.is_active = 1
       AND r.name IN (?)`,
    [AGENT_ROLE_NAMES]
  );

  return {
    activeDebtors: Number(debtors?.cnt) || 0,
    totalClients: Number(clients?.cnt) || 0,
    activeAgents: Number(agents?.cnt) || 0,
  };
}

async function getPortfolioTotals() {
  const [[row]] = await pool.query(
    `SELECT
       COUNT(*) AS debtor_count,
       COUNT(DISTINCT file_id) AS file_count,
       COALESCE(SUM(loan_amount), 0) AS loan_total,
       COALESCE(SUM(total_paid), 0) AS collected,
       COALESCE(SUM(outstanding_balance), 0) AS outstanding,
       COALESCE(SUM(CASE WHEN cs.code = 'PTP' THEN 1 ELSE 0 END), 0) AS ptp_count,
       COALESCE(SUM(CASE WHEN cs.code = 'PTP' THEN d.installment_amount ELSE 0 END), 0) AS ptp_amount,
       COALESCE(SUM(CASE
         WHEN cs.code = 'PTP' OR d.is_closed = 1 OR COALESCE(d.total_paid, 0) > 0
         THEN 1 ELSE 0 END), 0) AS actioned_cases,
       COALESCE(SUM(CASE
         WHEN NOT (cs.code = 'PTP' OR d.is_closed = 1 OR COALESCE(d.total_paid, 0) > 0)
          AND d.assigned_agent IS NOT NULL AND d.assigned_agent <> ''
         THEN 1 ELSE 0 END), 0) AS assigned_open_cases,
       COALESCE(SUM(CASE
         WHEN NOT (cs.code = 'PTP' OR d.is_closed = 1 OR COALESCE(d.total_paid, 0) > 0)
          AND (d.assigned_agent IS NULL OR d.assigned_agent = '')
         THEN 1 ELSE 0 END), 0) AS unassigned_cases
     FROM debtors d
     LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
     WHERE d.deleted_at IS NULL`
  );

  const [[pay]] = await pool.query(
    `SELECT
       COALESCE(SUM(CASE WHEN confirmed = 0 THEN amount ELSE 0 END), 0) AS unconfirmed_amount,
       COALESCE(SUM(CASE WHEN confirmed = 0 THEN 1 ELSE 0 END), 0) AS unconfirmed_count
     FROM payments`
  );

  const [[calls]] = await pool.query(
    `SELECT COUNT(*) AS cnt FROM activity_log WHERE action_type LIKE 'call%'`
  );

  const loanTotal = Number(row?.loan_total) || 0;
  const collected = Number(row?.collected) || 0;
  const successRate = loanTotal > 0 ? Math.round((collected / loanTotal) * 10000) / 100 : 0;

  return {
    debtorCount: Number(row?.debtor_count) || 0,
    fileCount: Number(row?.file_count) || 0,
    loanTotal,
    collected,
    outstanding: Number(row?.outstanding) || 0,
    ptpCount: Number(row?.ptp_count) || 0,
    ptpAmount: Number(row?.ptp_amount) || 0,
    unconfirmedAmount: Number(pay?.unconfirmed_amount) || 0,
    unconfirmedCount: Number(pay?.unconfirmed_count) || 0,
    successRate,
    callCount: Number(calls?.cnt) || 0,
    caseStatus: {
      labels: ['Unassigned', 'Assigned', 'Actioned'],
      values: [
        Number(row?.unassigned_cases) || 0,
        Number(row?.assigned_open_cases) || 0,
        Number(row?.actioned_cases) || 0,
      ],
    },
  };
}

async function getCollectionTrend() {
  const { labels, keys } = monthLabels(12);
  const [rows] = await pool.query(
    `SELECT DATE_FORMAT(payment_date, '%Y-%m') AS bucket,
            COALESCE(SUM(amount), 0) AS total
     FROM payments
     WHERE confirmed = 1
       AND amount > 0
       AND payment_date >= DATE_SUB(DATE_FORMAT(CURDATE(), '%Y-%m-01'), INTERVAL 11 MONTH)
     GROUP BY bucket
     ORDER BY bucket ASC`
  );
  const map = new Map(rows.map((r) => [r.bucket, Number(r.total) || 0]));
  return {
    labels,
    values: keys.map((k) => map.get(k) || 0),
  };
}

async function getCommissionsTrend() {
  const year = String(new Date().getFullYear());
  const { labels, keys } = monthLabels(12);
  const [rows] = await pool.query(
    `SELECT COALESCE(period_month, DATE_FORMAT(created_at, '%Y-%m')) AS bucket,
            COALESCE(SUM(commission_amount), 0) AS total
     FROM commission_earnings
     WHERE COALESCE(period_month, DATE_FORMAT(created_at, '%Y-%m')) >= DATE_FORMAT(
             DATE_SUB(CURDATE(), INTERVAL 11 MONTH), '%Y-%m'
           )
     GROUP BY bucket
     ORDER BY bucket ASC`
  );
  const map = new Map(rows.map((r) => [r.bucket, Number(r.total) || 0]));
  return {
    year,
    labels,
    values: keys.map((k) => map.get(k) || 0),
  };
}

async function getAgentPerformance(limit = 10) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name,
            (SELECT COUNT(DISTINCT d.file_id) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS total_files,
            (SELECT COALESCE(SUM(d.total_paid), 0) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS collected,
            (SELECT COALESCE(SUM(d.installment_amount), 0) FROM debtors d
              LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL AND cs.code = 'PTP') AS total_ptp,
            (SELECT COUNT(*) FROM debtors d
              LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL AND cs.code = 'PTP') AS ptp_count,
            (SELECT COUNT(*) FROM activity_log al
              WHERE al.user_id = u.id AND al.action_type LIKE 'call%') AS total_calls,
            (SELECT COUNT(*) FROM sms_audit sa
              WHERE sa.user_id = u.id AND sa.status = 'sent') AS total_sms
     FROM users u
     JOIN roles r ON r.id = u.role_id
     WHERE u.deleted_at IS NULL
       AND r.name IN (?)
     ORDER BY collected DESC, total_files DESC, u.name ASC
     LIMIT ?`,
    [AGENT_ROLE_NAMES, limit]
  );

  return rows.map((row, index) => {
    const collected = Number(row.collected) || 0;
    const ptpCount = Number(row.ptp_count) || 0;
    const totalFiles = Number(row.total_files) || 0;
    const ptpRate =
      totalFiles > 0 ? Math.round((ptpCount / totalFiles) * 1000) / 10 : 0;
    return {
      id: row.id,
      rank: index + 1,
      agent: row.name,
      totalFiles,
      collected,
      totalPtp: Number(row.total_ptp) || 0,
      ptpCount,
      totalCalls: Number(row.total_calls) || 0,
      totalSms: Number(row.total_sms) || 0,
      ptpRate,
    };
  });
}

async function getRecentActivity(limit = 12) {
  const [rows] = await pool.query(
    `SELECT id, user_id, user_name, action_type, title, subject, amount, created_at
     FROM activity_log
     ORDER BY created_at DESC
     LIMIT ?`,
    [limit]
  );

  return rows.map((row) => {
    const type =
      /ptp/i.test(row.action_type || '') || /ptp/i.test(row.title || '')
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
      actor: row.user_name || 'System',
      createdAt: row.created_at,
    };
  });
}

/**
 * @param {{ id: number, roleName?: string, isSystemAdmin?: boolean }} user
 */
async function getOrgDashboard(user) {
  if (isAgentRole(user) && !user?.isSystemAdmin) {
    const err = new Error('Agents should use the personal agent dashboard');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  const [headcount, portfolio, collectionTrend, commissions, agentPerformance, recentActivity] =
    await Promise.all([
      getHeadcount(),
      getPortfolioTotals(),
      getCollectionTrend(),
      getCommissionsTrend(),
      getAgentPerformance(10),
      getRecentActivity(12),
    ]);

  return {
    headcount,
    summary: {
      loanTotal: portfolio.loanTotal,
      collected: portfolio.collected,
      outstanding: portfolio.outstanding,
      ptpAmount: portfolio.ptpAmount,
      ptpCount: portfolio.ptpCount,
      unconfirmedAmount: portfolio.unconfirmedAmount,
      unconfirmedCount: portfolio.unconfirmedCount,
      successRate: portfolio.successRate,
      fileCount: portfolio.fileCount,
      debtorCount: portfolio.debtorCount,
      callCount: portfolio.callCount,
    },
    charts: {
      caseStatus: portfolio.caseStatus,
      collectionTrend,
      commissions,
    },
    agentPerformance,
    recentActivity,
  };
}

module.exports = {
  getOrgDashboard,
};
