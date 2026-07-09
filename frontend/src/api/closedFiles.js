import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'clientId', 'fileId', 'agent', 'closureReason',
    'closedFrom', 'closedTo', 'lastContactedFrom', 'lastContactedTo',
    'search',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchClosedDebtors({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/closed-files', { params });
  return data;
}

export async function fetchClosureReasons() {
  const { data } = await api.get('/api/closed-files/closure-reasons');
  return data;
}

export async function fetchClosedDebtorTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/closed-files/totals', { params });
  return data;
}

export async function fetchClosedDebtorsForExport(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/closed-files/export', { params });
  return data;
}
