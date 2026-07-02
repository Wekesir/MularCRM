import { useEffect, useMemo, useRef } from 'react';
import DataTable from 'datatables.net-dt';

const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];

function syncCheckboxes(tableEl, rows, permissions, disabled) {
  if (!tableEl) return;

  rows.forEach((row, index) => {
    const tr = tableEl.querySelector(`tbody tr[data-index="${index}"]`);
    if (!tr) return;

    CRUD_ACTIONS.forEach((action) => {
      const checkbox = tr.querySelector(`input[data-action="${action}"]`);
      if (!checkbox) return;

      if (disabled) {
        checkbox.checked = true;
        checkbox.disabled = true;
        return;
      }

      checkbox.disabled = false;
      if (row.subKey) {
        checkbox.checked = Boolean(permissions?.[row.modKey]?.[row.subKey]?.[action]);
      } else {
        checkbox.checked = Boolean(permissions?.[row.modKey]?.[action]);
      }
    });
  });
}

function PermissionMatrix({ registry, permissions, onChange, disabled = false }) {
  const tableRef = useRef(null);
  const dtRef = useRef(null);
  const permissionsRef = useRef(permissions);
  const onChangeRef = useRef(onChange);
  const disabledRef = useRef(disabled);

  permissionsRef.current = permissions;
  onChangeRef.current = onChange;
  disabledRef.current = disabled;

  const rows = useMemo(() => {
    const result = [];
    for (const mod of registry) {
      if (mod.submodules) {
        for (const sub of mod.submodules) {
          result.push({
            modKey: mod.key,
            subKey: sub.key,
            label: `${mod.label} → ${sub.label}`,
            isSubmodule: true,
          });
        }
      } else {
        result.push({
          modKey: mod.key,
          subKey: null,
          label: mod.label,
          isSubmodule: false,
        });
      }
    }
    return result;
  }, [registry]);

  useEffect(() => {
    if (!tableRef.current || rows.length === 0) return undefined;

    if (dtRef.current) {
      dtRef.current.destroy();
      dtRef.current = null;
    }

    const tbody = tableRef.current.querySelector('tbody');
    tbody.innerHTML = rows
      .map(
        (row, index) => `
        <tr data-index="${index}" data-mod="${row.modKey}" data-sub="${row.subKey || ''}">
          <td class="dt-index-col">${index + 1}</td>
          <td class="permission-module-label ${row.isSubmodule ? 'permission-submodule' : ''}">${row.label}</td>
          ${CRUD_ACTIONS.map(
            (action) => `
            <td>
              <input type="checkbox" data-action="${action}" />
            </td>`
          ).join('')}
        </tr>`
      )
      .join('');

    syncCheckboxes(tableRef.current, rows, permissionsRef.current, disabledRef.current);

    dtRef.current = new DataTable(tableRef.current, {
      deferRender: true,
      pageLength: 15,
      lengthMenu: [15, 30, 50],
      order: [[1, 'asc']],
      columnDefs: [
        { targets: 0, orderable: false, searchable: false },
        { targets: '_all', orderable: false },
      ],
      language: {
        emptyTable: 'No modules found',
      },
      drawCallback() {
        if (dtRef.current) {
          const pageStart = dtRef.current.page.info().start;
          let rowLoop = 0;
          dtRef.current.rows({ page: 'current' }).every(function () {
            const cell = this.node().querySelector('.dt-index-col');
            if (cell) {
              cell.textContent = String(pageStart + rowLoop + 1);
            }
            rowLoop += 1;
          });
        }
        syncCheckboxes(tableRef.current, rows, permissionsRef.current, disabledRef.current);
      },
    });

    const handleChange = (event) => {
      const checkbox = event.target.closest('input[type="checkbox"]');
      if (!checkbox || disabledRef.current) return;

      const tr = checkbox.closest('tr');
      const modKey = tr.dataset.mod;
      const subKey = tr.dataset.sub || null;
      const action = checkbox.dataset.action;

      const updated = JSON.parse(JSON.stringify(permissionsRef.current || {}));

      if (subKey) {
        if (!updated[modKey]) updated[modKey] = {};
        if (!updated[modKey][subKey]) {
          updated[modKey][subKey] = { create: false, read: false, update: false, delete: false };
        }
        updated[modKey][subKey][action] = checkbox.checked;
      } else {
        if (!updated[modKey]) {
          updated[modKey] = { create: false, read: false, update: false, delete: false };
        }
        updated[modKey][action] = checkbox.checked;
      }

      onChangeRef.current(updated);
    };

    tableRef.current.addEventListener('change', handleChange);

    return () => {
      tableRef.current?.removeEventListener('change', handleChange);
      dtRef.current?.destroy();
      dtRef.current = null;
    };
  }, [rows, disabled]);

  useEffect(() => {
    syncCheckboxes(tableRef.current, rows, permissions, disabled);
  }, [permissions, rows, disabled]);

  if (rows.length === 0) return null;

  return (
    <div className="permission-matrix-wrap datatable-wrap">
      <table ref={tableRef} className="display datatable-dark permission-matrix" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th>#</th>
            <th>Module / Submodule</th>
            <th>Create</th>
            <th>Read</th>
            <th>Update</th>
            <th>Delete</th>
          </tr>
        </thead>
        <tbody />
      </table>
    </div>
  );
}

export default PermissionMatrix;
