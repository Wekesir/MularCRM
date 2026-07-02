import api from './client';

export async function fetchSystemConfig() {
  const { data } = await api.get('/api/system-config');
  return data;
}

export async function fetchBranding() {
  const { data } = await api.get('/api/system-config/branding');
  return data;
}

export async function saveSystemConfig(config) {
  const { data } = await api.put('/api/system-config', config);
  return data;
}

export async function fetchSmsBalance() {
  const { data } = await api.get('/api/system-config/sms/balance');
  return data;
}

export async function sendTestSms({ mobile, message }) {
  const { data } = await api.post('/api/system-config/sms/test', { mobile, message });
  return data;
}
