import api from './client';

export async function fetchCurrencies() {
  const { data } = await api.get('/api/currencies');
  return data;
}

export async function createCurrency(payload) {
  const { data } = await api.post('/api/currencies', payload);
  return data;
}

export async function updateCurrency(id, payload) {
  const { data } = await api.put(`/api/currencies/${id}`, payload);
  return data;
}

export async function deleteCurrency(id) {
  const { data } = await api.delete(`/api/currencies/${id}`);
  return data;
}
