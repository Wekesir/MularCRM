import { useCallback, useEffect, useState } from 'react';
import { Layers, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import DebtCategoryFormModal, { EMPTY_DEBT_CATEGORY_FORM } from '../../components/DebtCategoryFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchDebtCategories,
  createDebtCategory,
  updateDebtCategory,
  deleteDebtCategory,
} from '../../api/debtCategories';

function CategoryRow({ category, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <Layers className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{category.name}</p>
            {category.code && <p className="cm-client-type"><code className="dm-cfid-badge dm-cfid-badge--sm">{category.code}</code></p>}
          </div>
        </div>
      </td>
      <td className="cm-td cm-td-desc">{category.description || '—'}</td>
      <td className="cm-td">
        <span className={`status-pill ${category.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {category.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(category)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(category)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function DebtCategoryPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_DEBT_CATEGORY_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchDebtCategories();
      setCategories(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load debt categories');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_DEBT_CATEGORY_FORM);
    setModalOpen(true);
  };

  const openEdit = (category) => {
    setEditing(category);
    setForm({
      name: category.name,
      code: category.code || '',
      description: category.description || '',
      isActive: category.isActive,
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
        const updated = await updateDebtCategory(editing.id, payload);
        setCategories((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(`Category "${updated.name}" updated`);
      } else {
        const created = await createDebtCategory(payload);
        setCategories((prev) => [created, ...prev]);
        toast.success(`Category "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_DEBT_CATEGORY_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save debt category');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (category) => {
    await confirm({
      title: 'Delete debt category',
      message: `Delete category "${category.name}"?`,
      detail: 'Debtors previously tagged with this category will keep their value until reassigned.',
      confirmText: 'Delete Category',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteDebtCategory(category.id);
          setCategories((prev) => prev.filter((c) => c.id !== category.id));
          toast.success(`Category "${category.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete debt category');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? categories.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
        );
      })
    : categories;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Category
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Layers} title="Debt Categories" count={filtered.length} />

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
                  <th className="cm-th">Category</th>
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
                        <Layers className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading categories…' : 'No debt categories found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching debt categories from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Category" to create your first debt category.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((category, idx) => (
                    <CategoryRow
                      key={category.id}
                      category={category}
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
              Showing <strong>{filtered.length}</strong> of <strong>{categories.length}</strong> categories
            </p>
          )}
        </div>
      </div>

      <DebtCategoryFormModal
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

export default DebtCategoryPage;
