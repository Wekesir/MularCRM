import { useCallback, useEffect, useState } from 'react';
import { Braces, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import TemplateVariableFormModal, { EMPTY_VARIABLE_FORM } from '../../components/TemplateVariableFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchTemplateVariables,
  createTemplateVariable,
  updateTemplateVariable,
  deleteTemplateVariable,
} from '../../api/templateVariables';

function VariableRow({ variable, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <Braces className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">
              <code className="tv-key">{'{{'}{variable.key}{'}}'}</code>
            </p>
            <p className="cm-client-type">{variable.label}</p>
          </div>
        </div>
      </td>
      <td className="cm-td">
        <span className="tv-category">{variable.category || '—'}</span>
      </td>
      <td className="cm-td">
        <span className="tv-example">{variable.exampleValue || '—'}</span>
      </td>
      <td className="cm-td cm-td-desc">{variable.description || '—'}</td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button
            type="button"
            className="cm-action-btn"
            aria-label="Edit variable"
            title="Edit"
            onClick={() => onEdit(variable)}
          >
            <Pencil className="cm-action-icon" />
          </button>
          <button
            type="button"
            className="cm-action-btn cm-action-btn-danger"
            aria-label="Delete variable"
            title="Delete"
            onClick={() => onDelete(variable)}
          >
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function TemplateVariablesPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_VARIABLE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [variables, setVariables] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchTemplateVariables();
      setVariables(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load template variables');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_VARIABLE_FORM);
    setModalOpen(true);
  };

  const openEdit = (variable) => {
    setEditing(variable);
    setForm({
      key: variable.key,
      label: variable.label,
      description: variable.description || '',
      exampleValue: variable.exampleValue || '',
      category: variable.category || '',
    });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSaving) return;
    setModalOpen(false);
    setEditing(null);
  };

  const handleSave = async () => {
    if (!form.key.trim() || !form.label.trim()) {
      toast.error('Key and Label are required');
      return;
    }
    setIsSaving(true);
    try {
      const payload = {
        key: form.key.trim(),
        label: form.label.trim(),
        description: form.description.trim() || null,
        exampleValue: form.exampleValue.trim() || null,
        category: form.category.trim() || null,
      };
      if (editing) {
        const updated = await updateTemplateVariable(editing.id, payload);
        setVariables((prev) => prev.map((v) => (v.id === updated.id ? updated : v)));
        toast.success(`Variable "${updated.key}" updated`);
      } else {
        const created = await createTemplateVariable(payload);
        setVariables((prev) => [created, ...prev]);
        toast.success(`Variable "${created.key}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_VARIABLE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save variable');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (variable) => {
    await confirm({
      title: 'Delete template variable',
      message: `Delete variable "{{${variable.key}}}"?`,
      detail: 'Templates that use this variable will display the raw {{token}} until it is removed or re-added.',
      confirmText: 'Delete Variable',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteTemplateVariable(variable.id);
          setVariables((prev) => prev.filter((v) => v.id !== variable.id));
          toast.success(`Variable "${variable.key}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete variable');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? variables.filter((v) => {
        const q = search.toLowerCase();
        return (
          v.key.toLowerCase().includes(q) ||
          v.label.toLowerCase().includes(q) ||
          (v.category || '').toLowerCase().includes(q)
        );
      })
    : variables;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Variable
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Braces} title="Template Variables" count={filtered.length} />

          <div className="cm-toolbar">
            <div className="cm-search-wrap">
              <Search className="cm-search-icon" aria-hidden="true" />
              <input
                type="search"
                className="cm-search-input"
                placeholder="Search by key, label or category…"
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
                  <th className="cm-th">Variable</th>
                  <th className="cm-th">Category</th>
                  <th className="cm-th">Example Value</th>
                  <th className="cm-th">Description</th>
                  <th className="cm-th cm-th-actions">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr>
                    <td className="cm-td cm-td-empty" colSpan={6}>
                      <div className="cm-empty-state">
                        <Braces className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading variables…' : 'No variables found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching template variables from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Variable" to create your first placeholder.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((variable, idx) => (
                    <VariableRow
                      key={variable.id}
                      variable={variable}
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
              Showing <strong>{filtered.length}</strong> of <strong>{variables.length}</strong> variables
            </p>
          )}
        </div>
      </div>

      <TemplateVariableFormModal
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

export default TemplateVariablesPage;
