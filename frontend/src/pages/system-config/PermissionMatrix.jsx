import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, ChevronRight, Info, Search } from 'lucide-react';

/* ─── constants ──────────────────────────────────────────────────────────── */
const CRUD_ACTIONS = ['create', 'read', 'update', 'delete'];
const EMPTY_CRUD = { create: false, read: false, update: false, delete: false };
const FULL_CRUD  = { create: true,  read: true,  update: true,  delete: true  };

/* ─── helpers ────────────────────────────────────────────────────────────── */
function clone(obj) { return JSON.parse(JSON.stringify(obj || {})); }

function leafValues(permissions, mod) {
  if (mod.submodules?.length) {
    return mod.submodules.flatMap((sub) =>
      CRUD_ACTIONS.map((a) => Boolean(permissions?.[mod.key]?.[sub.key]?.[a]))
    );
  }
  return CRUD_ACTIONS.map((a) => Boolean(permissions?.[mod.key]?.[a]));
}

function triState(values) {
  const allOn  = values.length > 0 && values.every(Boolean);
  const allOff = values.every((v) => !v);
  return { checked: allOn, indeterminate: !allOn && !allOff };
}

function globalState(registry, permissions) {
  const vals = registry.flatMap((mod) => leafValues(permissions, mod));
  return triState(vals);
}

function columnState(registry, permissions, action) {
  const vals = registry.flatMap((mod) => {
    if (mod.submodules?.length) {
      return mod.submodules.map((sub) =>
        Boolean(permissions?.[mod.key]?.[sub.key]?.[action])
      );
    }
    return [Boolean(permissions?.[mod.key]?.[action])];
  });
  return triState(vals);
}

function moduleState(permissions, mod) {
  return triState(leafValues(permissions, mod));
}

function moduleActionState(permissions, mod, action) {
  if (!mod.submodules?.length) {
    return { checked: Boolean(permissions?.[mod.key]?.[action]), indeterminate: false };
  }
  const vals = mod.submodules.map((sub) =>
    Boolean(permissions?.[mod.key]?.[sub.key]?.[action])
  );
  return triState(vals);
}

function submoduleState(permissions, modKey, subKey) {
  const vals = CRUD_ACTIONS.map((a) => Boolean(permissions?.[modKey]?.[subKey]?.[a]));
  return triState(vals);
}

/* Mutators ----------------------------------------------------------------- */
function setAll(registry, enabled) {
  const updated = {};
  for (const mod of registry) {
    if (mod.submodules?.length) {
      updated[mod.key] = {};
      for (const sub of mod.submodules) {
        updated[mod.key][sub.key] = enabled ? { ...FULL_CRUD } : { ...EMPTY_CRUD };
      }
    } else {
      updated[mod.key] = enabled ? { ...FULL_CRUD } : { ...EMPTY_CRUD };
    }
  }
  return updated;
}

function setModuleAll(updated, mod, enabled) {
  const crud = enabled ? { ...FULL_CRUD } : { ...EMPTY_CRUD };
  if (mod.submodules?.length) {
    updated[mod.key] = updated[mod.key] || {};
    for (const sub of mod.submodules) updated[mod.key][sub.key] = { ...crud };
  } else {
    updated[mod.key] = { ...crud };
  }
}

function setModuleAction(updated, mod, action, enabled) {
  if (mod.submodules?.length) {
    updated[mod.key] = updated[mod.key] || {};
    for (const sub of mod.submodules) {
      updated[mod.key][sub.key] = updated[mod.key][sub.key] || { ...EMPTY_CRUD };
      updated[mod.key][sub.key][action] = enabled;
    }
  } else {
    updated[mod.key] = updated[mod.key] || { ...EMPTY_CRUD };
    updated[mod.key][action] = enabled;
  }
}

function setColumnAction(registry, updated, action, enabled) {
  for (const mod of registry) setModuleAction(updated, mod, action, enabled);
}

function setSubAll(updated, modKey, subKey, enabled) {
  updated[modKey] = updated[modKey] || {};
  updated[modKey][subKey] = enabled ? { ...FULL_CRUD } : { ...EMPTY_CRUD };
}

/* ─── sub-components ─────────────────────────────────────────────────────── */

/** Checkbox that correctly handles indeterminate state */
function MatrixCheckbox({ checked, indeterminate = false, disabled, onChange, title, 'aria-label': ariaLabel }) {
  const ref = useRef(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = indeterminate;
  }, [indeterminate]);
  return (
    <input
      ref={ref}
      type="checkbox"
      checked={checked}
      disabled={disabled}
      onChange={onChange}
      title={title}
      aria-label={ariaLabel}
    />
  );
}

/* ─── main component ─────────────────────────────────────────────────────── */
function PermissionMatrix({ registry, permissions, onChange, disabled = false }) {
  const [search, setSearch]       = useState('');
  const [collapsed, setCollapsed] = useState({});

  /* Filter registry by search */
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return registry;
    return registry.reduce((acc, mod) => {
      const modMatch = mod.label.toLowerCase().includes(q);
      if (mod.submodules?.length) {
        const matchedSubs = mod.submodules.filter((s) =>
          s.label.toLowerCase().includes(q)
        );
        if (modMatch || matchedSubs.length) {
          acc.push({ ...mod, submodules: modMatch ? mod.submodules : matchedSubs });
        }
      } else if (modMatch) {
        acc.push(mod);
      }
      return acc;
    }, []);
  }, [registry, search]);

  const toggleCollapse = useCallback((key) => {
    setCollapsed((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  /* Expand all that contain a search hit */
  useEffect(() => {
    if (!search.trim()) return;
    const next = {};
    filtered.forEach((mod) => { next[mod.key] = false; });
    setCollapsed((prev) => ({ ...prev, ...next }));
  }, [search, filtered]);

  /* ── change handlers ── */
  const handleGlobal = useCallback((e) => {
    if (disabled) return;
    onChange(setAll(registry, e.target.checked));
  }, [disabled, registry, onChange]);

  const handleColumn = useCallback((action, checked) => {
    if (disabled) return;
    const updated = clone(permissions);
    setColumnAction(registry, updated, action, checked);
    onChange(updated);
  }, [disabled, registry, permissions, onChange]);

  const handleModuleAll = useCallback((mod, checked) => {
    if (disabled) return;
    const updated = clone(permissions);
    setModuleAll(updated, mod, checked);
    onChange(updated);
  }, [disabled, permissions, onChange]);

  const handleModuleAction = useCallback((mod, action, checked) => {
    if (disabled) return;
    const updated = clone(permissions);
    setModuleAction(updated, mod, action, checked);
    onChange(updated);
  }, [disabled, permissions, onChange]);

  const handleSubAll = useCallback((modKey, subKey, checked) => {
    if (disabled) return;
    const updated = clone(permissions);
    setSubAll(updated, modKey, subKey, checked);
    onChange(updated);
  }, [disabled, permissions, onChange]);

  const handleSubAction = useCallback((modKey, subKey, action, checked) => {
    if (disabled) return;
    const updated = clone(permissions);
    updated[modKey] = updated[modKey] || {};
    updated[modKey][subKey] = updated[modKey][subKey] || { ...EMPTY_CRUD };
    updated[modKey][subKey][action] = checked;
    onChange(updated);
  }, [disabled, permissions, onChange]);

  /* ── computed states for header ── */
  const globalSt  = globalState(registry, permissions);
  const columnSts = useMemo(() =>
    CRUD_ACTIONS.reduce((acc, a) => {
      acc[a] = columnState(registry, permissions, a);
      return acc;
    }, {}),
  [registry, permissions]);

  if (registry.length === 0) return null;

  return (
    <div className="pm-root">
      {/* ── toolbar ── */}
      {!disabled && (
        <div className="permission-matrix-toolbar">
          <div className="permission-matrix-toolbar-copy">
            <p className="permission-matrix-hint">
              <Info className="permission-matrix-hint-icon" aria-hidden="true" />
              Module groups cascade to all their submodules. Each submodule can still be edited individually.
            </p>
            <div className="permission-matrix-legend-wrap">
              <span className="permission-matrix-legend-label">Row types</span>
              <div className="permission-matrix-legend" aria-label="Row type legend">
                <span className="permission-legend-item">
                  <span className="permission-type-badge permission-type-badge--group">Module group</span>
                  Parent — cascades to children
                </span>
                <span className="permission-legend-item">
                  <span className="permission-type-badge permission-type-badge--sub">Submodule</span>
                  Child — edit individually
                </span>
                <span className="permission-legend-item">
                  <span className="permission-type-badge permission-type-badge--module">Module</span>
                  Standalone page
                </span>
              </div>
            </div>
          </div>
          <div className="permission-matrix-toolbar-actions">
            <button
              type="button"
              className="btn-primary btn-sm"
              onClick={() => !disabled && onChange(setAll(registry, true))}
            >
              ✓ Select all
            </button>
            <button
              type="button"
              className="btn-secondary btn-sm"
              onClick={() => !disabled && onChange(setAll(registry, false))}
            >
              ✕ Clear all
            </button>
          </div>
        </div>
      )}

      {/* ── search ── */}
      {!disabled && (
        <div className="pm-search-bar">
          <Search className="pm-search-icon" aria-hidden="true" />
          <input
            type="search"
            className="pm-search-input"
            placeholder="Filter modules…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      )}

      {/* ── tree table ── */}
      <div className="pm-table-wrap">
        <table className="pm-table">
          <thead>
            <tr className="pm-thead-row">
              <th className="pm-th pm-th-name">
                <div className="pm-th-name-inner">
                  {!disabled && (
                    <MatrixCheckbox
                      checked={globalSt.checked}
                      indeterminate={globalSt.indeterminate}
                      disabled={disabled}
                      onChange={handleGlobal}
                      title="Select / deselect all modules and submodules"
                      aria-label="Select all"
                    />
                  )}
                  <span>Module / Submodule</span>
                </div>
              </th>
              {CRUD_ACTIONS.map((action) => (
                <th key={action} className="pm-th pm-th-action">
                  <div className="pm-th-action-inner">
                    <span>{action.charAt(0).toUpperCase() + action.slice(1)}</span>
                    {!disabled && (
                      <MatrixCheckbox
                        checked={columnSts[action].checked}
                        indeterminate={columnSts[action].indeterminate}
                        disabled={disabled}
                        onChange={(e) => handleColumn(action, e.target.checked)}
                        title={`Toggle ${action} for all modules`}
                        aria-label={`${action} for all`}
                      />
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>

          {/* empty state */}
          {filtered.length === 0 && (
            <tbody>
              <tr>
                <td className="pm-empty-cell" colSpan={CRUD_ACTIONS.length + 1}>
                  No modules match &ldquo;{search}&rdquo;
                </td>
              </tr>
            </tbody>
          )}

          {/* one <tbody> per module group for visual grouping */}
          {filtered.map((mod) => {
            const hasSubs = mod.submodules?.length > 0;
            const isOpen  = !collapsed[mod.key];
            const modSt   = moduleState(permissions, mod);

            return (
              <tbody key={mod.key} className="pm-module-group">
                {/* ── parent / standalone row ── */}
                <tr className={hasSubs ? 'pm-row pm-row--parent' : 'pm-row pm-row--module'}>
                  <td className="pm-td pm-td-name">
                    <div className="pm-name-cell">
                      {/* Expand / collapse toggle */}
                      {hasSubs ? (
                        <button
                          type="button"
                          className="pm-expand-btn"
                          onClick={() => toggleCollapse(mod.key)}
                          aria-label={isOpen ? 'Collapse' : 'Expand'}
                          aria-expanded={isOpen}
                        >
                          {isOpen
                            ? <ChevronDown className="icon-sm" />
                            : <ChevronRight className="icon-sm" />}
                        </button>
                      ) : (
                        <span className="pm-expand-placeholder" />
                      )}

                      {/* Row select-all checkbox */}
                      <MatrixCheckbox
                        checked={modSt.checked}
                        indeterminate={modSt.indeterminate}
                        disabled={disabled}
                        onChange={(e) => handleModuleAll(mod, e.target.checked)}
                        title={hasSubs
                          ? `Select all submodules under ${mod.label}`
                          : `Select all actions for ${mod.label}`}
                      />

                      <div className="pm-name-wrap">
                        <span className="pm-label">{mod.label}</span>
                        {hasSubs && (
                          <span className="pm-meta">
                            {mod.submodules.length} submodule{mod.submodules.length !== 1 ? 's' : ''}
                          </span>
                        )}
                      </div>

                      <span className={`permission-type-badge ${hasSubs ? 'permission-type-badge--group' : 'permission-type-badge--module'}`}>
                        {hasSubs ? 'Group' : 'Module'}
                      </span>
                    </div>
                  </td>

                  {CRUD_ACTIONS.map((action) => {
                    const st = moduleActionState(permissions, mod, action);
                    return (
                      <td key={action} className="pm-td pm-td-action">
                        <MatrixCheckbox
                          checked={st.checked}
                          indeterminate={st.indeterminate}
                          disabled={disabled}
                          onChange={(e) => handleModuleAction(mod, action, e.target.checked)}
                          title={`${action} — ${mod.label}`}
                        />
                      </td>
                    );
                  })}
                </tr>

                {/* ── submodule rows ── */}
                {hasSubs && isOpen && mod.submodules.map((sub, subIdx) => {
                  const isLast = subIdx === mod.submodules.length - 1;
                  const subSt  = submoduleState(permissions, mod.key, sub.key);
                  return (
                    <tr
                      key={sub.key}
                      className={`pm-row pm-row--sub${isLast ? ' pm-row--sub-last' : ''}`}
                    >
                      {/* pm-td-sub uses ::before + ::after for the L-shaped tree connector */}
                      <td className="pm-td pm-td-name pm-td-sub">
                        <div className="pm-name-cell">
                          <MatrixCheckbox
                            checked={subSt.checked}
                            indeterminate={subSt.indeterminate}
                            disabled={disabled}
                            onChange={(e) => handleSubAll(mod.key, sub.key, e.target.checked)}
                            title={`Select all actions for ${sub.label}`}
                          />
                          <span className="pm-sub-label">{sub.label}</span>
                          <span className="permission-type-badge permission-type-badge--sub">Sub</span>
                        </div>
                      </td>

                      {CRUD_ACTIONS.map((action) => (
                        <td key={action} className="pm-td pm-td-action">
                          <MatrixCheckbox
                            checked={Boolean(permissions?.[mod.key]?.[sub.key]?.[action])}
                            indeterminate={false}
                            disabled={disabled}
                            onChange={(e) => handleSubAction(mod.key, sub.key, action, e.target.checked)}
                            title={`${action} — ${sub.label}`}
                          />
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            );
          })}
        </table>
      </div>
    </div>
  );
}

export default PermissionMatrix;
