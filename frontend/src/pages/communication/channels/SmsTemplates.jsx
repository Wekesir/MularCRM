import { useCallback, useEffect, useMemo, useState } from 'react';
import { MessageSquare, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import TemplateFormModal, { EMPTY_TEMPLATE_FORM } from '../../../components/TemplateFormModal';
import { useConfirm } from '../../../context/ConfirmContext';
import { fetchClients } from '../../../api/clients';
import { fetchTemplateVariables } from '../../../api/templateVariables';
import {
  fetchSmsTemplates,
  createSmsTemplate,
  updateSmsTemplate,
  deleteSmsTemplate,
  createEmailTemplate,
} from '../../../api/templates';

function SmsTemplates() {
  const { confirm } = useConfirm();
  const [templates, setTemplates] = useState([]);
  const [clients, setClients] = useState([]);
  const [variables, setVariables] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_TEMPLATE_FORM);
  const [clientFilter, setClientFilter] = useState('');
  const [search, setSearch] = useState('');

  const clientName = useCallback(
    (id) => clients.find((c) => String(c.id) === String(id))?.name || '—',
    [clients]
  );

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const [tpls, cls, vars] = await Promise.all([
        fetchSmsTemplates(),
        fetchClients(),
        fetchTemplateVariables(),
      ]);
      setTemplates(tpls);
      setClients(cls);
      setVariables(vars);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load SMS templates');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return templates.filter((t) => {
      if (clientFilter === '__system__') {
        if (t.clientId !== null && t.clientId !== undefined) return false;
      } else if (clientFilter) {
        if (t.clientId !== null && t.clientId !== undefined && String(t.clientId) !== String(clientFilter)) return false;
      }
      if (q && !t.name.toLowerCase().includes(q) && !t.body.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [templates, clientFilter, search]);

  const openAdd = () => {
    setEditing(null);
    const initialClientId =
      clientFilter === '__system__' ? '' : (clientFilter || '');
    setForm({ ...EMPTY_TEMPLATE_FORM, clientId: initialClientId });
    setModalOpen(true);
  };

  const openEdit = (template) => {
    setEditing(template);
    setForm({
      name: template.name,
      clientId: template.clientId === null || template.clientId === undefined ? '' : String(template.clientId),
      subject: '',
      body: template.body,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim() || !form.body.trim()) {
      toast.error('Name and message body are required');
      return;
    }
    if (!editing && form.alsoCreateCounterpart && !form.counterpartSubject.trim()) {
      toast.error('Email subject is required when creating an email copy');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        clientId: form.clientId ? Number(form.clientId) : null,
        body: form.body,
      };
      if (editing) {
        const updated = await updateSmsTemplate(editing.id, payload);
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`Template "${updated.name}" updated`);
      } else {
        const created = await createSmsTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
        toast.success(`SMS template "${created.name}" added`);

        if (form.alsoCreateCounterpart) {
          try {
            const emailCreated = await createEmailTemplate({
              name: payload.name,
              clientId: payload.clientId,
              subject: form.counterpartSubject.trim(),
              body: payload.body,
            });
            toast.success(`Email template "${emailCreated.name}" also added`);
          } catch (counterErr) {
            toast.error(
              counterErr.response?.data?.message || 'SMS saved, but the email copy failed.',
            );
          }
        }
      }
      setModalOpen(false);
      setForm(EMPTY_TEMPLATE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save template');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (template) => {
    await confirm({
      title: 'Delete SMS template',
      message: `Delete "${template.name}"?`,
      detail: 'This template will no longer be available for outbound SMS. This action cannot be undone.',
      confirmText: 'Delete Template',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteSmsTemplate(template.id);
          setTemplates((prev) => prev.filter((t) => t.id !== template.id));
          toast.success(`Template "${template.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete template');
          throw err;
        }
      },
    });
  };

  return (
    <div className="cc-section">
      <div className="cc-section-header">
        <div className="cc-section-header-left">
          <span className="cc-section-icon"><MessageSquare className="cc-section-icon-svg" /></span>
          <div>
            <h2 className="cc-section-title">SMS Templates</h2>
            <p className="cc-section-subtitle">Per-client SMS templates for reminders, PTPs and OTPs.</p>
          </div>
        </div>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load} title="Refresh">
          <RefreshCw className="icon-sm" />
        </button>
      </div>

      <div className="cm-table-card">
        <div className="cm-toolbar">
          <div className="cm-search-wrap">
            <Search className="cm-search-icon" aria-hidden="true" />
            <input
              type="search"
              className="cm-search-input"
              placeholder="Search by name or message…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <div className="cm-filters">
            <select
              className="cm-filter-select"
              value={clientFilter}
              onChange={(e) => setClientFilter(e.target.value)}
              aria-label="Filter by client"
            >
              <option value="">All Clients</option>
              <option value="__system__">System-wide (All Clients)</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
              <Plus className="icon-sm" />
              New Template
            </button>
          </div>
        </div>

        <div className="cm-table-wrap">
          <table className="cm-table">
            <thead>
              <tr>
                <th className="cm-th cm-th-index">#</th>
                <th className="cm-th">Template</th>
                <th className="cm-th">Client</th>
                <th className="cm-th">Message</th>
                <th className="cm-th">Placeholders</th>
                <th className="cm-th cm-th-date">Updated</th>
                <th className="cm-th cm-th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 ? (
                <tr>
                  <td className="cm-td cm-td-empty" colSpan={7}>
                    <div className="cm-empty-state">
                      <MessageSquare className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">
                        {isLoading ? 'Loading templates…' : 'No SMS templates found'}
                      </p>
                      <p className="cm-empty-desc">
                        {isLoading
                          ? 'Fetching SMS templates from the system database.'
                          : search || clientFilter
                            ? 'Try adjusting your search or client filter.'
                            : 'Click "New Template" to create your first SMS template.'}
                      </p>
                    </div>
                  </td>
                </tr>
              ) : (
                filtered.map((t, idx) => (
                  <tr className="cm-table-row" key={t.id}>
                    <td className="cm-td cm-td-index">{idx + 1}</td>
                    <td className="cm-td">
                      <div className="cm-client-name-cell">
                        <span className="cm-client-avatar" aria-hidden="true">
                          <MessageSquare className="cm-client-avatar-icon" />
                        </span>
                        <div>
                          <p className="cm-client-name">{t.name}</p>
                          <p className="cm-client-type">{(t.body || '').length} chars</p>
                        </div>
                      </div>
                    </td>
                    <td className="cm-td">
                      {t.clientId === null || t.clientId === undefined ? (
                        <span className="tv-system-badge">All Clients</span>
                      ) : (
                        <span className="tv-client">{clientName(t.clientId)}</span>
                      )}
                    </td>
                    <td className="cm-td cm-td-body">{t.body}</td>
                    <td className="cm-td">
                      <div className="tvar-inline-chips">
                        {(t.placeholders || []).map((p) => (
                          <span key={p} className="tvar-inline-chip">{`{{${p}}}`}</span>
                        ))}
                        {(!t.placeholders || t.placeholders.length === 0) && <span className="tv-dash">—</span>}
                      </div>
                    </td>
                    <td className="cm-td cm-td-date">{t.updatedAt}</td>
                    <td className="cm-td cm-td-actions">
                      <div className="cm-action-group">
                        <button
                          type="button"
                          className="cm-action-btn"
                          aria-label="Edit template"
                          title="Edit"
                          onClick={() => openEdit(t)}
                        >
                          <Pencil className="cm-action-icon" />
                        </button>
                        <button
                          type="button"
                          className="cm-action-btn cm-action-btn-danger"
                          aria-label="Delete template"
                          title="Delete"
                          onClick={() => handleDelete(t)}
                        >
                          <Trash2 className="cm-action-icon" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        {filtered.length > 0 && (
          <p className="cm-table-footer">
            Showing <strong>{filtered.length}</strong> of <strong>{templates.length}</strong> templates
          </p>
        )}
      </div>

      <TemplateFormModal
        open={modalOpen}
        onClose={closeModal}
        form={form}
        setForm={setForm}
        isSaving={isSaving}
        onSave={handleSave}
        isEditing={Boolean(editing)}
        mode="sms"
        clients={clients}
        variables={variables}
      />
    </div>
  );
}

export default SmsTemplates;
