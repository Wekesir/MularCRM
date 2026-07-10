const pool = require('../db/pool');
const { isValidWorkload } = require('./agentAttributes');

function normalizeAgent(row) {
  return {
    id: row.id,
    name: row.name,
    email: row.email,
    phone: row.phone || null,
    roleName: row.role_name,
    isActive: Boolean(row.is_active),
    experience: row.experience || null,
    expertise: row.expertise || null,
    workload: row.workload || null,
    updatedAt: row.profile_updated_at || row.updated_at,
    // Performance metrics (nullable when no data yet)
    lastLogin: row.last_login || null,
    filesAssigned: Number(row.files_assigned) || 0,
    collections: Number(row.collections) || 0,
    ptpCount: Number(row.ptp_count) || 0,
    ptpAmount: Number(row.ptp_amount) || 0,
    callsMade: Number(row.calls_made) || 0,
    smsSent: Number(row.sms_sent) || 0,
    emailsSent: Number(row.emails_sent) || 0,
    whatsapp: Number(row.whatsapp_count) || 0,
  };
}

const AGENT_ROLE_NAMES = ['Agent'];

/** True when the user has the collection Agent role (not Manager/Admin/etc.). */
function isAgentRole(userOrRoleName) {
  const name =
    typeof userOrRoleName === 'string'
      ? userOrRoleName
      : userOrRoleName?.roleName;
  return AGENT_ROLE_NAMES.some(
    (r) => String(name || '').trim().toLowerCase() === r.toLowerCase()
  );
}

async function listAgents({ experience, expertise, workload, search } = {}) {
  const params = [];
  const where = ['r.name IN (?)', 'u.deleted_at IS NULL'];
  params.push(AGENT_ROLE_NAMES);

  if (experience) {
    where.push('ap.experience = ?');
    params.push(experience);
  }
  if (expertise) {
    where.push('ap.expertise = ?');
    params.push(expertise);
  }
  if (workload) {
    where.push('ap.workload = ?');
    params.push(workload);
  }
  if (search) {
    where.push('(u.name LIKE ? OR u.email LIKE ?)');
    const q = `%${String(search).trim()}%`;
    params.push(q, q);
  }

  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.updated_at,
            r.name AS role_name,
            ap.experience, ap.expertise, ap.workload, ap.updated_at AS profile_updated_at,
            (SELECT MAX(la.login_at) FROM login_audit la
              WHERE la.user_id = u.id AND la.status = 'success') AS last_login,
            (SELECT COUNT(DISTINCT d.file_id) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS files_assigned,
            (SELECT COALESCE(SUM(d.total_paid), 0) FROM debtors d
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL) AS collections,
            (SELECT COUNT(*) FROM debtors d
              LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL AND cs.code = 'PTP') AS ptp_count,
            (SELECT COALESCE(SUM(d.installment_amount), 0) FROM debtors d
              LEFT JOIN contact_statuses cs ON cs.id = d.contact_status_id
              WHERE d.assigned_agent = u.name AND d.deleted_at IS NULL AND cs.code = 'PTP') AS ptp_amount,
            (SELECT COUNT(*) FROM activity_log al
              WHERE al.user_id = u.id AND al.action_type LIKE 'call%') AS calls_made,
            (SELECT COUNT(*) FROM sms_audit sa
              WHERE sa.user_id = u.id AND sa.status = 'sent') AS sms_sent,
            (SELECT COUNT(*) FROM email_audit ea
              WHERE ea.user_id = u.id AND ea.status = 'sent') AS emails_sent,
            (SELECT COUNT(*) FROM activity_log al
              WHERE al.user_id = u.id AND al.action_type LIKE 'whatsapp%') AS whatsapp_count
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE ${where.join(' AND ')}
     ORDER BY u.name ASC`,
    params
  );

  return rows.map(normalizeAgent);
}

async function getAgentById(id) {
  const [rows] = await pool.query(
    `SELECT u.id, u.name, u.email, u.phone, u.is_active, u.updated_at,
            r.name AS role_name,
            ap.experience, ap.expertise, ap.workload, ap.updated_at AS profile_updated_at
     FROM users u
     JOIN roles r ON u.role_id = r.id
     LEFT JOIN agent_profiles ap ON ap.user_id = u.id
     WHERE u.id = ? AND r.name IN (?) AND u.deleted_at IS NULL
     LIMIT 1`,
    [id, AGENT_ROLE_NAMES]
  );
  return rows[0] ? normalizeAgent(rows[0]) : null;
}

async function upsertAgentProfile(userId, data) {
  const experience = data.experience ? String(data.experience).trim() : null;
  const expertise = data.expertise ? String(data.expertise).trim() : null;
  const workload = data.workload && isValidWorkload(data.workload) ? data.workload : null;

  const agent = await getAgentById(userId);
  if (!agent) {
    const err = new Error('Agent not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  await pool.query(
    `INSERT INTO agent_profiles (user_id, experience, expertise, workload)
     VALUES (?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
       experience = VALUES(experience),
       expertise = VALUES(expertise),
       workload = VALUES(workload)`,
    [userId, experience, expertise, workload]
  );

  return getAgentById(userId);
}

async function setAgentActiveStatus(userId, isActive) {
  const agent = await getAgentById(userId);
  if (!agent) {
    const err = new Error('Agent not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  await pool.query('UPDATE users SET is_active = ? WHERE id = ?', [isActive ? 1 : 0, userId]);
  return getAgentById(userId);
}

module.exports = {
  listAgents,
  getAgentById,
  upsertAgentProfile,
  setAgentActiveStatus,
  isAgentRole,
  AGENT_ROLE_NAMES,
};
