import { useCallback, useEffect, useState } from 'react';
import { Briefcase, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import AgentExpertiseAreaFormModal, { EMPTY_AGENT_EXPERTISE_FORM } from '../../components/AgentExpertiseAreaFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchAgentExpertiseAreas,
  createAgentExpertiseArea,
  updateAgentExpertiseArea,
  deleteAgentExpertiseArea,
} from '../../api/agentExpertiseAreas';

function AreaRow({ area, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <Briefcase className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{area.name}</p>
            {area.code && <p className="cm-client-type"><code className="dm-cfid-badge dm-cfid-badge--sm">{area.code}</code></p>}
          </div>
        </div>
      </td>
      <td className="cm-td cm-td-desc">{area.description || '—'}</td>
      <td className="cm-td">
        <span className={`status-pill ${area.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {area.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(area)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(area)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AgentExpertisePage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_AGENT_EXPERTISE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [areas, setAreas] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAgentExpertiseAreas();
      setAreas(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load expertise areas');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_AGENT_EXPERTISE_FORM);
    setModalOpen(true);
  };

  const openEdit = (area) => {
    setEditing(area);
    setForm({
      name: area.name,
      code: area.code || '',
      description: area.description || '',
      isActive: area.isActive,
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
        const updated = await updateAgentExpertiseArea(editing.id, payload);
        setAreas((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(`Expertise area "${updated.name}" updated`);
      } else {
        const created = await createAgentExpertiseArea(payload);
        setAreas((prev) => [created, ...prev]);
        toast.success(`Expertise area "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_AGENT_EXPERTISE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save expertise area');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (area) => {
    await confirm({
      title: 'Delete expertise area',
      message: `Delete expertise area "${area.name}"?`,
      detail: 'Agents tagged with this area will keep their value until reassigned.',
      confirmText: 'Delete Area',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteAgentExpertiseArea(area.id);
          setAreas((prev) => prev.filter((c) => c.id !== area.id));
          toast.success(`Expertise area "${area.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete expertise area');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? areas.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
        );
      })
    : areas;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Area
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={Briefcase} title="Agent Expertise Areas" count={filtered.length} />

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
                  <th className="cm-th">Expertise Area</th>
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
                        <Briefcase className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading expertise areas…' : 'No expertise areas found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching expertise areas from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Area" to create your first expertise area.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((area, idx) => (
                    <AreaRow
                      key={area.id}
                      area={area}
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
              Showing <strong>{filtered.length}</strong> of <strong>{areas.length}</strong> areas
            </p>
          )}
        </div>
      </div>

      <AgentExpertiseAreaFormModal
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

export default AgentExpertisePage;
