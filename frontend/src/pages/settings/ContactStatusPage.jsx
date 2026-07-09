import { useCallback, useEffect, useState } from 'react';
import { CircleCheck, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import ContactStatusFormModal, { EMPTY_CONTACT_STATUS_FORM } from '../../components/ContactStatusFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchContactStatuses,
  createContactStatus,
  updateContactStatus,
  deleteContactStatus,
} from '../../api/contactStatuses';

function StatusRow({ status, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <CircleCheck className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{status.name}</p>
            {status.code && <p className="cm-client-type"><code className="dm-cfid-badge dm-cfid-badge--sm">{status.code}</code></p>}
          </div>
        </div>
      </td>
      <td className="cm-td">
        {status.code ? <code className="dm-cfid-badge dm-cfid-badge--sm">{status.code}</code> : <span className="dm-muted">—</span>}
      </td>
      <td className="cm-td cm-td-desc">{status.description || '—'}</td>
      <td className="cm-td cm-td-num">{status.maxNaDays}</td>
      <td className="cm-td cm-td-num">{status.dialingPriority}</td>
      <td className="cm-td">
        <span className={`status-pill ${status.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {status.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(status)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(status)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function ContactStatusPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_CONTACT_STATUS_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [statuses, setStatuses] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchContactStatuses();
      setStatuses(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load contact statuses');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_CONTACT_STATUS_FORM);
    setModalOpen(true);
  };

  const openEdit = (status) => {
    setEditing(status);
    setForm({
      name: status.name,
      code: status.code || '',
      description: status.description || '',
      maxNaDays: String(status.maxNaDays ?? ''),
      dialingPriority: String(status.dialingPriority ?? ''),
      isActive: status.isActive,
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('Title is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        maxNaDays: form.maxNaDays === '' ? 0 : Number(form.maxNaDays) || 0,
        dialingPriority: form.dialingPriority === '' ? 0 : Number(form.dialingPriority) || 0,
        isActive: form.isActive,
      };
      if (editing) {
        const updated = await updateContactStatus(editing.id, payload);
        setStatuses((prev) => prev.map((s) => (s.id === updated.id ? updated : s)));
        toast.success(`Status "${updated.name}" updated`);
      } else {
        const created = await createContactStatus(payload);
        setStatuses((prev) => [created, ...prev]);
        toast.success(`Status "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_CONTACT_STATUS_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save contact status');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (status) => {
    await confirm({
      title: 'Delete contact status',
      message: `Delete status "${status.name}"?`,
      detail: 'Debtors currently tagged with this status will have their contact status cleared.',
      confirmText: 'Delete Status',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteContactStatus(status.id);
          setStatuses((prev) => prev.filter((s) => s.id !== status.id));
          toast.success(`Status "${status.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete contact status');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? statuses.filter((s) => {
        const q = search.toLowerCase();
        return (
          s.name.toLowerCase().includes(q) ||
          (s.code || '').toLowerCase().includes(q) ||
          (s.description || '').toLowerCase().includes(q)
        );
      })
    : statuses;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Contact Status
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={CircleCheck} title="Contact Statuses" count={filtered.length} />

          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by title, abbreviation or description…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>
          </div>

          <div className="cm-table-wrap">
            <table className="cm-table">
              <thead>
                <tr>
                  <th className="cm-th cm-th-index">#</th>
                  <th className="cm-th">Title</th>
                  <th className="cm-th">Abbreviation</th>
                  <th className="cm-th">Description</th>
                  <th className="cm-th cm-th-num">Max NA Days</th>
                  <th className="cm-th cm-th-num">Dialing Priority</th>
                  <th className="cm-th">Status</th>
                  <th className="cm-th cm-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={8}>
                      <div className="cm-empty-state">
                        <CircleCheck className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading contact statuses…' : 'No contact statuses found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching contact statuses from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Contact Status" to create your first status.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((status, idx) => (
                    <StatusRow
                      key={status.id}
                      status={status}
                      index={idx}
                      onEdit={openEdit}
                      onDelete={handleDelete}
                    />
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > 0 && (
            <p className="cm-table-footer">
              Showing <strong>{filtered.length}</strong> of <strong>{statuses.length}</strong> statuses
            </p>
          )}
        </div>
      </div>

      <ContactStatusFormModal
        open={modalOpen}
        onClose={closeModal}
        form={form}
        setForm={setForm}
        isSaving={isSaving}
        onSave={handleSave}
        isEditing={Boolean(editing)}
      />
    </>
  );
}

export default ContactStatusPage;
