import api from './client';

// Per-client case aggregates for the Case Management table.
// Returns [{ clientId, clientName, totalFiles, totalCases, totalAmount,
//            assignedCases, unassignedCases }].
export async function fetchCaseSummary(search = '') {
  const params = search ? { search } : undefined;
  const { data } = await api.get('/api/case-management', { params });
  return data;
}

// All batch files (debtor_files) for a single client.
export async function fetchClientFiles(clientId) {
  const { data } = await api.get(`/api/case-management/clients/${clientId}/files`);
  return data;
}

// Per-agent allocation breakdown for a case file.
export async function fetchFileAllocation(fileId) {
  const { data } = await api.get(`/api/case-management/files/${fileId}/allocation`);
  return data;
}

// Round-robin assign the file's unassigned cases to the selected agents.
export async function assignFileAgents(fileId, agentIds) {
  const { data } = await api.post(`/api/case-management/files/${fileId}/assign`, { agentIds });
  return data;
}

// Clear assignments for the chosen agents within the file.
export async function unassignFileAgents(fileId, agentIds) {
  const { data } = await api.post(`/api/case-management/files/${fileId}/unassign`, { agentIds });
  return data;
}

// Move cases from one agent to another within the file.
export async function reallocateFileAgents(fileId, fromAgentId, toAgentId) {
  const { data } = await api.post(`/api/case-management/files/${fileId}/reallocate`, {
    fromAgentId,
    toAgentId,
  });
  return data;
}

// Assign a specific set of cases (by debtor id) to chosen agents (round-robin).
export async function assignFileCases(fileId, debtorIds, agentIds) {
  const { data } = await api.post(`/api/case-management/files/${fileId}/cases/assign`, {
    debtorIds,
    agentIds,
  });
  return data;
}

// Clear assignments on a specific set of cases (by debtor id).
export async function unassignFileCases(fileId, debtorIds) {
  const { data } = await api.post(`/api/case-management/files/${fileId}/cases/unassign`, {
    debtorIds,
  });
  return data;
}
