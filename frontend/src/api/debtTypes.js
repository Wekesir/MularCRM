import api from './client';

export async function fetchDebtTypes() {
  const { data } = await api.get('/api/debt-types');
  return data;
}

export async function createDebtType(payload) {
  const { data } = await api.post('/api/debt-types', payload);
  return data;
}

export async function updateDebtType(id, payload) {
  const { data } = await api.put(`/api/debt-types/${id}`, payload);
  return data;
}

export async function deleteDebtType(id) {
  const { data } = await api.delete(`/api/debt-types/${id}`);
  return data;
}
