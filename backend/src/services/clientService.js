const pool = require('../db/pool');
const {
  resolveCallCenterScope,
  isSeniorSupervisorRole,
  isRegionalManagerRole,
  sqlCentersInRegion,
} = require('../config/orgRoles');
const { recordActivityEvent } = require('./activityService');

function toNumber(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function normalizeClient(row) {
  return {
    id: row.id,
    name: row.name,
    businessType: row.business_type,
    phone: row.phone,
    email: row.email,
    status: row.status,
    totalFiles: row.total_files,
    activeCases: row.active_cases,
    closedFiles: row.closed_files,
    activeValue: toNumber(row.active_value),
    closedValue: toNumber(row.closed_value),
    collected: toNumber(row.collected),
    balance: toNumber(row.balance),
    callCenterId: row.call_center_id != null ? Number(row.call_center_id) : null,
    callCenterName: row.call_center_name || null,
    callCenterAssignedAt: row.call_center_assigned_at || null,
    callCenterAssignedBy: row.call_center_assigned_by != null ? Number(row.call_center_assigned_by) : null,
    deletedAt: row.deleted_at || null,
    addedAt: row.created_at ? new Date(row.created_at).toISOString().slice(0, 10) : null,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const CLIENT_SELECT = `
  SELECT c.*, cc.name AS call_center_name
  FROM clients c
  LEFT JOIN call_centers cc ON cc.id = c.call_center_id AND cc.deleted_at IS NULL
`;

async function listClients({ user = null, unassignedOnly = false } = {}) {
  const where = ['c.deleted_at IS NULL'];
  const params = [];

  if (user) {
    const scope = resolveCallCenterScope(user);
    if (scope.mode === 'center') {
      if (!scope.callCenterId) return [];
      where.push('c.call_center_id = ?');
      params.push(scope.callCenterId);
    } else if (scope.mode === 'region') {
      if (!scope.regionId) return [];
      if (scope.callCenterId) {
        where.push('c.call_center_id = ?');
        params.push(scope.callCenterId);
        where.push(`c.call_center_id IN (${sqlCentersInRegion()})`);
        params.push(scope.regionId);
      } else {
        where.push(`c.call_center_id IN (${sqlCentersInRegion()})`);
        params.push(scope.regionId);
      }
    } else if (scope.mode === 'none') {
      return [];
    }
  }

  if (unassignedOnly) {
    where.push('c.call_center_id IS NULL');
  }

  const [rows] = await pool.query(
    `${CLIENT_SELECT}
     WHERE ${where.join(' AND ')}
     ORDER BY c.created_at DESC, c.id DESC`,
    params
  );
  return rows.map(normalizeClient);
}

async function getClientById(id) {
  const [rows] = await pool.query(`${CLIENT_SELECT} WHERE c.id = ? LIMIT 1`, [id]);
  return rows[0] ? normalizeClient(rows[0]) : null;
}

/** Center Supervisors may only access clients bound to their call center. */
async function assertCallerCanAccessClient(user, clientId) {
  if (!user || user.isSystemAdmin) return;
  const scope = resolveCallCenterScope(user);
  if (scope.mode === 'company') return;
  const client = await getClientById(clientId);
  if (!client || client.deletedAt) {
    const err = new Error('Client not found');
    err.code = 'NOT_FOUND';
    err.status = 404;
    throw err;
  }
  if (scope.mode === 'region') {
    if (!scope.regionId) {
      const err = new Error('You are not bound to a region');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
    if (!client.callCenterId) {
      const err = new Error('This client is not in your region');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
    const [centers] = await pool.query(
      `SELECT id FROM call_centers WHERE id = ? AND region_id = ? AND deleted_at IS NULL LIMIT 1`,
      [client.callCenterId, scope.regionId]
    );
    if (!centers[0]) {
      const err = new Error('This client is not in your region');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
    return;
  }
  if (scope.mode !== 'center' || !scope.callCenterId) {
    const err = new Error('You are not bound to a call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
  if (Number(client.callCenterId) !== Number(scope.callCenterId)) {
    const err = new Error('This client is not assigned to your call center');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }
}

async function getClientByEmail(email) {
  const [rows] = await pool.query(`${CLIENT_SELECT} WHERE c.email = ? LIMIT 1`, [email]);
  return rows[0] ? normalizeClient(rows[0]) : null;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const PHONE_ALLOWED = /^[0-9+][0-9+\-\s()]{5,31}$/;

function validateClientInput(data, { partial = false } = {}) {
  const errors = [];
  if (!partial || data.name !== undefined) {
    if (!data.name || !String(data.name).trim()) errors.push('Name is required');
  }
  if (!partial || data.businessType !== undefined) {
    if (!data.businessType || !String(data.businessType).trim()) errors.push('Business type is required');
  }
  if (!partial || data.phone !== undefined) {
    const phone = String(data.phone || '').trim();
    if (!phone) errors.push('Phone is required');
    else if (!PHONE_ALLOWED.test(phone)) errors.push('Phone number format is invalid');
  }
  if (!partial || data.email !== undefined) {
    const email = String(data.email || '').trim().toLowerCase();
    if (!email) errors.push('Email is required');
    else if (!EMAIL_REGEX.test(email)) errors.push('A valid email address is required');
  }
  return errors;
}

async function createClient(data) {
  const errors = validateClientInput(data);
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const email = String(data.email).trim().toLowerCase();
  const clash = await getClientByEmail(email);
  if (clash) {
    const err = new Error('A client with this email already exists');
    err.code = 'DUPLICATE';
    throw err;
  }

  const status = data.status === 'inactive' ? 'inactive' : 'active';
  const [result] = await pool.query(
    `INSERT INTO clients (name, business_type, phone, email, status, total_files, active_cases,
        closed_files, active_value, closed_value, collected, balance)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      String(data.name).trim(),
      String(data.businessType).trim(),
      String(data.phone).trim(),
      email,
      status,
      Number(data.totalFiles) || 0,
      Number(data.activeCases) || 0,
      Number(data.closedFiles) || 0,
      toNumber(data.activeValue),
      toNumber(data.closedValue),
      toNumber(data.collected),
      toNumber(data.balance),
    ]
  );

  return getClientById(result.insertId);
}

async function updateClient(id, data) {
  const existing = await getClientById(id);
  if (!existing) return null;

  const errors = validateClientInput(data, { partial: true });
  if (errors.length) {
    const err = new Error(errors[0]);
    err.code = 'VALIDATION';
    throw err;
  }

  const merged = {
    name: data.name !== undefined ? String(data.name).trim() : existing.name,
    businessType:
      data.businessType !== undefined ? String(data.businessType).trim() : existing.businessType,
    phone: data.phone !== undefined ? String(data.phone).trim() : existing.phone,
    email:
      data.email !== undefined ? String(data.email).trim().toLowerCase() : existing.email,
    status: data.status !== undefined ? (data.status === 'inactive' ? 'inactive' : 'active') : existing.status,
    totalFiles: data.totalFiles !== undefined ? Number(data.totalFiles) || 0 : existing.totalFiles,
    activeCases: data.activeCases !== undefined ? Number(data.activeCases) || 0 : existing.activeCases,
    closedFiles: data.closedFiles !== undefined ? Number(data.closedFiles) || 0 : existing.closedFiles,
    activeValue: data.activeValue !== undefined ? toNumber(data.activeValue) : existing.activeValue,
    closedValue: data.closedValue !== undefined ? toNumber(data.closedValue) : existing.closedValue,
    collected: data.collected !== undefined ? toNumber(data.collected) : existing.collected,
    balance: data.balance !== undefined ? toNumber(data.balance) : existing.balance,
  };

  if (merged.email !== existing.email) {
    const clash = await getClientByEmail(merged.email);
    if (clash && clash.id !== Number(id)) {
      const err = new Error('A client with this email already exists');
      err.code = 'DUPLICATE';
      throw err;
    }
  }

  await pool.query(
    `UPDATE clients
     SET name = ?, business_type = ?, phone = ?, email = ?, status = ?,
         total_files = ?, active_cases = ?, closed_files = ?,
         active_value = ?, closed_value = ?, collected = ?, balance = ?
     WHERE id = ?`,
    [
      merged.name,
      merged.businessType,
      merged.phone,
      merged.email,
      merged.status,
      merged.totalFiles,
      merged.activeCases,
      merged.closedFiles,
      merged.activeValue,
      merged.closedValue,
      merged.collected,
      merged.balance,
      id,
    ]
  );

  return getClientById(id);
}

// Soft delete — preserves all client data and linked templates so the client
// can be restored later. listClients() excludes soft-deleted rows.
async function deleteClient(id) {
  const existing = await getClientById(id);
  if (!existing) return { deleted: false };
  await pool.query('UPDATE clients SET deleted_at = NOW() WHERE id = ?', [id]);
  return { deleted: true, id: Number(id), softDelete: true };
}

async function restoreClient(id) {
  const [rows] = await pool.query('SELECT id FROM clients WHERE id = ? LIMIT 1', [id]);
  if (!rows[0]) return { restored: false };
  await pool.query('UPDATE clients SET deleted_at = NULL WHERE id = ?', [id]);
  return { restored: true, id: Number(id) };
}

/**
 * Assign a client to a call center once.
 * System Admin or Senior Supervisor may force reassignment with { force: true }.
 */
async function assignClientCallCenter(clientId, callCenterId, { performedBy, force = false } = {}) {
  const client = await getClientById(clientId);
  if (!client) {
    const err = new Error('Client not found');
    err.code = 'NOT_FOUND';
    throw err;
  }

  const centerId = Number(callCenterId);
  if (!Number.isFinite(centerId)) {
    const err = new Error('callCenterId is required');
    err.code = 'VALIDATION';
    throw err;
  }

  const [centers] = await pool.query(
    `SELECT id, name, status FROM call_centers
     WHERE id = ? AND deleted_at IS NULL LIMIT 1`,
    [centerId]
  );
  if (!centers[0]) {
    const err = new Error('Call center not found');
    err.code = 'NOT_FOUND';
    throw err;
  }
  if (centers[0].status !== 'active') {
    const err = new Error('Call center is inactive');
    err.code = 'VALIDATION';
    throw err;
  }

  const alreadyAssigned = client.callCenterId != null;
  const isAdmin = Boolean(performedBy?.isSystemAdmin);
  const isSenior = isSeniorSupervisorRole(performedBy);
  const isRegional = isRegionalManagerRole(performedBy);
  const canManage = isAdmin || isSenior || isRegional;

  if (!canManage) {
    const err = new Error('Only Senior Supervisors or Regional Managers can assign clients to call centers');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  if (isRegional && !isAdmin && !isSenior) {
    const regionId = performedBy.regionId != null ? Number(performedBy.regionId) : null;
    if (!regionId) {
      const err = new Error('You are not bound to a region');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
    const [centerRows] = await pool.query(
      `SELECT id FROM call_centers WHERE id = ? AND region_id = ? AND deleted_at IS NULL LIMIT 1`,
      [centerId, regionId]
    );
    if (!centerRows[0]) {
      const err = new Error('Call center is not in your region');
      err.code = 'FORBIDDEN';
      err.status = 403;
      throw err;
    }
  }

  if (alreadyAssigned && !force) {
    const err = new Error(
      `Client already assigned to ${client.callCenterName || 'a call center'}. Use force reassignment to move them.`
    );
    err.code = 'ALREADY_ASSIGNED';
    throw err;
  }

  if (alreadyAssigned && force && !canManage) {
    const err = new Error('Only a Senior Supervisor or System Admin can reassign a client');
    err.code = 'FORBIDDEN';
    err.status = 403;
    throw err;
  }

  await pool.query(
    `UPDATE clients
     SET call_center_id = ?,
         call_center_assigned_at = NOW(),
         call_center_assigned_by = ?
     WHERE id = ?`,
    [centerId, performedBy?.id || null, clientId]
  );

  await recordActivityEvent({
    userId: performedBy?.id ?? null,
    userName: performedBy?.name ?? null,
    actionType: alreadyAssigned ? 'client.call_center_reassigned' : 'client.call_center_assigned',
    title: alreadyAssigned
      ? `Reassigned ${client.name} to ${centers[0].name}`
      : `Assigned ${client.name} to ${centers[0].name}`,
    subject: client.name,
    entityType: 'client',
    entityId: String(clientId),
    metadata: {
      callCenterId: centerId,
      callCenterName: centers[0].name,
      previousCallCenterId: client.callCenterId,
      force: Boolean(force),
    },
  });

  return getClientById(clientId);
}

module.exports = {
  listClients,
  getClientById,
  getClientByEmail,
  createClient,
  updateClient,
  deleteClient,
  restoreClient,
  assignClientCallCenter,
  assertCallerCanAccessClient,
};
