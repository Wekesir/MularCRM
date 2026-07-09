import { useEffect, useMemo, useState } from 'react';
import { toast } from 'react-toastify';
import LazyDataTable from '../../components/LazyDataTable';
import LoadingButton from '../../components/LoadingButton';
import { createRole, deleteRole, fetchPermissionRegistry, fetchRoles, updateRole } from '../../api/accessControl';
import PermissionMatrix from './PermissionMatrix';
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

  const selectRole = (role) => {
    setSelectedRoleId(role.id);
    setRoleForm({ name: role.name, permissions: role.permissions });
  };

  const selectNewRole = () => {
    setSelectedRoleId(null);
    setRoleForm({ name: '', permissions: buildEmptyPermissions(registry) });
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
        selectRole(updated);
      } else {
        const created = await createRole(roleForm);
        toast.success('Role created');
        setRoles((prev) => [...prev, created]);
        selectRole(created);
      }
      refreshRolesTable();
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
          if (selectedRoleId === id) selectNewRole();
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
    if (action === 'edit') selectRole(row);
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
            ? `<button type="button" class="btn-table" data-action="edit">Edit</button>`
            : `<button type="button" class="btn-table" data-action="edit">Edit</button>
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
              className="btn-secondary"
              onClick={selectNewRole}
              disabled={isBusy}
            >
              + New Role
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
            onRowClick={selectRole}
            onAction={handleRoleAction}
          />
        </div>

        <div className="access-editor">
          <h3>{selectedRoleId ? 'Edit Role' : 'New Role'}</h3>
          <label>
            Role Name
            <input
              type="text"
              value={roleForm.name}
              onChange={(e) => setRoleForm((prev) => ({ ...prev, name: e.target.value }))}
            />
          </label>

          {selectedRole?.isSystemAdmin && (
            <p className="config-hint">
              System Admin has full access to all modules, submodules, and CRUD actions.
            </p>
          )}

          {registry.length > 0 && (
            <PermissionMatrix
              registry={registry}
              permissions={roleForm.permissions}
              onChange={(permissions) => setRoleForm((prev) => ({ ...prev, permissions }))}
              disabled={selectedRole?.isSystemAdmin}
            />
          )}

          <LoadingButton
            className="btn-primary"
            onClick={handleSaveRole}
            loading={isSavingRole}
            loadingText={selectedRoleId ? 'Updating...' : 'Creating...'}
            disabled={isBusy && !isSavingRole}
          >
            {selectedRoleId ? 'Update Role' : 'Create Role'}
          </LoadingButton>
        </div>
      </div>
    </div>
  );
}

export default AccessLevels;
