import { useCallback, useEffect, useState } from 'react';
import { GraduationCap, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import AgentExperienceLevelFormModal, { EMPTY_AGENT_EXPERIENCE_FORM } from '../../components/AgentExperienceLevelFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchAgentExperienceLevels,
  createAgentExperienceLevel,
  updateAgentExperienceLevel,
  deleteAgentExperienceLevel,
} from '../../api/agentExperienceLevels';

function LevelRow({ level, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <GraduationCap className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{level.name}</p>
            {level.code && <p className="cm-client-type"><code className="dm-cfid-badge dm-cfid-badge--sm">{level.code}</code></p>}
          </div>
        </div>
      </td>
      <td className="cm-td cm-td-desc">{level.description || '—'}</td>
      <td className="cm-td">
        <span className={`status-pill ${level.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {level.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(level)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(level)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function AgentExperiencePage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_AGENT_EXPERIENCE_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [levels, setLevels] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchAgentExperienceLevels();
      setLevels(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load experience levels');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_AGENT_EXPERIENCE_FORM);
    setModalOpen(true);
  };

  const openEdit = (level) => {
    setEditing(level);
    setForm({
      name: level.name,
      code: level.code || '',
      description: level.description || '',
      isActive: level.isActive,
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
        const updated = await updateAgentExperienceLevel(editing.id, payload);
        setLevels((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
        toast.success(`Experience level "${updated.name}" updated`);
      } else {
        const created = await createAgentExperienceLevel(payload);
        setLevels((prev) => [created, ...prev]);
        toast.success(`Experience level "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_AGENT_EXPERIENCE_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save experience level');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (level) => {
    await confirm({
      title: 'Delete experience level',
      message: `Delete experience level "${level.name}"?`,
      detail: 'Agents tagged with this level will keep their value until reassigned.',
      confirmText: 'Delete Level',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteAgentExperienceLevel(level.id);
          setLevels((prev) => prev.filter((c) => c.id !== level.id));
          toast.success(`Experience level "${level.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete experience level');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? levels.filter((c) => {
        const q = search.toLowerCase();
        return (
          c.name.toLowerCase().includes(q) ||
          (c.code || '').toLowerCase().includes(q) ||
          (c.description || '').toLowerCase().includes(q)
        );
      })
    : levels;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Level
        </button>
      </>,
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={GraduationCap} title="Agent Experience Levels" count={filtered.length} />

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
                  <th className="cm-th">Experience Level</th>
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
                        <GraduationCap className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading experience levels…' : 'No experience levels found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching experience levels from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Level" to create your first experience level.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((level, idx) => (
                    <LevelRow
                      key={level.id}
                      level={level}
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
              Showing <strong>{filtered.length}</strong> of <strong>{levels.length}</strong> levels
            </p>
          )}
        </div>
      </div>

      <AgentExperienceLevelFormModal
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

export default AgentExperiencePage;
