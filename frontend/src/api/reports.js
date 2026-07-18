import api from './client';

export async function fetchReportData(slug, params = {}, unlockToken = null) {
  const { data } = await api.get(`/api/reports/${slug}/data`, {
    params: {
      ...params,
      token: unlockToken || undefined,
    },
  });
  return data;
}

/** Download a streamed CSV export (Debtor Summary). */
export async function downloadReportExport(slug, params = {}, unlockToken = null) {
  try {
    const response = await api.get(`/api/reports/${slug}/export`, {
      params: {
        ...params,
        token: unlockToken || undefined,
      },
      responseType: 'blob',
    });

    const disposition = response.headers['content-disposition'] || '';
    const match = disposition.match(/filename="?([^"]+)"?/i);
    const filename = match?.[1] || `${slug}-export.csv`;

    const blob = response.data instanceof Blob
      ? response.data
      : new Blob([response.data], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  } catch (error) {
    const blob = error?.response?.data;
    if (blob instanceof Blob) {
      const text = await blob.text();
      try {
        const parsed = JSON.parse(text);
        const err = new Error(parsed.message || 'Export failed');
        err.response = { data: parsed, status: error.response?.status };
        throw err;
      } catch (inner) {
        if (inner?.response) throw inner;
      }
    }
    throw error;
  }
}

export async function fetchUserPermissions() {
  const { data } = await api.get('/api/reports/permissions');
  return data;
}

export async function fetchAccessibleReports(slugs) {
  const { data } = await api.get('/api/reports/accessible', {
    params: { slugs: slugs.join(',') },
  });
  return data;
}

export async function fetchReportGate(slug, token) {
  const { data } = await api.get(`/api/reports/${slug}/gate`, {
    params: { token: token || undefined },
  });
  return data;
}

export async function unlockReport(slug, password) {
  const { data } = await api.post(`/api/reports/${slug}/unlock`, { password });
  return data;
}

export async function fetchReportAccessSettings() {
  const { data } = await api.get('/api/reports/access-settings');
  return data;
}

export async function setReportPassword(slug, password) {
  const { data } = await api.put(`/api/reports/access-settings/${slug}/password`, { password });
  return data;
}

export async function clearReportPassword(slug) {
  const { data } = await api.delete(`/api/reports/access-settings/${slug}/password`);
  return data;
}
