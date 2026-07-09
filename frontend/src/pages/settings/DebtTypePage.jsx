import { useCallback, useEffect, useState } from 'react';
import { Tags, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import DebtTypeFormModal, { EMPTY_DEBT_TYPE_FORM } from '../../components/DebtTypeFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchDebtTypes,
  createDebtType,
  updateDebtType,
  deleteDebtType,
} from '../../api/debtTypes';

function TypeRow({ type, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <Tags className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{type.name}</p>
            {type.code && <p className="cm-client-type"><code className="dm-cfid-badge dm-cfid-badge--sm">{type.code}</code></p>}
          </div>
        </div>
      </td>
      <td className="cm-td cm-td-desc">{type.description || '—'}</td>
      <td className="cm-td">
        <span className={`status-pill ${type.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {type.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(type)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(type)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DebtTypePage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DEBT_TYPE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [types, setTypes] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDebtTypes();
      setTypes(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load debt types');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_DEBT_TYPE_FORM);
    setModalOpen(true);
  };

  const openEdit = (type) => {
    setEditing(type);
    setForm({
      name: type.name,
      code: type.code || '',
      description: type.description || '',
      isActive: type.isActive,
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
      toast.error('Name is required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        name: form.name.trim(),
        code: form.code.trim() || null,
        description: form.description.trim() || null,
        isActive: form.isActive,
      };
      if (editing) {
        const updated = await updateDebtType(editing.id, payload);
        setTypes((prev) => prev.map((t) => (t.id === updated.id ? updated : t)));
        toast.success(`Debt type "${updated.name}" updated`);
      } else {
        const created = await createDebtType(payload);
        setTypes((prev) => [created, ...prev]);
        toast.success(`Debt type "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_DEBT_TYPE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save debt type');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (type) => {
    await confirm({
      title: 'Delete debt type',
      message: `Delete debt type "${type.name}"?`,
      detail: 'Debtors previously tagged with this type will keep their value until reassigned.',
      confirmText: 'Delete Type',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteDebtType(type.id);
          setTypes((prev) => prev.filter((t) => t.id !== type.id));
          toast.success(`Debt type "${type.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete debt type');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? types.filter((t) => {
        const q = search.toLowerCase();
        return (
          t.name.toLowerCase().includes(q) ||
          (t.code || '').toLowerCase().includes(q) ||
          (t.description || '').toLowerCase().includes(q)
        );
      })
    : types;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Type
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Tags} title="Debt Types" count={filtered.length} />

          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by name, code or description…"
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
                  <th className="cm-th">Debt Type</th>
                  <th className="cm-th">Description</th>
                  <th className="cm-th">Status</th>
                  <th className="cm-th cm-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={5}>
                      <div className="cm-empty-state">
                        <Tags className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading debt types…' : 'No debt types found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching debt types from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Type" to create your first debt type.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((type, idx) => (
                    <TypeRow
                      key={type.id}
                      type={type}
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
              Showing <strong>{filtered.length}</strong> of <strong>{types.length}</strong> debt types
            </p>
          )}
        </div>
      </div>

      <DebtTypeFormModal
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

export default DebtTypePage;
