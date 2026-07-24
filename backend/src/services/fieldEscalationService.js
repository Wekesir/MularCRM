const pool = require('../db/pool');
const {
  isSupervisorRole,
  isSeniorSupervisorRole,
  resolveCallCenterScope,
  sqlCentersInRegion,
} = require('../config/orgRoles');
const { getSystemConfig } = require('./systemConfigService');
const { createNotification } = require('./notificationService');
const { listAgents } = require('./agentService');

const OPEN_STATUSES = new Set(['requested', 'pending_senior', 'approved', 'assigned']);
const STATUSES = new Set([
  'requested',
  'pending_senior',
  'approved',
  'rejected',
  'assigned',
  'cancelled',
]);
const FIELD_AGENT_EXPERTISE = 'Field Agent';
const MIN_NOTE_LENGTH = 5;

function httpError(message, status = 400, code = 'BAD_REQUEST') {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function canSubmitEscalation(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  return isSupervisorRole(user) || isSeniorSupervisorRole(user);
}

function canSeniorReview(user) {
  if (!user) return false;
  if (user.isSystemAdmin) return true;
  return isSeniorSupervisorRole(user);
}

function canAssignFieldAgent(user) {
  return canSubmitEscalation(user);
}

async function getEscalationConfig() {
  const config = await getSystemConfig({ mask: false });
  const fe = config.fieldEscalation || {};
  const codes = Array.isArray(fe.refusalStatusCodes) && fe.refusalStatusCodes.length
    ? fe.refusalStatusCodes.map((c) => String(c).toUpperCase())
    : ['RTP', 'N-C', 'HU'];
  return {
    enabled: fe.enabled !== false,
    refusalStatusCodes: codes,
    minRefusalContacts: Math.max(1, Number(fe.minRefusalContacts) || 3),
    lookbackDays: Math.max(1, Number(fe.lookbackDays) || 30),
    waitPeriodDays: Math.max(0, Number(fe.waitPeriodDays) || 14),
    requirePaymentGap: fe.requirePaymentGap !== false,
  };
}

function applyDebtorCenterScope(clauses, params, viewer, callCenterIdFilter) {
  if (!viewer || viewer.isSystemAdmin) {
    if (callCenterIdFilter) {
      clauses.push('COALESCE(df.call_center_id, c.call_center_id) = ?');
      params.push(Number(callCenterIdFilter));
    }
    return;
  }

  const scope = resolveCallCenterScope(viewer, { callCenterId: callCenterIdFilter });
  if (scope.mode === 'center') {
    if (!scope.callCenterId) {
      clauses.push('1=0');
    } else {
      clauses.push('COALESCE(df.call_center_id, c.call_center_id) = ?');
      params.push(scope.callCenterId);
    }
  } else if (scope.mode === 'region') {
    if (!scope.regionId) {
      clauses.push('1=0');
    } else if (scope.callCenterId) {
      clauses.push('COALESCE(df.call_center_id, c.call_center_id) = ?');
      params.push(scope.callCenterId);
      clauses.push(`COALESCE(df.call_center_id, c.call_center_id) IN (${sqlCentersInRegion()})`);
      params.push(scope.regionId);
    } else {
      clauses.push(`COALESCE(df.call_center_id, c.call_center_id) IN (${sqlCentersInRegion()})`);
      params.push(scope.regionId);
    }
  } else if (scope.mode === 'company' && scope.callCenterId) {
    clauses.push('COALESCE(df.call_center_id, c.call_center_id) = ?');
    params.push(scope.callCenterId);
  } else if (scope.mode === 'none') {
    clauses.push('1=0');
  }
}

function normalizeEscalation(row) {
  return {
    id: row.id,
    debtorId: row.debtor_id,
    debtorName: row.debtor_name || null,
    debtorPhone: row.debtor_phone || null,
    outstandingBalance:
      row.outstanding_balance != null ? Number(row.outstanding_balance) : null,
    fileId: row.file_id || null,
    fileName: row.file_name || null,
    clientId: row.client_id || null,
    clientName: row.client_name || null,
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
    callCenterName: row.call_center_name || null,
    fromAgentUserId: row.from_agent_user_id || null,
    fromAgentName: row.from_agent_name || null,
    toFieldAgentUserId: row.to_field_agent_user_id || null,
    toFieldAgentName: row.to_field_agent_name || null,
    status: row.status,
    refusalCount: Number(row.refusal_count) || 0,
    waitStartedAt: row.wait_started_at || null,
    eligibleAt: row.eligible_at || null,
    requestedBy: row.requested_by || null,
    requesterName: row.requester_name || null,
    requestedAt: row.requested_at || null,
    supervisorNote: row.supervisor_note || null,
    seniorReviewedBy: row.senior_reviewed_by || null,
    seniorReviewerName: row.senior_reviewer_name || null,
    seniorReviewedAt: row.senior_reviewed_at || null,
    seniorNote: row.senior_note || null,
    rejectionReason: row.rejection_reason || null,
    assignedBy: row.assigned_by || null,
    assignerName: row.assigner_name || null,
    assignedAt: row.assigned_at || null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    currencySymbol: row.currency_symbol || null,
  };
}

const SELECT_SQL = `
  SELECT fe.*,
         d.name AS debtor_name,
         d.phone AS debtor_phone,
         d.outstanding_balance,
         d.client_id,
         c.name AS client_name,
         df.file_name,
         cc.name AS call_center_name,
         fa.name AS from_agent_name,
         ta.name AS to_field_agent_name,
         req.name AS requester_name,
         sen.name AS senior_reviewer_name,
         asn.name AS assigner_name,
         cur.symbol AS currency_symbol
`;

const FROM_SQL = `
  FROM field_escalations fe
  INNER JOIN debtors d ON d.id = fe.debtor_id
  LEFT JOIN clients c ON c.id = d.client_id
  LEFT JOIN debtor_files df ON df.id = fe.file_id AND df.deleted_at IS NULL
  LEFT JOIN call_centers cc ON cc.id = fe.call_center_id AND cc.deleted_at IS NULL
  LEFT JOIN users fa ON fa.id = fe.from_agent_user_id
  LEFT JOIN users ta ON ta.id = fe.to_field_agent_user_id
  LEFT JOIN users req ON req.id = fe.requested_by
  LEFT JOIN users sen ON sen.id = fe.senior_reviewed_by
  LEFT JOIN users asn ON asn.id = fe.assigned_by
  LEFT JOIN currencies cur ON cur.id = d.currency_id
`;

function buildListFilters(filters = {}, viewer = null) {
  const clauses = ['1=1'];
  const params = [];
  const centerExpr = 'COALESCE(fe.call_center_id, df.call_center_id, c.call_center_id)';

  if (viewer && !viewer.isSystemAdmin) {
    const scope = resolveCallCenterScope(viewer, { callCenterId: filters.callCenterId });
    if (scope.mode === 'center') {
      if (!scope.callCenterId) clauses.push('1=0');
      else {
        clauses.push(`${centerExpr} = ?`);
        params.push(scope.callCenterId);
      }
    } else if (scope.mode === 'region') {
      if (!scope.regionId) clauses.push('1=0');
      else if (scope.callCenterId) {
        clauses.push(`${centerExpr} = ?`);
        params.push(scope.callCenterId);
        clauses.push(`${centerExpr} IN (${sqlCentersInRegion()})`);
        params.push(scope.regionId);
      } else {
        clauses.push(`${centerExpr} IN (${sqlCentersInRegion()})`);
        params.push(scope.regionId);
      }
    } else if (scope.mode === 'company' && scope.callCenterId) {
      clauses.push(`${centerExpr} = ?`);
      params.push(scope.callCenterId);
    } else if (scope.mode === 'none') {
      clauses.push('1=0');
    }
  } else if (filters.callCenterId) {
    clauses.push(`${centerExpr} = ?`);
    params.push(Number(filters.callCenterId));
  }

  if (filters.status && STATUSES.has(String(filters.status))) {
    clauses.push('fe.status = ?');
    params.push(String(filters.status));
  } else if (filters.statusIn) {
    const list = String(filters.statusIn)
      .split(',')
      .map((s) => s.trim())
      .filter((s) => STATUSES.has(s));
    if (list.length) {
      clauses.push('fe.status IN (?)');
      params.push(list);
    }
  }

  if (filters.debtorId) {
    clauses.push('fe.debtor_id = ?');
    params.push(Number(filters.debtorId));
  }

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR d.phone LIKE ? OR c.name LIKE ? OR fa.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like, like);
  }

  return { where: `WHERE ${clauses.join(' AND ')}`, params };
}

async function getEscalationById(id) {
  const [rows] = await pool.query(
    `${SELECT_SQL} ${FROM_SQL} WHERE fe.id = ? LIMIT 1`,
    [Number(id)]
  );
  return rows[0] ? normalizeEscalation(rows[0]) : null;
}

async function getEscalationDetail(id, viewer) {
  const item = await getEscalationById(id);
  if (!item) throw httpError('Escalation not found', 404, 'NOT_FOUND');
  assertCanViewEscalation(item, viewer);
  return item;
}

function assertCanViewEscalation(item, viewer) {
  if (!viewer || viewer.isSystemAdmin) return;
  if (!canSubmitEscalation(viewer) && !canSeniorReview(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }
  const scope = resolveCallCenterScope(viewer, {});
  if (scope.mode === 'center' && scope.callCenterId) {
    if (item.callCenterId && Number(item.callCenterId) !== Number(scope.callCenterId)) {
      throw httpError('Escalation is outside your call center', 403, 'FORBIDDEN');
    }
  }
}

async function loadDebtorForEscalation(debtorId) {
  const [rows] = await pool.query(
    `SELECT d.id, d.name, d.phone, d.file_id, d.client_id, d.outstanding_balance,
            d.assigned_agent, d.assigned_agent_user_id,
            COALESCE(df.call_center_id, c.call_center_id) AS call_center_id,
            c.name AS client_name,
            df.file_name
     FROM debtors d
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN debtor_files df ON df.id = d.file_id AND df.deleted_at IS NULL
     WHERE d.id = ? AND d.deleted_at IS NULL AND d.is_closed = 0
     LIMIT 1`,
    [Number(debtorId)]
  );
  return rows[0] || null;
}

/**
 * Eligible debtors: N noted refusal contacts in lookback, wait period elapsed,
 * no open escalation, optional payment gap.
 */
async function listEligibleDebtors(viewer, filters = {}) {
  if (!canSubmitEscalation(viewer) && !canSeniorReview(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }

  const cfg = await getEscalationConfig();
  if (!cfg.enabled) {
    return { items: [], total: 0, config: cfg };
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;

  const clauses = [
    'd.deleted_at IS NULL',
    'd.is_closed = 0',
    'CHAR_LENGTH(TRIM(ca.notes)) >= ?',
    'UPPER(cs.code) IN (?)',
    'ca.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)',
  ];
  const params = [MIN_NOTE_LENGTH, cfg.refusalStatusCodes, cfg.lookbackDays];
  applyDebtorCenterScope(clauses, params, viewer, filters.callCenterId);

  const search = String(filters.search || '').trim();
  if (search) {
    clauses.push('(d.name LIKE ? OR d.phone LIKE ? OR c.name LIKE ?)');
    const like = `%${search}%`;
    params.push(like, like, like);
  }

  // Exclude debtors with open escalations
  clauses.push(`NOT EXISTS (
    SELECT 1 FROM field_escalations fe
    WHERE fe.debtor_id = d.id AND fe.status IN ('requested','pending_senior','approved','assigned')
  )`);

  const where = clauses.join(' AND ');

  const [aggRows] = await pool.query(
    `SELECT d.id AS debtor_id,
            d.name AS debtor_name,
            d.phone AS debtor_phone,
            d.outstanding_balance,
            d.file_id,
            d.client_id,
            d.assigned_agent_user_id,
            d.assigned_agent,
            c.name AS client_name,
            df.file_name,
            COALESCE(df.call_center_id, c.call_center_id) AS call_center_id,
            cc.name AS call_center_name,
            cur.symbol AS currency_symbol,
            COUNT(ca.id) AS refusal_count,
            MIN(ca.created_at) AS first_refusal_at,
            (
              SELECT ca2.created_at
              FROM contact_attempts ca2
              INNER JOIN contact_statuses cs2 ON cs2.id = ca2.contact_status_id
              WHERE ca2.debtor_id = d.id
                AND CHAR_LENGTH(TRIM(ca2.notes)) >= ?
                AND UPPER(cs2.code) IN (?)
                AND ca2.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
              ORDER BY ca2.created_at ASC
              LIMIT 1 OFFSET ?
            ) AS nth_refusal_at
     FROM debtors d
     INNER JOIN contact_attempts ca ON ca.debtor_id = d.id
     INNER JOIN contact_statuses cs ON cs.id = ca.contact_status_id
     LEFT JOIN clients c ON c.id = d.client_id
     LEFT JOIN debtor_files df ON df.id = d.file_id AND df.deleted_at IS NULL
     LEFT JOIN call_centers cc ON cc.id = COALESCE(df.call_center_id, c.call_center_id) AND cc.deleted_at IS NULL
     LEFT JOIN currencies cur ON cur.id = d.currency_id
     WHERE ${where}
     GROUP BY d.id
     HAVING COUNT(ca.id) >= ?
     ORDER BY nth_refusal_at ASC
     LIMIT ? OFFSET ?`,
    [
      MIN_NOTE_LENGTH,
      cfg.refusalStatusCodes,
      cfg.lookbackDays,
      cfg.minRefusalContacts - 1,
      ...params,
      cfg.minRefusalContacts,
      pageSize,
      offset,
    ]
  );

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total FROM (
       SELECT d.id
       FROM debtors d
       INNER JOIN contact_attempts ca ON ca.debtor_id = d.id
       INNER JOIN contact_statuses cs ON cs.id = ca.contact_status_id
       LEFT JOIN clients c ON c.id = d.client_id
       LEFT JOIN debtor_files df ON df.id = d.file_id AND df.deleted_at IS NULL
       WHERE ${where}
       GROUP BY d.id
       HAVING COUNT(ca.id) >= ?
     ) t`,
    [...params, cfg.minRefusalContacts]
  );

  const now = Date.now();
  const items = [];
  for (const row of aggRows) {
    const waitStartedAt = row.nth_refusal_at || row.first_refusal_at;
    if (!waitStartedAt) continue;
    const eligibleAt = new Date(waitStartedAt);
    eligibleAt.setUTCDate(eligibleAt.getUTCDate() + cfg.waitPeriodDays);
    if (eligibleAt.getTime() > now) continue;

    if (cfg.requirePaymentGap) {
      const [[pay]] = await pool.query(
        `SELECT COUNT(*) AS cnt FROM payments
         WHERE debtor_id = ? AND confirmed = 1 AND created_at >= ?`,
        [row.debtor_id, waitStartedAt]
      );
      if (Number(pay?.cnt) > 0) continue;
    }

    items.push({
      debtorId: row.debtor_id,
      debtorName: row.debtor_name,
      debtorPhone: row.debtor_phone,
      outstandingBalance:
        row.outstanding_balance != null ? Number(row.outstanding_balance) : null,
      fileId: row.file_id || null,
      fileName: row.file_name || null,
      clientId: row.client_id || null,
      clientName: row.client_name || null,
      callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
      callCenterName: row.call_center_name || null,
      fromAgentUserId: row.assigned_agent_user_id || null,
      fromAgentName: row.assigned_agent || null,
      refusalCount: Number(row.refusal_count) || 0,
      waitStartedAt,
      eligibleAt: eligibleAt.toISOString(),
      currencySymbol: row.currency_symbol || null,
    });
  }

  return {
    items,
    total: Number(countRow?.total) || items.length,
    page,
    pageSize,
    config: cfg,
  };
}

async function countEligibleDebtors(viewer) {
  try {
    const result = await listEligibleDebtors(viewer, { page: 1, pageSize: 1 });
    return Number(result.total) || 0;
  } catch {
    return 0;
  }
}

async function listEscalations(filters = {}, viewer = null) {
  if (!canSubmitEscalation(viewer) && !canSeniorReview(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const pageSize = Math.min(100, Math.max(1, Number(filters.pageSize) || 25));
  const offset = (page - 1) * pageSize;
  const { where, params } = buildListFilters(filters, viewer);

  const [[countRow]] = await pool.query(
    `SELECT COUNT(*) AS total ${FROM_SQL} ${where}`,
    params
  );
  const [rows] = await pool.query(
    `${SELECT_SQL} ${FROM_SQL} ${where}
     ORDER BY fe.created_at DESC
     LIMIT ? OFFSET ?`,
    [...params, pageSize, offset]
  );

  return {
    items: rows.map(normalizeEscalation),
    total: Number(countRow?.total) || 0,
    page,
    pageSize,
  };
}

async function getEscalationTotals(filters = {}, viewer = null) {
  if (!canSubmitEscalation(viewer) && !canSeniorReview(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }
  const { where, params } = buildListFilters({ ...filters, status: undefined }, viewer);
  const [rows] = await pool.query(
    `SELECT fe.status, COUNT(*) AS cnt
     ${FROM_SQL} ${where}
     GROUP BY fe.status`,
    params
  );
  const byStatus = Object.fromEntries(rows.map((r) => [r.status, Number(r.cnt) || 0]));
  const eligible = await countEligibleDebtors(viewer);
  return {
    eligible,
    pendingSenior: byStatus.pending_senior || byStatus.requested || 0,
    approved: byStatus.approved || 0,
    assigned: byStatus.assigned || 0,
    rejected: byStatus.rejected || 0,
    cancelled: byStatus.cancelled || 0,
    total: Object.values(byStatus).reduce((a, b) => a + b, 0),
  };
}

async function computeEligibilitySnapshot(debtorId) {
  const cfg = await getEscalationConfig();
  const [rows] = await pool.query(
    `SELECT ca.id, ca.created_at
     FROM contact_attempts ca
     INNER JOIN contact_statuses cs ON cs.id = ca.contact_status_id
     WHERE ca.debtor_id = ?
       AND CHAR_LENGTH(TRIM(ca.notes)) >= ?
       AND UPPER(cs.code) IN (?)
       AND ca.created_at >= DATE_SUB(UTC_TIMESTAMP(), INTERVAL ? DAY)
     ORDER BY ca.created_at ASC`,
    [Number(debtorId), MIN_NOTE_LENGTH, cfg.refusalStatusCodes, cfg.lookbackDays]
  );
  const refusalCount = rows.length;
  if (refusalCount < cfg.minRefusalContacts) {
    return { eligible: false, refusalCount, waitStartedAt: null, eligibleAt: null, cfg };
  }
  const waitStartedAt = rows[cfg.minRefusalContacts - 1].created_at;
  const eligibleAt = new Date(waitStartedAt);
  eligibleAt.setUTCDate(eligibleAt.getUTCDate() + cfg.waitPeriodDays);
  const eligible = eligibleAt.getTime() <= Date.now();

  if (eligible && cfg.requirePaymentGap) {
    const [[pay]] = await pool.query(
      `SELECT COUNT(*) AS cnt FROM payments
       WHERE debtor_id = ? AND confirmed = 1 AND created_at >= ?`,
      [Number(debtorId), waitStartedAt]
    );
    if (Number(pay?.cnt) > 0) {
      return { eligible: false, refusalCount, waitStartedAt, eligibleAt, cfg, reason: 'payment_during_wait' };
    }
  }

  return {
    eligible,
    refusalCount,
    waitStartedAt,
    eligibleAt: eligibleAt.toISOString(),
    cfg,
  };
}

async function requestEscalation(payload = {}, viewer) {
  if (!canSubmitEscalation(viewer)) {
    throw httpError('Only call center supervisors can request field escalation', 403, 'FORBIDDEN');
  }

  const debtorId = Number(payload.debtorId);
  if (!Number.isFinite(debtorId)) throw httpError('debtorId is required');

  const note = payload.note != null ? String(payload.note).trim() : '';
  if (note.length < MIN_NOTE_LENGTH) {
    throw httpError('Supervisor note is required (at least 5 characters)');
  }

  const cfg = await getEscalationConfig();
  if (!cfg.enabled) throw httpError('Field escalation is disabled');

  const debtor = await loadDebtorForEscalation(debtorId);
  if (!debtor) throw httpError('Debtor not found or closed', 404, 'NOT_FOUND');

  const scope = resolveCallCenterScope(viewer, {});
  const centerId = debtor.call_center_id != null ? Number(debtor.call_center_id) : null;
  if (scope.mode === 'center' && scope.callCenterId && centerId !== scope.callCenterId) {
    throw httpError('Debtor is outside your call center', 403, 'FORBIDDEN');
  }

  const [[open]] = await pool.query(
    `SELECT id FROM field_escalations
     WHERE debtor_id = ? AND status IN ('requested','pending_senior','approved','assigned')
     LIMIT 1`,
    [debtorId]
  );
  if (open) throw httpError('An open escalation already exists for this debtor', 409, 'CONFLICT');

  const snap = await computeEligibilitySnapshot(debtorId);
  if (!snap.eligible) {
    throw httpError(
      snap.reason === 'payment_during_wait'
        ? 'Debtor made a confirmed payment during the wait period'
        : `Debtor is not yet eligible (need ${cfg.minRefusalContacts} noted refusals and ${cfg.waitPeriodDays}-day wait)`,
      400,
      'BAD_REQUEST'
    );
  }

  const [result] = await pool.query(
    `INSERT INTO field_escalations
      (debtor_id, file_id, call_center_id, from_agent_user_id, status,
       refusal_count, wait_started_at, eligible_at,
       requested_by, requested_at, supervisor_note)
     VALUES (?, ?, ?, ?, 'pending_senior', ?, ?, ?, ?, UTC_TIMESTAMP(), ?)`,
    [
      debtorId,
      debtor.file_id || null,
      centerId,
      debtor.assigned_agent_user_id || null,
      snap.refusalCount,
      snap.waitStartedAt,
      snap.eligibleAt ? new Date(snap.eligibleAt) : null,
      viewer.id,
      note,
    ]
  );

  // Notify senior supervisors (company-wide for now — scoped notify later)
  try {
    const [seniors] = await pool.query(
      `SELECT u.id FROM users u
       INNER JOIN roles r ON r.id = u.role_id
       WHERE u.deleted_at IS NULL AND u.is_active = 1
         AND r.name IN ('Senior Supervisor', 'Tenant Administrator')`
    );
    await Promise.all(
      seniors.map((s) =>
        createNotification({
          userId: s.id,
          title: 'Field escalation pending approval',
          message: `${debtor.name} was escalated for field collection and needs senior approval.`,
          type: 'info',
        }).catch(() => null)
      )
    );
  } catch {
    /* ignore notify failures */
  }

  return getEscalationById(result.insertId);
}

async function approveEscalation(id, payload = {}, viewer) {
  if (!canSeniorReview(viewer)) {
    throw httpError('Only senior supervisors can approve field escalations', 403, 'FORBIDDEN');
  }

  const existing = await getEscalationDetail(id, viewer);
  if (existing.status !== 'pending_senior' && existing.status !== 'requested') {
    throw httpError('Only pending escalations can be approved');
  }

  const seniorNote = payload.note != null ? String(payload.note).trim() : null;

  await pool.query(
    `UPDATE field_escalations
     SET status = 'approved',
         senior_reviewed_by = ?,
         senior_reviewed_at = UTC_TIMESTAMP(),
         senior_note = ?
     WHERE id = ?`,
    [viewer.id, seniorNote, Number(id)]
  );

  if (existing.requestedBy) {
    createNotification({
      userId: existing.requestedBy,
      title: 'Field escalation approved',
      message: `${existing.debtorName || 'A debtor'} was approved for field assignment.`,
      type: 'success',
    }).catch(() => {});
  }

  return getEscalationById(id);
}

async function rejectEscalation(id, payload = {}, viewer) {
  if (!canSeniorReview(viewer)) {
    throw httpError('Only senior supervisors can reject field escalations', 403, 'FORBIDDEN');
  }

  const existing = await getEscalationDetail(id, viewer);
  if (existing.status !== 'pending_senior' && existing.status !== 'requested') {
    throw httpError('Only pending escalations can be rejected');
  }

  const reason = payload.rejectionReason != null
    ? String(payload.rejectionReason).trim()
    : '';
  if (reason.length < MIN_NOTE_LENGTH) {
    throw httpError('Rejection reason is required (at least 5 characters)');
  }

  await pool.query(
    `UPDATE field_escalations
     SET status = 'rejected',
         senior_reviewed_by = ?,
         senior_reviewed_at = UTC_TIMESTAMP(),
         rejection_reason = ?,
         senior_note = ?
     WHERE id = ?`,
    [viewer.id, reason, payload.note != null ? String(payload.note).trim() : reason, Number(id)]
  );

  if (existing.requestedBy) {
    createNotification({
      userId: existing.requestedBy,
      title: 'Field escalation rejected',
      message: `${existing.debtorName || 'A debtor'} escalation was rejected: ${reason}`,
      type: 'warning',
    }).catch(() => {});
  }

  return getEscalationById(id);
}

async function assignFieldAgent(id, payload = {}, viewer) {
  if (!canAssignFieldAgent(viewer)) {
    throw httpError('Only supervisors can assign field agents', 403, 'FORBIDDEN');
  }

  const existing = await getEscalationDetail(id, viewer);
  if (existing.status !== 'approved') {
    throw httpError('Escalation must be approved before assigning a field agent');
  }

  const fieldAgentUserId = Number(payload.fieldAgentUserId);
  if (!Number.isFinite(fieldAgentUserId)) {
    throw httpError('fieldAgentUserId is required');
  }

  const agents = await listAgents({
    expertise: FIELD_AGENT_EXPERTISE,
    callCenterId: existing.callCenterId || undefined,
    user: viewer,
  });
  const agent = (Array.isArray(agents) ? agents : []).find(
    (a) => Number(a.id) === fieldAgentUserId
  );
  if (!agent) {
    throw httpError('Selected user is not a Field Agent in this call center', 400, 'BAD_REQUEST');
  }
  if (!agent.isActive) {
    throw httpError('Field agent is inactive');
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    await conn.query(
      `UPDATE debtors
       SET assigned_agent = ?, assigned_agent_user_id = ?
       WHERE id = ?`,
      [agent.name, agent.id, existing.debtorId]
    );
    await conn.query(
      `UPDATE field_escalations
       SET status = 'assigned',
           to_field_agent_user_id = ?,
           assigned_by = ?,
           assigned_at = UTC_TIMESTAMP()
       WHERE id = ?`,
      [agent.id, viewer.id, Number(id)]
    );
    await conn.commit();
  } catch (error) {
    await conn.rollback();
    throw error;
  } finally {
    conn.release();
  }

  createNotification({
    userId: agent.id,
    title: 'Field visit assigned',
    message: `${existing.debtorName || 'A debtor'} was assigned to you for field collection.`,
    type: 'info',
  }).catch(() => {});

  return getEscalationById(id);
}

async function cancelEscalation(id, viewer) {
  if (!canSubmitEscalation(viewer) && !canSeniorReview(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }

  const existing = await getEscalationDetail(id, viewer);
  if (!['requested', 'pending_senior', 'approved'].includes(existing.status)) {
    throw httpError('Only open escalations can be cancelled');
  }

  await pool.query(
    `UPDATE field_escalations SET status = 'cancelled' WHERE id = ?`,
    [Number(id)]
  );

  return getEscalationById(id);
}

async function listFieldAgentsForCenter(viewer, callCenterId) {
  if (!canAssignFieldAgent(viewer)) {
    throw httpError('Forbidden', 403, 'FORBIDDEN');
  }
  const scope = resolveCallCenterScope(viewer, { callCenterId });
  const centerId =
    scope.mode === 'center'
      ? scope.callCenterId
      : callCenterId != null && callCenterId !== ''
        ? Number(callCenterId)
        : scope.callCenterId;

  const agents = await listAgents({
    expertise: FIELD_AGENT_EXPERTISE,
    callCenterId: centerId || undefined,
    user: viewer,
  });
  return (Array.isArray(agents) ? agents : []).filter((a) => a.isActive !== false);
}

module.exports = {
  OPEN_STATUSES,
  STATUSES,
  FIELD_AGENT_EXPERTISE,
  getEscalationConfig,
  listEligibleDebtors,
  countEligibleDebtors,
  listEscalations,
  getEscalationTotals,
  getEscalationDetail,
  requestEscalation,
  approveEscalation,
  rejectEscalation,
  assignFieldAgent,
  cancelEscalation,
  listFieldAgentsForCenter,
  canSubmitEscalation,
  canSeniorReview,
};
