import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, ArchiveRestore } from 'lucide-react';
import { toast } from 'react-toastify';
import LazyDataTable from '../../components/LazyDataTable';
import UserFormModal from '../../components/UserFormModal';
import {
  createUser,
  deleteUser,
  restoreUser,
  updateUser,
} from '../../api/users';
import { fetchPermissionRegistry, fetchRoles } from '../../api/accessControl';
import { fetchCallCenters } from '../../api/callCenters';
import { fetchRegions } from '../../api/regions';
import { usePageActions } from '../../context/PageActionsContext';
import { useConfirm } from '../../context/ConfirmContext';
import { usePermissions } from '../../hooks/usePermissions';

const emptyCrud = { create: false, read: false, update: false, delete: false };

const AGENT_ROLE_KEYS = new Set(['agent', 'internal agent', 'external agent']);
const SUPERVISOR_ROLE_KEYS = new Set([
  'supervisor',
  'manager',
  'call centre supervisor',
  'external agent supervisor',
]);

function roleNeedsCallCenter(roleName) {
  const key = String(roleName || '')
    .trim()
    .toLowerCase();
  return AGENT_ROLE_KEYS.has(key) || SUPERVISOR_ROLE_KEYS.has(key);
}

function roleNeedsRegion(roleName) {
  return (
    String(roleName || '')
      .trim()
      .toLowerCase() === 'regional manager'
  );
}

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

function getInitials(name = '') {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function UsersPage() {
  const { confirm } = useConfirm();
  const { isSystemAdmin } = usePermissions();
  const { setActions } = usePageActions();
  const [activeTab, setActiveTab] = useState('users');
  const [registry, setRegistry] = useState([]);
  const [roles, setRoles] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [userForm, setUserForm] = useState({
    name: '',
    email: '',
    phone: '',
    password: '',
    roleId: '',
    callCenterId: '',
    regionId: '',
    yeastarExtension: '',
    isActive: true,
    customizePermissions: false,
    permissionOverrides: null,
  });
  const [callCenters, setCallCenters] = useState([]);
  const [regions, setRegions] = useState([]);
  const [loadingAction, setLoadingAction] = useState(null);
  const [usersRefreshKey, setUsersRefreshKey] = useState(0);
  const [deletedUsersRefreshKey, setDeletedUsersRefreshKey] = useState(0);
  const [userModalOpen, setUserModalOpen] = useState(false);
  const [duplicateDeleted, setDuplicateDeleted] = useState(null);

  const isBusy = Boolean(loadingAction);
  const isSavingUser = loadingAction === 'save-user';

  useEffect(() => {
    Promise.all([
      fetchPermissionRegistry(),
      fetchRoles(),
      fetchCallCenters({ includeInactive: false }),
      fetchRegions({ includeInactive: false }),
    ])
      .then(([registryData, rolesData, centersData, regionsData]) => {
        setRegistry(registryData);
        setRoles(rolesData);
        setCallCenters(Array.isArray(centersData) ? centersData : []);
        setRegions(Array.isArray(regionsData) ? regionsData : []);
      })
      .catch(() => toast.error('Failed to load user management data'));
  }, []);

  const refreshUsersTable = useCallback(() => setUsersRefreshKey((k) => k + 1), []);
  const refreshDeletedUsersTable = useCallback(
    () => setDeletedUsersRefreshKey((k) => k + 1),
    []
  );

  const selectUser = useCallback(
    (user) => {
      setSelectedUserId(user.id);
      setDuplicateDeleted(null);
      setUserForm({
        id: user.id,
        name: user.name,
        email: user.email,
        phone: user.phone || '',
        password: '',
        roleId: user.roleId,
        callCenterId: user.callCenterId || '',
        regionId: user.regionId || '',
        yeastarExtension: user.yeastarExtension || '',
        isActive: user.isActive,
        customizePermissions: Boolean(user.permissionOverrides),
        permissionOverrides: user.permissionOverrides || buildEmptyPermissions(registry),
      });
      setUserModalOpen(true);
    },
    [registry]
  );

  const selectNewUser = useCallback(() => {
    setSelectedUserId(null);
    setDuplicateDeleted(null);
    setUserForm({
      id: null,
      name: '',
      email: '',
      phone: '',
      password: '',
      roleId: roles[0]?.id || '',
      callCenterId: '',
      regionId: '',
      yeastarExtension: '',
      isActive: true,
      customizePermissions: false,
      permissionOverrides: buildEmptyPermissions(registry),
    });
    setUserModalOpen(true);
  }, [roles, registry]);

  const closeUserModal = useCallback(() => {
    setUserModalOpen(false);
    setDuplicateDeleted(null);
  }, []);

  /* Inject Refresh + New User buttons into the shared page header */
  useEffect(() => {
    setActions(
      <>
        <button
          type="button"
          className="btn-icon-outline"
          aria-label="Refresh users"
          onClick={refreshUsersTable}
          disabled={isBusy}
        >
          <RefreshCw className="icon-sm" />
        </button>
        <button
          type="button"
          className="btn-primary btn-sm"
          onClick={selectNewUser}
          disabled={isBusy}
        >
          <Plus className="icon-sm" />
          New User
        </button>
      </>
    );
    return () => setActions(null);
  }, [setActions, isBusy, selectNewUser, refreshUsersTable]);

  const handleSaveUser = async () => {
    if (!userForm.name.trim() || !userForm.email.trim() || !userForm.roleId) {
      toast.error('Name, email, and role are required');
      return;
    }

    const selectedRole = roles.find((r) => r.id === Number(userForm.roleId));
    const needsCenter = roleNeedsCallCenter(selectedRole?.name);
    const needsRegion = roleNeedsRegion(selectedRole?.name);
    if (needsCenter && !userForm.callCenterId) {
      toast.error('Call center is required for Agents and Supervisors');
      return;
    }
    if (needsRegion && !userForm.regionId) {
      toast.error('Region is required for Regional Managers');
      return;
    }

    const payload = {
      name: userForm.name,
      email: userForm.email,
      phone: userForm.phone.trim() || null,
      roleId: Number(userForm.roleId),
      callCenterId: needsCenter ? Number(userForm.callCenterId) : null,
      regionId: needsRegion ? Number(userForm.regionId) : null,
      yeastarExtension: userForm.yeastarExtension?.trim() || null,
      isActive: userForm.isActive,
      permissionOverrides: userForm.customizePermissions ? userForm.permissionOverrides : null,
    };

    if (userForm.password.trim()) {
      payload.password = userForm.password;
    }

    setLoadingAction('save-user');
    try {
      if (selectedUserId) {
        await updateUser(selectedUserId, payload);
        toast.success('User updated');
      } else {
        const created = await createUser(payload);
        const emailStatus = created?.notifications?.email;
        if (emailStatus === 'sent') {
          toast.success('User created — login details emailed to them');
        } else if (emailStatus === 'failed') {
          toast.warning('User created, but the invite email could not be sent. Check email settings.');
        } else {
          toast.success('User created');
        }
      }
      refreshUsersTable();
      closeUserModal();
    } catch (error) {
      const status = error.response?.status;
      const body = error.response?.data;
      if (status === 409 && body?.code === 'USER_DELETED') {
        setDuplicateDeleted({
          deletedUserId: body.deletedUserId,
          deletedName: body.deletedName,
          email: body.email,
        });
        return;
      }
      if (status === 409 && body?.code === 'USER_EXISTS') {
        toast.error(body.message || 'A user with this email already exists');
        return;
      }
      toast.error(body?.message || 'Failed to save user');
    } finally {
      setLoadingAction(null);
    }
  };

  const handleDeleteUser = async (id, row) => {
    await confirm({
      title: 'Delete user',
      message: row?.name ? `Delete user "${row.name}"?` : 'Delete this user?',
      detail:
        'This user will no longer be able to sign in. Their account is soft-deleted and can be restored later from the Deleted Users tab. They will be notified by email and SMS.',
      confirmText: 'Delete User',
      confirmLoadingText: 'Deleting…',
      onConfirm: async () => {
        setLoadingAction('delete-user');
        try {
          const result = await deleteUser(id);
          const emailStatus = result?.notifications?.email;
          if (emailStatus === 'failed') {
            toast.warning('User deleted, but the notification email could not be sent.');
          } else {
            toast.success('User deleted');
          }
          if (selectedUserId === id) {
            setSelectedUserId(null);
            setUserModalOpen(false);
          }
          refreshUsersTable();
          refreshDeletedUsersTable();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to delete user');
          throw error;
        } finally {
          setLoadingAction(null);
        }
      },
    });
  };

  const handleRestoreUser = async (id, row) => {
    await confirm({
      title: 'Restore user',
      message: row?.name ? `Restore user "${row.name}"?` : 'Restore this user?',
      detail: 'They will be able to sign in again with their previous credentials and role.',
      confirmText: 'Restore User',
      confirmLoadingText: 'Restoring…',
      onConfirm: async () => {
        setLoadingAction('restore-user');
        try {
          await restoreUser(id);
          toast.success('User restored');
          refreshDeletedUsersTable();
          refreshUsersTable();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to restore user');
          throw error;
        } finally {
          setLoadingAction(null);
        }
      },
    });
  };

  const handleRestoreDuplicate = async () => {
    if (!duplicateDeleted?.deletedUserId) return;
    setLoadingAction('save-user');
    try {
      await restoreUser(duplicateDeleted.deletedUserId);
      toast.success(`${duplicateDeleted.deletedName || 'User'} restored`);
      refreshUsersTable();
      refreshDeletedUsersTable();
      closeUserModal();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to restore user');
    } finally {
      setLoadingAction(null);
    }
  };

  const goToDeletedUsers = useCallback(() => {
    closeUserModal();
    setActiveTab('deleted-users');
  }, [closeUserModal]);

  const handleUserAction = useCallback(
    (action, row) => {
      if (action === 'delete') handleDeleteUser(row.id, row);
      if (action === 'edit') selectUser(row);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectUser]
  );

  const handleDeletedUserAction = useCallback(
    (action, row) => {
      if (action === 'restore') handleRestoreUser(row.id, row);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    []
  );

  const userColumns = useMemo(
    () => [
      {
        data: 'name',
        title: 'User',
        render: (data, type, row) => {
          if (type !== 'display') return data;
          const initials = getInitials(data);
          const safeName = escapeHtml(data);
          const safeEmail = escapeHtml(row.email);
          return `<div class="user-cell">
            <span class="user-avatar">${initials}</span>
            <div class="user-cell-info">
              <span class="user-cell-name">${safeName}</span>
              <span class="user-cell-email">${safeEmail}</span>
            </div>
          </div>`;
        },
      },
      {
        data: 'roleName',
        title: 'Role',
        render: (data, type) => {
          if (type !== 'display') return data;
          return `<span class="role-pill">${escapeHtml(data ?? '—')}</span>`;
        },
      },
      {
        data: 'isActive',
        title: 'Status',
        render: (data, type) => {
          if (type !== 'display') return data;
          return data
            ? `<span class="status-pill status-pill--active">Active</span>`
            : `<span class="status-pill status-pill--inactive">Inactive</span>`;
        },
      },
      {
        data: null,
        title: 'Actions',
        orderable: false,
        searchable: false,
        render: () =>
          `<button type="button" class="btn-table" data-action="edit">Edit</button>
           <button type="button" class="btn-table btn-table-danger" data-action="delete">Delete</button>`,
      },
    ],
    []
  );

  const deletedUserColumns = useMemo(
    () => [
      {
        data: 'name',
        title: 'User',
        render: (data, type, row) => {
          if (type !== 'display') return data;
          const initials = getInitials(data);
          const safeName = escapeHtml(data);
          const safeEmail = escapeHtml(row.email);
          return `<div class="user-cell">
            <span class="user-avatar user-avatar--deleted">${initials}</span>
            <div class="user-cell-info">
              <span class="user-cell-name">${safeName}</span>
              <span class="user-cell-email">${safeEmail}</span>
            </div>
          </div>`;
        },
      },
      {
        data: 'roleName',
        title: 'Role',
        render: (data, type) => {
          if (type !== 'display') return data;
          return `<span class="role-pill">${escapeHtml(data ?? '—')}</span>`;
        },
      },
      {
        data: 'deletedAt',
        title: 'Deleted',
        render: (data, type) => {
          if (type !== 'display' || !data) return data || '';
          const d = new Date(data);
          if (Number.isNaN(d.getTime())) return data;
          return d.toLocaleString();
        },
      },
      {
        data: null,
        title: 'Actions',
        orderable: false,
        searchable: false,
        render: () =>
          `<button type="button" class="btn-table" data-action="restore">Restore</button>`,
      },
    ],
    []
  );

  return (
    <div className="space-y-6 min-h-[50vh]">
      <div className="users-module-card">
        <div className="config-tabs">
          <button
            type="button"
            className={activeTab === 'users' ? 'config-tab config-tab-active' : 'config-tab'}
            onClick={() => setActiveTab('users')}
          >
            Users
          </button>
          {isSystemAdmin && (
            <button
              type="button"
              className={
                activeTab === 'deleted-users' ? 'config-tab config-tab-active' : 'config-tab'
              }
              onClick={() => setActiveTab('deleted-users')}
            >
              Deleted Users
            </button>
          )}
        </div>

        {activeTab === 'users' && (
          <div className={`users-tab-panel${isBusy ? ' users-tab-panel--busy' : ''}`}>
            <LazyDataTable
              ajaxPath="/api/users"
              columns={userColumns}
              refreshKey={usersRefreshKey}
              onRowClick={selectUser}
              onAction={handleUserAction}
            />
          </div>
        )}

        {activeTab === 'deleted-users' && isSystemAdmin && (
          <div className={`users-tab-panel${isBusy ? ' users-tab-panel--busy' : ''}`}>
            <div className="users-section-banner">
              <ArchiveRestore className="users-section-banner-icon" size={16} />
              <div>
                <p className="users-section-banner-title">Soft-deleted accounts</p>
                <p className="users-section-banner-desc">
                  These accounts are soft-deleted and can be fully restored at any time. All user
                  data and role assignments are preserved.
                </p>
              </div>
            </div>
            <LazyDataTable
              ajaxPath="/api/users/deleted"
              columns={deletedUserColumns}
              refreshKey={deletedUsersRefreshKey}
              onAction={handleDeletedUserAction}
            />
          </div>
        )}
      </div>

      <UserFormModal
        open={userModalOpen}
        onClose={closeUserModal}
        form={userForm}
        setForm={setUserForm}
        roles={roles}
        callCenters={callCenters}
        regions={regions}
        registry={registry}
        isSaving={isSavingUser}
        onSave={handleSaveUser}
        buildEmptyPermissions={buildEmptyPermissions}
        duplicateDeleted={duplicateDeleted}
        onRestoreDuplicate={handleRestoreDuplicate}
        onViewDeletedUsers={goToDeletedUsers}
      />
    </div>
  );
}

export default UsersPage;
