import api from './client';

export async function fetchLivePaymentsStatus() {
  const { data } = await api.get('/api/live-payments/status');
  return data;
}

export async function pullLivePayments({ clientId = null, date = null } = {}) {
  const { data } = await api.post('/api/live-payments/pull', { clientId, date });
  return data;
}

export async function testLivePaymentsConnection(payload) {
  const { data } = await api.post('/api/live-payments/test-connection', payload);
  return data;
}
