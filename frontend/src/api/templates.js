import api from './client';

// ── Email templates ──

export async function fetchEmailTemplates({ clientId = null, systemOnly = false } = {}) {
  const params = {};
  if (clientId) params.clientId = clientId;
  if (systemOnly) params.systemOnly = '1';
  const { data } = await api.get('/api/templates/email', { params });
  return data;
}

export async function createEmailTemplate(payload) {
  const { data } = await api.post('/api/templates/email', payload);
  return data;
}

export async function updateEmailTemplate(id, payload) {
  const { data } = await api.put(`/api/templates/email/${id}`, payload);
  return data;
}

export async function deleteEmailTemplate(id) {
  const { data } = await api.delete(`/api/templates/email/${id}`);
  return data;
}

// ── SMS templates ──

export async function fetchSmsTemplates({ clientId = null, systemOnly = false } = {}) {
  const params = {};
  if (clientId) params.clientId = clientId;
  if (systemOnly) params.systemOnly = '1';
  const { data } = await api.get('/api/templates/sms', { params });
  return data;
}

export async function createSmsTemplate(payload) {
  const { data } = await api.post('/api/templates/sms', payload);
  return data;
}

export async function updateSmsTemplate(id, payload) {
  const { data } = await api.put(`/api/templates/sms/${id}`, payload);
  return data;
}

export async function deleteSmsTemplate(id) {
  const { data } = await api.delete(`/api/templates/sms/${id}`);
  return data;
}
