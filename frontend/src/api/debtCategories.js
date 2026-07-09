import api from './client';

export async function fetchDebtCategories() {
  const { data } = await api.get('/api/debt-categories');
  return data;
}

export async function createDebtCategory(payload) {
  const { data } = await api.post('/api/debt-categories', payload);
  return data;
}

export async function updateDebtCategory(id, payload) {
  const { data } = await api.put(`/api/debt-categories/${id}`, payload);
  return data;
}

export async function deleteDebtCategory(id) {
  const { data } = await api.delete(`/api/debt-categories/${id}`);
  return data;
}
