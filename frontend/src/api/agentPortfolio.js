import api from './client';

function buildParams(filters = {}) {
  const params = {};
  const keys = [
    'search',
    'clientId',
    'contacted',
    'channel',
    'contactStatusId',
    'ptp',
    'reminderDue',
    'nextActionFrom',
    'nextActionTo',
    'bucket',
    'overdueDaysMin',
    'overdueDaysMax',
  ];
  for (const k of keys) {
    const v = filters[k];
    if (v !== null && v !== undefined && v !== '') params[k] = v;
  }
  return params;
}

export async function fetchAgentPortfolio({ page = 1, pageSize = 25, ...filters } = {}) {
  const params = { page, pageSize, ...buildParams(filters) };
  const { data } = await api.get('/api/agents/me/portfolio', { params });
  return data;
}

export async function fetchAgentPortfolioTotals(filters = {}) {
  const params = buildParams(filters);
  const { data } = await api.get('/api/agents/me/portfolio/totals', { params });
  return data;
}

export async function sendPortfolioSms(debtorId, payload) {
  const { data } = await api.post(`/api/agents/me/portfolio/${debtorId}/sms`, payload);
  return data;
}

export async function sendPortfolioEmail(debtorId, payload) {
  const { data } = await api.post(`/api/agents/me/portfolio/${debtorId}/email`, payload);
  return data;
}

export async function logPortfolioResponse(debtorId, payload) {
  const { data } = await api.post(`/api/agents/me/portfolio/${debtorId}/responses`, payload);
  return data;
}

export async function fetchPortfolioActivity(debtorId, { channel = 'all', limit = 100 } = {}) {
  const { data } = await api.get(`/api/agents/me/portfolio/${debtorId}/activity`, {
    params: { channel, limit },
  });
  return data;
}

export async function startPortfolioCall(debtorId, payload = {}) {
  const { data } = await api.post(`/api/agents/me/portfolio/${debtorId}/calls`, payload);
  return data;
}

export async function fetchAgentSimCards() {
  const { data } = await api.get('/api/agents/me/sim-cards');
  return data.items || [];
}

export async function createAgentSimCard(payload) {
  const { data } = await api.post('/api/agents/me/sim-cards', payload);
  return data;
}

export async function updateAgentSimCard(id, payload) {
  const { data } = await api.patch(`/api/agents/me/sim-cards/${id}`, payload);
  return data;
}

export async function deleteAgentSimCard(id) {
  const { data } = await api.delete(`/api/agents/me/sim-cards/${id}`);
  return data;
}
