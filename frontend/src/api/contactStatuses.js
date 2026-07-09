import api from './client';

export async function fetchContactStatuses() {
  const { data } = await api.get('/api/contact-statuses');
  return data;
}

export async function createContactStatus(payload) {
  const { data } = await api.post('/api/contact-statuses', payload);
  return data;
}

export async function updateContactStatus(id, payload) {
  const { data } = await api.put(`/api/contact-statuses/${id}`, payload);
  return data;
}

export async function deleteContactStatus(id) {
  const { data } = await api.delete(`/api/contact-statuses/${id}`);
  return data;
}
