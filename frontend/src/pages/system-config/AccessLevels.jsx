import { useEffect, useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import { toast } from 'react-toastify';
import LazyDataTable from '../../components/LazyDataTable';
import RoleFormModal from '../../components/RoleFormModal';
import { createRole, deleteRole, fetchPermissionRegistry, fetchRoles, updateRole } from '../../api/accessControl';
import { useConfirm } from '../../context/ConfirmContext';

const emptyCrud = { create: false, read: false, update: false, delete: false };

function buildEmptyPermissions(registry) {
  const permissions = {};
  for (const mod of registry) {
    if (mod.submodules) {
      permissions[mod.key] = {};
      for (const sub of mod.submodules) {
        permissions[mod.key][sub.key] = { ...emptyCrud };
      }
    } else {
      permissions[mod.key] = { ...emptyCrud };
    }
  }
  return permissions;
}

function AccessLevels() {
  const { confirm } = useConfirm();
  const [registry, setRegistry] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedRoleId, setSelectedRoleId] = useState(null);
  const [roleForm, setRoleForm] = useState({ name: '', permissions: {} });
  const [modalOpen, setModalOpen] = useState(false);
  const [loadingAction, setLoadingAction] = useState(null);
  const [rolesRefreshKey, setRolesRefreshKey] = useState(0);

  const isBusy = Boolean(loadingAction);
  const isSavingRole = loadingAction === 'save-role';
  const isDeletingRole = loadingAction === 'delete-role';

  const loadData = async () => {
    const [registryData, rolesData] = await Promise.all([
      fetchPermissionRegistry(),
      fetchRoles(),
    ]);
    setRegistry(registryData);
    setRoles(rolesData);
    return { registryData, rolesData };
  };

  useEffect(() => {
    loadData().catch(() => toast.error('Failed to load access levels'));
  }, []);

  const refreshRolesTable = () => setRolesRefreshKey((k) => k + 1);

  const selectedRole = roles.find((r) => r.id === selectedRoleId);

  const openEditRole = (role) => {
    setSelectedRoleId(role.id);
    setRoleForm({ name: role.name, permissions: role.permissions });
    setModalOpen(true);
  };

  const openNewRole = () => {
    setSelectedRoleId(null);
    setRoleForm({ name: '', permissions: buildEmptyPermissions(registry) });
    setModalOpen(true);
  };

  const closeModal = () => {
    if (isSavingRole) return;
    setModalOpen(false);
  };

  const handleSaveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error('Role name is required');
      return;
    }

    setLoadingAction('save-role');
    try {
      const payload = selectedRole?.isSystemAdmin
        ? { name: roleForm.name }
        : roleForm;

      if (selectedRoleId) {
        const updated = await updateRole(selectedRoleId, payload);
        toast.success('Role updated');
        setRoles((prev) => prev.map((r) => (r.id === updated.id ? updated : r)));
        setSelectedRoleId(updated.id);
        setRoleForm({ name: updated.name, permissions: updated.permissions });
      } else {
        const created = await createRole(roleForm);
        toast.success('Role created');
        setRoles((prev) => [...prev, created]);
        setSelectedRoleId(created.id);
        setRoleForm({ name: created.name, permissions: created.permissions });
      }
      refreshRolesTable();
      setModalOpen(false);
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to save role');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDeleteRole = async (id) => {
    const role = roles.find((r) => r.id === id);
    await confirm({
      title: 'Delete role',
      message: role ? `Delete role "${role.name}"?` : 'Delete this role?',
      detail: 'Users assigned to this role will lose their access until reassigned. This cannot be undone.',
      confirmText: 'Delete Role',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        setLoadingAction('delete-role');
        try {
          await deleteRole(id);
          toast.success('Role deleted');
          setRoles((prev) => prev.filter((r) => r.id !== id));
          if (selectedRoleId === id) {
            setSelectedRoleId(null);
            setModalOpen(false);
          }
          refreshRolesTable();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to delete role');
          throw error;
        } finally {
          setLoadingAction(null);
        }
      },
    });
  };

  const handleRoleAction = (action, row) => {
    if (action === 'delete') handleDeleteRole(row.id);
    if (action === 'edit') openEditRole(row);
  };

  const roleColumns = useMemo(
    () => [
      {
        data: 'name',
        title: 'Role Name',
        render: (data, type, row) => {
          if (type !== 'display') return data;
          return row.isSystemAdmin ? `${data} <span class="badge">System Admin</span>` : data;
        },
      },
      {
        data: 'isSystemAdmin',
        title: 'Type',
        render: (data) => (data ? 'System Admin' : 'Custom'),
      },
      {
        data: null,
        title: 'Actions',
        orderable: false,
        searchable: false,
        render: (_data, _type, row) =>
          row.isSystemAdmin
            ? `<button type="button" class="btn-table btn-table-edit" data-action="edit">Edit</button>`
            : `<button type="button" class="btn-table btn-table-edit" data-action="edit">Edit</button>
               <button type="button" class="btn-table btn-table-danger" data-action="delete">Delete</button>`,
      },
    ],
    []
  );

  return (
    <div className="config-panel access-levels-panel">
      <div className="config-panel-header">
        <h2>Access Levels</h2>
      </div>

      <div className="access-layout">
        <div className={`access-table-section${isBusy ? ' access-table-section-busy' : ''}`}>
          <div className="access-table-toolbar">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={openNewRole}
              disabled={isBusy}
            >
              <Plus className="icon-sm" />
              New Role
            </button>
          </div>
          {isDeletingRole && (
            <p className="access-action-status" role="status">
              <span className="inline-spinner" aria-hidden="true" />
              Deleting role...
            </p>
          )}
          <LazyDataTable
            ajaxPath="/api/access/roles"
            columns={roleColumns}
            refreshKey={rolesRefreshKey}
            onRowClick={openEditRole}
            onAction={handleRoleAction}
          />
        </div>
      </div>

      <RoleFormModal
        open={modalOpen}
        onClose={closeModal}
        form={roleForm}
        setForm={setRoleForm}
        registry={registry}
        isSystemAdmin={Boolean(selectedRole?.isSystemAdmin)}
        isEditing={Boolean(selectedRoleId)}
        isSaving={isSavingRole}
        onSave={handleSaveRole}
      />
    </div>
  );
}

export default AccessLevels;
