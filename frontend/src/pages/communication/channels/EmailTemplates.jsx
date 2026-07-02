import { useCallback, useEffect, useMemo, useState } from 'react';
import { Mail, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../../components/SectionHeader';
import TemplateFormModal, { EMPTY_TEMPLATE_FORM } from '../../../components/TemplateFormModal';
import { useConfirm } from '../../../context/ConfirmContext';
import { fetchClients } from '../../../api/clients';
import { fetchTemplateVariables } from '../../../api/templateVariables';
import {
  fetchEmailTemplates,
  createEmailTemplate,
  updateEmailTemplate,
  deleteEmailTemplate,
  createSmsTemplate,
} from '../../../api/templates';

function EmailTemplates() {
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
        fetchEmailTemplates(),
        fetchClients(),
        fetchTemplateVariables(),
      ]);
      setTemplates(tpls);
      setClients(cls);
      setVariables(vars);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load email templates');
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
        // A specific client: show that client's templates plus system-wide ones.
        if (t.clientId !== null && t.clientId !== undefined && String(t.clientId) !== String(clientFilter)) return false;
      }
      if (q && !t.name.toLowerCase().includes(q) && !t.subject.toLowerCase().includes(q)) return false;
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
      subject: template.subject,
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
    if (!form.name.trim() || !form.subject.trim() || !form.body.trim()) {
      toast.error('Name, subject and body are all required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        clientId: form.clientId ? Number(form.clientId) : null,
        subject: form.subject.trim(),
        body: form.body,
      };
      if (editing) {
        const updated = await updateEmailTemplate(editing.id, payload);
        setTemplates((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`Template "${updated.name}" updated`);
      } else {
        const created = await createEmailTemplate(payload);
        setTemplates((prev) => [created, ...prev]);
        toast.success(`Email template "${created.name}" added`);

        if (form.alsoCreateCounterpart) {
          try {
            const smsCreated = await createSmsTemplate({
              name: payload.name,
              clientId: payload.clientId,
              body: payload.body,
            });
            toast.success(`SMS template "${smsCreated.name}" also added`);
          } catch (counterErr) {
            toast.error(
              counterErr.response?.data?.message || 'Email saved, but the SMS copy failed.',
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
      title: 'Delete email template',
      message: `Delete "${template.name}"?`,
      detail: 'This template will no longer be available for outbound email. This action cannot be undone.',
      confirmText: 'Delete Template',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteEmailTemplate(template.id);
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
          <span className="cc-section-icon"><Mail className="cc-section-icon-svg" /></span>
          <div>
            <h2 className="cc-section-title">Email Templates</h2>
            <p className="cc-section-subtitle">Per-client email templates for statements, reminders and confirmations.</p>
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
              placeholder="Search by name or subject…"
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
                <th className="cm-th">Subject</th>
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
                      <Mail className="cm-empty-icon" aria-hidden="true" />
                      <p className="cm-empty-title">
                        {isLoading ? 'Loading templates…' : 'No email templates found'}
                      </p>
                      <p className="cm-empty-desc">
                        {isLoading
                          ? 'Fetching email templates from the system database.'
                          : search || clientFilter
                            ? 'Try adjusting your search or client filter.'
                            : 'Click "New Template" to create your first email template.'}
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
                          <Mail className="cm-client-avatar-icon" />
                        </span>
                        <p className="cm-client-name">{t.name}</p>
                      </div>
                    </td>
                    <td className="cm-td">
                      {t.clientId === null || t.clientId === undefined ? (
                        <span className="tv-system-badge">All Clients</span>
                      ) : (
                        <span className="tv-client">{clientName(t.clientId)}</span>
                      )}
                    </td>
                    <td className="cm-td cm-td-subject">{t.subject}</td>
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
        mode="email"
        clients={clients}
        variables={variables}
      />
    </div>
  );
}

export default EmailTemplates;
