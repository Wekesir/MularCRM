import api from './client';

const BASE = '/api/audit';

const TYPE_PATHS = {
  logins: `${BASE}/logins`,
  emails: `${BASE}/emails`,
  sms: `${BASE}/sms`,
  activities: `${BASE}/activities`,
};

function resolvePath(type) {
  const path = TYPE_PATHS[type];
  if (!path) throw new Error(`Unknown audit type: ${type}`);
  return path;
}

export async function fetchAuditStats(type) {
  const { data } = await api.get(`${resolvePath(type)}/stats`);
  return data;
}

export async function fetchAuditRecords(type, { search, dateFrom, dateTo, limit = 1000 } = {}) {
  const params = { page: 1, limit };
  if (search) params['search[value]'] = search;
  if (dateFrom) params.dateFrom = dateFrom;
  if (dateTo) params.dateTo = dateTo;
  const { data } = await api.get(resolvePath(type), { params });
  return data;
}

export async function deleteAuditRecord(type, id) {
  const { data } = await api.delete(`${resolvePath(type)}/${id}`);
  return data;
}

export async function clearAuditRecords(type, { olderThanDays } = {}) {
  const { data } = await api.delete(resolvePath(type), {
    params: olderThanDays ? { olderThanDays } : {},
  });
  return data;
}
