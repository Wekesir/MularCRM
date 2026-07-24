import { useCallback, useEffect, useMemo, useState } from 'react';
import { Plus, RefreshCw, ArchiveRestore } from 'lucide-react';
import { toast } from 'react-toastify';
import LazyDataTable from '../../components/LazyDataTable';
import UserFormModal from '../../components/UserFormModal';
import StaffCoverageModal from '../../components/StaffCoverageModal';
import StaffHandoffModal from '../../components/StaffHandoffModal';
import {
  createUser,
  deleteUser,
  restoreUser,
  updateUser,
  fetchUsers,
} from '../../api/users';
import {
  fetchStaffCoverages,
  createStaffCoverage,
  endStaffCoverage,
  fetchStaffSuccession,
  handoffStaffRole,
} from '../../api/staff';
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
const SENIOR_SUPERVISOR_ROLE_KEYS = new Set([
  'senior supervisor',
  'tenant administrator',
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
  const { isSystemAdmin, isSeniorSupervisor, isRegionalManager } = usePermissions();
  const { setActions } = usePageActions();
  const canManageSupervisorStaff = isSystemAdmin || isSeniorSupervisor || isRegionalManager;
  const canManageSeniorStaff = isSystemAdmin;

  const [activeTab, setActiveTab] = useState('users');
  const [registry, setRegistry] = useState([]);
  const [roles, setRoles] = useState([]);
  const [allUsers, setAllUsers] = useState([]);
  const [staffCoverages, setStaffCoverages] = useState([]);
  const [selectedUserId, setSelectedUserId] = useState(null);
  const [coverageUser, setCoverageUser] = useState(null);
  const [isSavingCoverage, setIsSavingCoverage] = useState(false);
  const [handoffUser, setHandoffUser] = useState(null);
  const [handoffSuccession, setHandoffSuccession] = useState(null);
  const [isSavingHandoff, setIsSavingHandoff] = useState(false);
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

  const loadStaffMeta = useCallback(async () => {
    if (!canManageSupervisorStaff && !canManageSeniorStaff) {
      setStaffCoverages([]);
      return;
    }
    try {
      const [usersData, coverages] = await Promise.all([
        fetchUsers().catch(() => []),
        fetchStaffCoverages().catch(() => []),
      ]);
      setAllUsers(Array.isArray(usersData) ? usersData : []);
      setStaffCoverages(Array.isArray(coverages) ? coverages : []);
    } catch {
      setStaffCoverages([]);
    }
  }, [canManageSupervisorStaff, canManageSeniorStaff]);

  useEffect(() => {
    loadStaffMeta();
  }, [loadStaffMeta, usersRefreshKey]);

  const coverageByAbsentId = useMemo(() => {
    const map = new Map();
    for (const c of staffCoverages) {
      if (c.status === 'active' || c.status === 'scheduled') {
        map.set(Number(c.absentUserId), c);
      }
    }
    return map;
  }, [staffCoverages]);

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
    const role = String(row?.roleName || '').trim().toLowerCase();
    const needsSuccession =
      SUPERVISOR_ROLE_KEYS.has(role) || SENIOR_SUPERVISOR_ROLE_KEYS.has(role);
    await confirm({
      title: 'Delete user',
      message: row?.name ? `Delete user "${row.name}"?` : 'Delete this user?',
      detail: needsSuccession
        ? 'This user will no longer be able to sign in. If they are the last supervisor for a call center (or last Senior Supervisor), complete a succession handoff first.'
        : 'This user will no longer be able to sign in. Their account is soft-deleted and can be restored later from the Deleted Users tab. They will be notified by email and SMS.',
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
          loadStaffMeta();
        } catch (error) {
          const code = error.response?.data?.code;
          toast.error(error.response?.data?.message || 'Failed to delete user');
          if (code === 'SUCCESSION_PENDING' || code === 'PORTFOLIO_PENDING') {
            toast.info('Complete a handoff first, then delete.');
          }
          throw error;
        } finally {
          setLoadingAction(null);
        }
      },
    });
  };

  const openStaffCoverage = (row) => setCoverageUser(row);

  const confirmEndStaffCoverage = (row) => {
    const coverage = coverageByAbsentId.get(Number(row.id));
    if (!coverage) {
      toast.info('No active or scheduled coverage for this user');
      return;
    }
    confirm({
      title: 'End leave coverage',
      message: `End coverage for ${row.name}?`,
      detail: `${coverage.coveringUserName || 'The covering user'} will lose acting authority for this role scope.`,
      confirmText: 'End coverage',
      confirmLoadingText: 'Ending…',
      onConfirm: async () => {
        try {
          await endStaffCoverage(coverage.id);
          toast.success(`Coverage ended for ${row.name}`);
          loadStaffMeta();
          refreshUsersTable();
        } catch (error) {
          toast.error(error.response?.data?.message || 'Failed to end coverage');
          throw error;
        }
      },
    });
  };

  const openStaffHandoff = async (row) => {
    setHandoffUser(row);
    setHandoffSuccession(null);
    try {
      const status = await fetchStaffSuccession(row.id);
      setHandoffSuccession(status);
    } catch {
      setHandoffSuccession(null);
    }
  };

  const handleCreateStaffCoverage = async (payload) => {
    setIsSavingCoverage(true);
    try {
      await createStaffCoverage(payload);
      toast.success(`Leave coverage started for ${coverageUser?.name}`);
      setCoverageUser(null);
      loadStaffMeta();
      refreshUsersTable();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to start coverage');
    } finally {
      setIsSavingCoverage(false);
    }
  };

  const handleStaffHandoff = async (payload) => {
    if (!handoffUser) return;
    setIsSavingHandoff(true);
    try {
      await handoffStaffRole(handoffUser.id, payload);
      toast.success(`Succession completed for ${handoffUser.name}`);
      setHandoffUser(null);
      loadStaffMeta();
      refreshUsersTable();
    } catch (error) {
      toast.error(error.response?.data?.message || 'Failed to hand off role');
    } finally {
      setIsSavingHandoff(false);
    }
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
      if (action === 'coverage-start') openStaffCoverage(row);
      if (action === 'coverage-end') confirmEndStaffCoverage(row);
      if (action === 'handoff') openStaffHandoff(row);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [selectUser, coverageByAbsentId]
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
        render: (_data, type, row) => {
          if (type !== 'display') return '';
          const role = String(row?.roleName || '').trim().toLowerCase();
          const isSupervisor = SUPERVISOR_ROLE_KEYS.has(role);
          const isSenior = SENIOR_SUPERVISOR_ROLE_KEYS.has(role);
          const canCoverage =
            (isSupervisor && canManageSupervisorStaff) ||
            (isSenior && canManageSeniorStaff);
          const hasCoverage = coverageByAbsentId.has(Number(row.id));
          const leaveChip = hasCoverage
            ? `<span class="status-pill status-pill--leave">On leave</span> `
            : '';
          let staffBtns = '';
          if (canCoverage) {
            staffBtns = hasCoverage
              ? `<button type="button" class="btn-table" data-action="coverage-end">End coverage</button>`
              : `<button type="button" class="btn-table" data-action="coverage-start">Leave coverage</button>`;
            staffBtns += `<button type="button" class="btn-table" data-action="handoff">Handoff</button>`;
          }
          return `${leaveChip}${staffBtns}
           <button type="button" class="btn-table" data-action="edit">Edit</button>
           <button type="button" class="btn-table btn-table-danger" data-action="delete">Delete</button>`;
        },
      },
    ],
    [canManageSupervisorStaff, canManageSeniorStaff, coverageByAbsentId]
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

      <StaffCoverageModal
        open={Boolean(coverageUser)}
        absentUser={coverageUser}
        users={allUsers}
        isSaving={isSavingCoverage}
        onClose={() => setCoverageUser(null)}
        onSave={handleCreateStaffCoverage}
      />

      <StaffHandoffModal
        open={Boolean(handoffUser)}
        fromUser={handoffUser}
        users={allUsers}
        succession={handoffSuccession}
        isSaving={isSavingHandoff}
        onClose={() => setHandoffUser(null)}
        onSave={handleStaffHandoff}
      />
    </div>
  );
}

export default UsersPage;
