import { useCallback, useEffect, useState } from 'react';
import { MapPin, Plus, RefreshCw, Pencil, Trash2, Search } from 'lucide-react';
import { toast } from 'react-toastify';
import SectionHeader from '../../components/SectionHeader';
import RegionFormModal, { EMPTY_REGION_FORM } from '../../components/RegionFormModal';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import {
  fetchRegions,
  createRegion,
  updateRegion,
  deleteRegion,
} from '../../api/regions';

function RegionRow({ region, index, onEdit, onDelete }) {
  return (
    <tr className="cm-table-row">
      <td className="cm-td cm-td-index">{index + 1}</td>
      <td className="cm-td">
        <div className="cm-client-name-cell">
          <span className="cm-client-avatar" aria-hidden="true">
            <MapPin className="cm-client-avatar-icon" />
          </span>
          <div>
            <p className="cm-client-name">{region.name}</p>
            {region.code && (
              <p className="cm-client-type">
                <code className="dm-cfid-badge dm-cfid-badge--sm">{region.code}</code>
              </p>
            )}
          </div>
        </div>
      </td>
      <td className="cm-td cm-td-desc">{region.description || '—'}</td>
      <td className="cm-td">
        <span className={`status-pill ${region.isActive ? 'status-pill--active' : 'status-pill--inactive'}`}>
          {region.isActive ? 'Active' : 'Inactive'}
        </span>
      </td>
      <td className="cm-td cm-td-actions">
        <div className="cm-action-group">
          <button type="button" className="cm-action-btn" aria-label="Edit" title="Edit" onClick={() => onEdit(region)}>
            <Pencil className="cm-action-icon" />
          </button>
          <button type="button" className="cm-action-btn cm-action-btn-danger" aria-label="Delete" title="Delete" onClick={() => onDelete(region)}>
            <Trash2 className="cm-action-icon" />
          </button>
        </div>
      </td>
    </tr>
  );
}

function RegionsPage() {
  const { setActions } = usePageActions();
  const { confirm } = useConfirm();
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(EMPTY_REGION_FORM);
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [regions, setRegions] = useState([]);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await fetchRegions();
      setRegions(data);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to load regions');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openAdd = () => {
    setEditing(null);
    setForm(EMPTY_REGION_FORM);
    setModalOpen(true);
  };

  const openEdit = (region) => {
    setEditing(region);
    setForm({
      name: region.name,
      code: region.code || '',
      description: region.description || '',
      isActive: region.isActive,
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
        const updated = await updateRegion(editing.id, payload);
        setRegions((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        toast.success(`Region "${updated.name}" updated`);
      } else {
        const created = await createRegion(payload);
        setRegions((prev) => [created, ...prev].sort((a, b) => a.name.localeCompare(b.name)));
        toast.success(`Region "${created.name}" added`);
      }
      setModalOpen(false);
      setForm(EMPTY_REGION_FORM);
      setEditing(null);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save region');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (region) => {
    await confirm({
      title: 'Delete region',
      message: `Delete region "${region.name}"?`,
      detail: 'Call centers assigned to this region must be reassigned first.',
      confirmText: 'Delete Region',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        try {
          await deleteRegion(region.id);
          setRegions((prev) => prev.filter((r) => r.id !== region.id));
          toast.success(`Region "${region.name}" removed`);
        } catch (err) {
          toast.error(err.response?.data?.message || 'Failed to delete region');
          throw err;
        }
      },
    });
  };

  const filtered = search
    ? regions.filter((r) => {
        const q = search.toLowerCase();
        return (
          r.name.toLowerCase().includes(q) ||
          (r.code || '').toLowerCase().includes(q) ||
          (r.description || '').toLowerCase().includes(q)
        );
      })
    : regions;

  useEffect(() => {
    setActions(
      <>
        <button type="button" className="btn-icon-outline" aria-label="Refresh" onClick={load}>
          <RefreshCw className="icon-sm" />
        </button>
        <button type="button" className="btn-primary btn-sm" onClick={openAdd}>
          <Plus className="icon-sm" />
          Add Region
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, load]);

  return (
    <>
      <div className="cm-page">
        <div className="cm-table-card">
          <SectionHeader icon={MapPin} title="Regions" count={filtered.length} />

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
                  <th className="cm-th">Region</th>
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
                        <MapPin className="cm-empty-icon" aria-hidden="true" />
                        <p className="cm-empty-title">
                          {isLoading ? 'Loading regions…' : 'No regions found'}
                        </p>
                        <p className="cm-empty-desc">
                          {isLoading
                            ? 'Fetching regions from the system database.'
                            : search
                              ? 'Try a different search.'
                              : 'Click "Add Region" to create your first region.'}
                        </p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((region, idx) => (
                    <RegionRow
                      key={region.id}
                      region={region}
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
              Showing <strong>{filtered.length}</strong> of <strong>{regions.length}</strong> regions
            </p>
          )}
        </div>
      </div>

      <RegionFormModal
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

export default RegionsPage;
