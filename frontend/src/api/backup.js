import api from './client';

export async function fetchBackupStatus() {
  const { data } = await api.get('/api/backup/status');
  return data;
}

export async function runBackupNow() {
  const { data } = await api.post('/api/backup/run');
  return data;
}

export async function parseServiceAccountKey(serviceAccountKey) {
  const { data } = await api.post('/api/backup/parse-service-account', {
    serviceAccountKey,
  });
  return data;
}

export async function fetchBackupGoogleAuthUrl() {
  const { data } = await api.get('/api/backup/google/auth-url');
  return data;
}

export async function disconnectBackupGoogle() {
  const { data } = await api.post('/api/backup/google/disconnect');
  return data;
}

export async function clearPendingBackup() {
  const { data } = await api.post('/api/backup/pending/clear');
  return data;
}
