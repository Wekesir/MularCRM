import api from './client';

export async function fetchTemplateVariables() {
  const { data } = await api.get('/api/template-variables');
  return data;
}

export async function createTemplateVariable(payload) {
  const { data } = await api.post('/api/template-variables', payload);
  return data;
}

export async function updateTemplateVariable(id, payload) {
  const { data } = await api.put(`/api/template-variables/${id}`, payload);
  return data;
}

export async function deleteTemplateVariable(id) {
  const { data } = await api.delete(`/api/template-variables/${id}`);
  return data;
}
