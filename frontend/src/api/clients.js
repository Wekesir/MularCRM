import api from './client';

export async function fetchClients() {
  const { data } = await api.get('/api/clients');
  return data;
}

export async function createClient(payload) {
  const { data } = await api.post('/api/clients', payload);
  return data;
}

export async function updateClient(id, payload) {
  const { data } = await api.put(`/api/clients/${id}`, payload);
  return data;
}

export async function deleteClient(id) {
  const { data } = await api.delete(`/api/clients/${id}`);
  return data;
}

// Downloads the strict Excel (.xlsx) upload template and saves it to the
// user's downloads folder via a transient object URL.
export async function downloadClientTemplate() {
  const response = await api.get('/api/clients/template', {
    responseType: 'blob',
  });
  const filename = response.headers['content-disposition']
    ?.match(/filename="?([^";]+)"?/i)?.[1] || 'client-upload-template.xlsx';

  const url = window.URL.createObjectURL(
    new Blob([response.data], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.URL.revokeObjectURL(url);
}

// Bulk-imports clients from an .xlsx file. Returns
// { createdCount, failedCount, created, failed }.
export async function bulkUploadClients(file) {
  const formData = new FormData();
  formData.append('file', file);
  const { data } = await api.post('/api/clients/bulk-upload', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return data;
}
