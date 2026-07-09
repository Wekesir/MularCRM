import api from './client';

export async function fetchCommissionRates() {
  const { data } = await api.get('/api/client-commission-rates');
  return data;
}

export async function createCommissionRate(payload) {
  const { data } = await api.post('/api/client-commission-rates', payload);
  return data;
}

export async function updateCommissionRate(id, payload) {
  const { data } = await api.put(`/api/client-commission-rates/${id}`, payload);
  return data;
}

export async function deleteCommissionRate(id) {
  const { data } = await api.delete(`/api/client-commission-rates/${id}`);
  return data;
}
