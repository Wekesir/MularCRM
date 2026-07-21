import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  UserRound,
  Plus,
  RefreshCw,
  Building2,
  CheckCircle2,
  XCircle,
  FolderOpen,
  Search,
  Pencil,
  Trash2,
  Eye,
  Upload,
  Wallet,
} from 'lucide-react';
import { toast } from 'react-toastify';
import StatCard from '../../components/StatCard';
import SectionHeader from '../../components/SectionHeader';
import ClientFormModal from '../../components/ClientFormModal';
import ClientBulkUploadModal from '../../components/ClientBulkUploadModal';
import ClientContactModal from '../../components/ClientContactModal';
import { EMPTY_CLIENT_FORM, BUSINESS_TYPES } from './clientConstants';
import { usePageActions } from '../../context/PageActionsContext';
import { usePageHeaderSticky } from '../../context/PageHeaderStickyContext';
import { useSystemConfig } from '../../context/SystemConfigContext';
import { useConfirm } from '../../context/ConfirmContext';
import { fetchClients, createClient, updateClient, deleteClient } from '../../api/clients';
import { usePermissions } from '../../hooks/usePermissions';

const TYPE_LABEL = Object.fromEntries(BUSINESS_TYPES.map((t) => [t.value, t.label]));

function formatMoney(value) {
  const n = Number(value) || 0;
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

function ClientManagementPage() {
  const { setActions } = usePageActions();
  const { headerInView } = usePageHeaderSticky();
  const { confirm } = useConfirm();
  const { currencySymbol } = useSystemConfig();
  const {
    isSystemAdmin,
    isSeniorSupervisor,
    isRegionalManager,
    isSupervisor,
    permissions,
  } = usePermissions();
  const canCreateClient =
    isSystemAdmin ||
    isSeniorSupervisor ||
    isRegionalManager ||
    Boolean(permissions?.management?.client_management?.create);
  const canUpdateClient =
    isSystemAdmin ||
    isSeniorSupervisor ||
    isRegionalManager ||
    Boolean(permissions?.management?.client_management?.update);
  const canDeleteClient =
    isSystemAdmin ||
    isSeniorSupervisor ||
    isRegionalManager ||
    Boolean(permissions?.management?.client_management?.delete);
  const canManageClients = canCreateClient || canUpdateClient || canDeleteClient;
  const isDocked = !headerInView;
  const [modalOpen, setModalOpen] = useState(false);
  const [bulkUploadOpen, setBulkUploadOpen] = useState(false);
  const [contactClient, setContactClient] = useState(null);
  const [editingClient, setEditingClient] = useState(null);
  const [form, setForm] = useState(EMPTY_CLIENT_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [clients, setClients] = useState([]);
  const [search, setSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  const loadClients = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchClients();
      setClients(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load clients');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadClients();
  }, [loadClients]);

  const stats = useMemo(() => ({
    total: clients.length,
    active: clients.filter((c) => c.status === 'active').length,
    inactive: clients.filter((c) => c.status === 'inactive').length,
    totalFiles: clients.reduce((s, c) => s + (c.totalFiles || 0), 0),
  }), [clients]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return clients.filter((c) => {
      if (q && !c.name.toLowerCase().includes(q) && !c.email.toLowerCase().includes(q) && !c.phone.includes(q)) {
        return false;
      }
      if (typeFilter && c.businessType !== typeFilter) return false;
      if (statusFilter && c.status !== statusFilter) return false;
      return true;
    });
  }, [clients, search, typeFilter, statusFilter]);

  const openAddModal = () => {
    setEditingClient(null);
    setForm(EMPTY_CLIENT_FORM);
    setModalOpen(true);
  };

  const openEditModal = (client) => {
    setEditingClient(client);
    setForm({
      name: client.name,
      businessType: client.businessType,
      phone: client.phone,
      email: client.email,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditingClient(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.businessType || !form.phone.trim() || !form.email.trim()) {
      toast.error('All fields are required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        businessType: form.businessType,
        phone: form.phone.trim(),
        email: form.email.trim(),
      };
      if (editingClient) {
        const updated = await updateClient(editingClient.id, payload);
        setClients((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(`Client "${updated.name}" updated`);
      } else {
        const created = await createClient(payload);
        setClients((prev) => [created, ...prev]);

        const n = created.notifications;
        const channels = [];
        const issues = [];
        if (n) {
          if (n.email?.sent) channels.push('email');
          else if (n.email?.message) issues.push(`email not sent: ${n.email.message}`);
          if (n.sms?.sent) channels.push('SMS');
          else if (n.sms?.message && n.sms?.reason !== 'not_configured' && n.sms?.reason !== 'no_phone') {
            issues.push(`SMS not sent: ${n.sms.message}`);
          }
        }

        let summary = `Client "${created.name}" onboarded`;
        if (channels.length === 2) summary += ' — confirmation sent via email & SMS';
        else if (channels.length === 1) summary += ` — confirmation sent via ${channels[0]}`;
        if (issues.length) summary += ` (${issues.join('; ')})`;

        if (issues.length && channels.length < 2) {
          toast.warning(summary);
        } else {
          toast.success(summary);
        }
      }
      setModalOpen(false);
      setForm(EMPTY_CLIENT_FORM);
      setEditingClient(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save client');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (client) => {
    await confirm({
      title: 'Delete client',
      message: `Are you sure you want to delete "${client.name}"?`,
      detail:
        'This client will be soft-deleted — they will no longer appear in the client directory, but all their data and linked templates are preserved and can be restored later.',
      confirmText: 'Delete Client',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteClient(client.id);
          setClients((prev) => prev.filter((c) => c.id !== client.id));
          toast.success(`Client "${client.name}" deleted`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete client');
          throw err;
        }
      },
    });
  };

  const handleRefresh = () => {
    setSearch('');
    setTypeFilter('');
    setStatusFilter('');
    loadClients();
    toast.info('Client list refreshed');
  };

  const handleBulkUploadCompleted = (res) => {
    if (!res) return;
    if (res.createdCount > 0) {
      loadClients();
    }
    let summary = `${res.createdCount} client${res.createdCount === 1 ? '' : 's'} onboarded`;
    if (res.failedCount > 0) {
      summary += `, ${res.failedCount} row${res.failedCount === 1 ? '' : 's'} skipped`;
    }
    if (res.createdCount > 0 && res.failedCount > 0) {
      toast.warning(summary);
    } else if (res.failedCount > 0 && res.createdCount === 0) {
      toast.error(summary);
    } else {
      toast.success(summary);
    }
  };

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={handleRefresh}>
          <RefreshCw className="icon-sm" />
        </button>
        {canCreateClient && (
          <button
            type="button"
            className="btn-sm cm-bulk-upload-btn"
            aria-label="Bulk upload clients"
            title="Bulk Upload"
            onClick={() => setBulkUploadOpen(true)}
          >
            <Upload className="icon-sm" />
            <span className="cm-bulk-upload-label">Bulk Upload</span>
          </button>
        )}
        {canCreateClient && (
          <button type="button" className="btn-primary btn-sm" onClick={openAddModal}>
            <Plus className="icon-sm" />
            Add Client
          </button>
        )}
      </>,
    );
    return () => setActions(null);
  }, [setActions, canCreateClient]);

  return (
    <>
      <div className={isDocked ? 'cm-page cm-page--docked' : 'cm-page'}>
        {/* ── Stat Cards ── */}
        <section className={isDocked ? 'cm-stat-grid cm-stat-grid--sticky' : 'cm-stat-grid'}>
          <StatCard
            icon={Building2}
            numericValue={stats.total}
            label="Total Clients"
            meta="Portfolio owners onboarded"
            accent="#06b6d4"
            variant="compact"
          />
          <StatCard
            icon={CheckCircle2}
            numericValue={stats.active}
            label="Active Clients"
            meta="Currently managed"
            accent="#10b981"
            variant="compact"
          />
          <StatCard
            icon={XCircle}
            numericValue={stats.inactive}
            label="Inactive Clients"
            meta="Paused or offboarded"
            accent="#f59e0b"
            variant="compact"
          />
          <StatCard
            icon={FolderOpen}
            numericValue={stats.totalFiles}
            label="Total Files"
            meta="Across all clients"
            accent="theme"
            variant="compact"
          />
        </section>

        {/* ── Client Table Card ── */}
        <div className="cm-table-card">
          <SectionHeader
            icon={UserRound}
            title="Client Directory"
            count={filtered.length}
          />

          {/* Toolbar */}
          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by name, phone or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
            <div className="cm-filters">
              <select
                className="cm-filter-select"
                value={typeFilter}
                onChange={(e) => setTypeFilter(e.target.value)}
                aria-label="Filter by business type"
              >
                <option value="">All Types</option>
                {BUSINESS_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>{t.label}</option>
                ))}
              </select>
              <select
                className="cm-filter-select"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                aria-label="Filter by status"
              >
                <option value="">All Statuses</option>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select>
            </div>
          </div>

          {/* Table */}
          <div className="cm-table-wrap">
            <table className="cm-table cm-table--wide">
              <thead>
                <tr>
                  <th className="cm-th cm-th-index">#</th>
                  <th className="cm-th">Client</th>
                  <th className="cm-th">Client Type</th>
                  <th className="cm-th cm-th-num">Active Files</th>
                  <th className="cm-th cm-th-num cm-th-money">
                    Active Value <span className="cm-th-currency">({currencySymbol})</span>
                  </th>
                  <th className="cm-th cm-th-num">Closed Files</th>
                  <th className="cm-th cm-th-num cm-th-money">
                    Closed Value <span className="cm-th-currency">({currencySymbol})</span>
                  </th>
                  <th className="cm-th cm-th-num cm-th-money">
                    Collected <span className="cm-th-currency">({currencySymbol})</span>
                  </th>
                  <th className="cm-th cm-th-num cm-th-money">
                    Balance <span className="cm-th-currency">({currencySymbol})</span>
                  </th>
                  <th className="cm-th cm-th-contact-btn">Contact</th>
                  {canManageClients && <th className="cm-th cm-th-actions">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={canManageClients ? 11 : 10}>
                      <div className="cm-empty-state">
                        <Building2 className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading clients…' : 'No clients found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching clients from the system database.'
                            : search || typeFilter || statusFilter
                              ? 'Try adjusting your search or filters.'
                              : canCreateClient
                                ? 'Click "Add Client" to onboard your first portfolio owner.'
                                : isSupervisor
                                  ? 'Clients assigned to your call center by a Senior Supervisor will appear here.'
                                  : 'No clients are available for your account.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((client, idx) => (
                    <tr key={client.id} className="cm-table-row">
                      <td className="cm-td cm-td-index">{idx + 1}</td>

                      {/* Client */}
                      <td className="cm-td">
                        <div className="cm-client-name-cell">
                          <span className="cm-client-avatar" aria-hidden="true">
                            <Building2 className="cm-client-avatar-icon" />
                          </span>
                          <div>
                            <p className="cm-client-name">{client.name}</p>
                            <p className="cm-client-type">{TYPE_LABEL[client.businessType] ?? client.businessType}</p>
                          </div>
                        </div>
                      </td>

                      {/* Client Type */}
                      <td className="cm-td">
                        <span className="cm-type-badge">
                          {TYPE_LABEL[client.businessType] ?? client.businessType}
                        </span>
                      </td>

                      {/* Active Files */}
                      <td className="cm-td cm-td-num">{(client.activeCases || 0).toLocaleString()}</td>

                      {/* Active Value */}
                      <td className="cm-td cm-td-num cm-money">
                        {formatMoney(client.activeValue)}
                      </td>

                      {/* Closed Files */}
                      <td className="cm-td cm-td-num">{(client.closedFiles || 0).toLocaleString()}</td>

                      {/* Closed Value */}
                      <td className="cm-td cm-td-num cm-money">
                        {formatMoney(client.closedValue)}
                      </td>

                      {/* Collected */}
                      <td className="cm-td cm-td-num cm-money cm-money--positive">
                        {formatMoney(client.collected)}
                      </td>

                      {/* Balance */}
                      <td className="cm-td cm-td-num cm-money cm-money--balance">
                        <span className="cm-money-with-icon">
                          <Wallet className="cm-money-icon" />
                          {formatMoney(client.balance)}
                        </span>
                      </td>

                      {/* View Contact Information */}
                      <td className="cm-td cm-td-contact-btn">
                        <button
                          type="button"
                          className="cm-contact-btn"
                          onClick={() => setContactClient(client)}
                        >
                          <Eye className="cm-contact-btn-icon" />
                          <span>View</span>
                        </button>
                      </td>

                      {/* Actions — Senior Supervisor / Admin only */}
                      {canManageClients && (
                        <td className="cm-td cm-td-actions">
                          <div className="cm-action-group">
                            {canUpdateClient && (
                              <button
                                type="button"
                                className="cm-action-btn cm-action-btn-primary"
                                aria-label="Edit client"
                                title="Edit profile"
                                onClick={() => openEditModal(client)}
                              >
                                <Pencil className="cm-action-icon" />
                              </button>
                            )}
                            {canDeleteClient && (
                              <button
                                type="button"
                                className="cm-action-btn cm-action-btn-danger"
                                aria-label="Delete client"
                                title="Delete client"
                                onClick={() => handleDelete(client)}
                              >
                                <Trash2 className="cm-action-icon" />
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="cm-table-footer">
              Showing <strong>{filtered.length}</strong> of <strong>{clients.length}</strong> clients
            </p>
          )}
        </div>
      </div>

      <ClientFormModal
        open={modalOpen}
        onClose={closeModal}
        form={form}
        setForm={setForm}
        isSaving={isSaving}
        onSave={handleSave}
        isEditing={Boolean(editingClient)}
      />

      <ClientContactModal
        client={contactClient}
        onClose={() => setContactClient(null)}
      />

      <ClientBulkUploadModal
        open={bulkUploadOpen}
        onClose={() => setBulkUploadOpen(false)}
        onCompleted={handleBulkUploadCompleted}
      />
    </>
  );
}

export default ClientManagementPage;
