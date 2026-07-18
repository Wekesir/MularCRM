import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'clientId',
    'agentId',
    'status',
    'channel',
    'search',
    'reminderDue',
    'promiseFrom',
    'promiseTo',
    'reminderFrom',
    'reminderTo',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchPtpArrangements({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/ptp', { params });
  return data;
}

export async function fetchPtpTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/ptp/totals', { params });
  return data;
}

export async function updatePtpArrangement(id, payload) {
  const { data } = await api.patch(`/api/ptp/${id}`, payload);
  return data;
}
