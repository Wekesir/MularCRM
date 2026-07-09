import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'clientId', 'debtCategoryId', 'status', 'agentName',
    'periodFrom', 'periodTo', 'search',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchCommissionSummary(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/commissions/summary', { params });
  return data;
}

export async function fetchCommissionEarnings({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/commissions/earnings', { params });
  return data;
}

export async function fetchCommissionTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/commissions/totals', { params });
  return data;
}

export async function fetchCommissionPayouts(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/commissions/payouts', { params });
  return data;
}

export async function markEarningsInvoiced(ids) {
  const { data } = await api.post('/api/commissions/earnings/invoice', { ids });
  return data;
}

export async function recordCommissionPayout(payload) {
  const { data } = await api.post('/api/commissions/payouts', payload);
  return data;
}
