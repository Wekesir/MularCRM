import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  RotateCcw,
  Building2,
  Layers,
  Tags,
  Coins,
  Check,
  Search,
  ChevronDown,
} from 'lucide-react';
import LoadingButton from './LoadingButton';
import { downloadDebtorTemplate, bulkUploadDebtors } from '../api/debtors';
import { fetchClients } from '../api/clients';
import { fetchDebtCategories } from '../api/debtCategories';
import { fetchDebtTypes } from '../api/debtTypes';
import { fetchCurrencies } from '../api/currencies';

// ── Searchable client combobox ─────────────────────────────────────────────
function ClientCombobox({ clients, value, onChange, disabled, loading }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [activeIdx, setActiveIdx] = useState(-1);

  const selected = clients.find((c) => String(c.id) === value) || null;

  const filtered = useMemo(() => {
    if (!query.trim()) return clients;
    const q = query.toLowerCase();
    return clients.filter((c) => c.name.toLowerCase().includes(q));
  }, [clients, query]);

  // Close on outside click
  useEffect(() => {
    if (!open) return undefined;
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) {
        setOpen(false);
        setQuery('');
        setActiveIdx(-1);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const openDropdown = () => {
    if (disabled) return;
    setOpen(true);
    setQuery('');
    setActiveIdx(-1);
    setTimeout(() => inputRef.current?.focus(), 30);
  };

  const selectClient = (client) => {
    onChange(String(client.id));
    setOpen(false);
    setQuery('');
    setActiveIdx(-1);
  };

  const clearSelection = (e) => {
    e.stopPropagation();
    onChange('');
    setOpen(false);
    setQuery('');
  };

  const handleKeyDown = (e) => {
    if (!open) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') openDropdown();
      return;
    }
    if (e.key === 'Escape') {
      setOpen(false);
      setQuery('');
      setActiveIdx(-1);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && activeIdx >= 0 && filtered[activeIdx]) {
      selectClient(filtered[activeIdx]);
    }
  };

  // Scroll active option into view
  useEffect(() => {
    if (activeIdx < 0 || !listRef.current) return;
    const item = listRef.current.querySelectorAll('[role="option"]')[activeIdx];
    item?.scrollIntoView({ block: 'nearest' });
  }, [activeIdx]);

  return (
    <div
      className={`cbc-wrap${open ? ' cbc-wrap--open' : ''}${disabled ? ' cbc-wrap--disabled' : ''}`}
      ref={wrapRef}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger */}
      <button
        type="button"
        className="cbc-trigger"
        onClick={openDropdown}
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="cbc-trigger-icon" aria-hidden="true" />
        {loading ? (
          <span className="cbc-trigger-placeholder">Loading…</span>
        ) : selected ? (
          <span className="cbc-trigger-value">{selected.name}</span>
        ) : (
          <span className="cbc-trigger-placeholder">Search or select a client…</span>
        )}
        <span className="cbc-trigger-actions">
          {selected && !disabled && (
            <span
              role="button"
              tabIndex={0}
              className="cbc-clear-btn"
              onClick={clearSelection}
              onKeyDown={(e) => e.key === 'Enter' && clearSelection(e)}
              aria-label="Clear selection"
            >
              <X className="cbc-clear-icon" />
            </span>
          )}
          <ChevronDown className={`cbc-chevron${open ? ' cbc-chevron--open' : ''}`} aria-hidden="true" />
        </span>
      </button>

      {/* Dropdown */}
      {open && (
        <div className="cbc-dropdown" role="listbox" aria-label="Client list">
          {/* Search input */}
          <div className="cbc-search-wrap">
            <Search className="cbc-search-icon" aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              className="cbc-search-input"
              placeholder="Type to search clients…"
              value={query}
              onChange={(e) => { setQuery(e.target.value); setActiveIdx(0); }}
              autoComplete="off"
            />
          </div>

          {/* List */}
          <ul className="cbc-list" ref={listRef}>
            {filtered.length === 0 ? (
              <li className="cbc-empty">No clients match "{query}"</li>
            ) : (
              filtered.map((client, idx) => (
                <li
                  key={client.id}
                  role="option"
                  aria-selected={String(client.id) === value}
                  className={`cbc-option${String(client.id) === value ? ' cbc-option--selected' : ''}${idx === activeIdx ? ' cbc-option--active' : ''}`}
                  onMouseDown={() => selectClient(client)}
                  onMouseEnter={() => setActiveIdx(idx)}
                >
                  <Building2 className="cbc-option-icon" aria-hidden="true" />
                  <span className="cbc-option-name">{client.name}</span>
                  {String(client.id) === value && (
                    <Check className="cbc-option-check" aria-hidden="true" />
                  )}
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function DebtorBulkUploadModal({ open, onClose, onCompleted }) {
  const [file, setFile] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [isLoadingLookups, setIsLoadingLookups] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);
  const dragCounter = useRef(0);

  // Batch context selections
  const [clients, setClients] = useState([]);
  const [categories, setCategories] = useState([]);
  const [types, setTypes] = useState([]);
  const [currencies, setCurrencies] = useState([]);
  const [clientId, setClientId] = useState('');
  const [debtCategoryId, setDebtCategoryId] = useState('');
  const [debtTypeId, setDebtTypeId] = useState('');
  const [currencyId, setCurrencyId] = useState('');

  const activeCategories = useMemo(() => categories.filter((c) => c.isActive), [categories]);
  const activeTypes = useMemo(() => types.filter((t) => t.isActive), [types]);
  const activeCurrencies = useMemo(() => currencies.filter((c) => c.isActive), [currencies]);

  const loadLookups = async () => {
    setIsLoadingLookups(true);
    try {
      const [c, cat, t, cur] = await Promise.all([
        fetchClients(),
        fetchDebtCategories(),
        fetchDebtTypes(),
        fetchCurrencies(),
      ]);
      setClients(c);
      setCategories(cat);
      setTypes(t);
      setCurrencies(cur);
      const def = cur.find((x) => x.isDefault && x.isActive) || cur.find((x) => x.isActive);
      setCurrencyId(def ? String(def.id) : '');
    } catch {
      // Non-fatal — dropdowns will be empty.
    } finally {
      setIsLoadingLookups(false);
    }
  };

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape' && !isUploading) onClose(); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isUploading, onClose]);

  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setError('');
      setClientId('');
      setDebtCategoryId('');
      setDebtTypeId('');
      setIsDragging(false);
      dragCounter.current = 0;
      loadLookups();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  if (!open) return null;

  const validateFile = (selected) => {
    if (!selected) return null;
    if (!selected.name.toLowerCase().endsWith('.csv')) {
      setError('Only CSV (.csv) files are accepted. Please download the template and upload it as .csv.');
      return null;
    }
    return selected;
  };

  const handleFileChange = (e) => {
    setError('');
    setResult(null);
    const selected = e.target.files?.[0];
    const valid = validateFile(selected);
    if (!valid && inputRef.current) inputRef.current.value = '';
    setFile(valid);
  };

  // Drag-and-drop handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current += 1;
    if (e.dataTransfer.items?.length) setIsDragging(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current -= 1;
    if (dragCounter.current === 0) setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    dragCounter.current = 0;
    if (isUploading) return;
    setError('');
    setResult(null);
    const dropped = e.dataTransfer.files?.[0];
    const valid = validateFile(dropped);
    setFile(valid);
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      await downloadDebtorTemplate();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download template.');
    } finally {
      setIsDownloading(false);
    }
  };

  const selectionsReady = Boolean(clientId && debtCategoryId && debtTypeId && currencyId);
  const canUpload = Boolean(file) && selectionsReady && !isUploading;

  const handleUpload = async () => {
    if (!selectionsReady) {
      setError('Please select a Client, Debt Category, Debt Type and Currency before uploading.');
      return;
    }
    if (!file) {
      setError('Please choose or drop a .csv file to upload.');
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const res = await bulkUploadDebtors(file, { clientId, debtCategoryId, debtTypeId, currencyId });
      setResult(res);
      if (typeof onCompleted === 'function') onCompleted(res);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to process the upload.');
    } finally {
      setIsUploading(false);
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const createdCount = result?.createdCount ?? 0;
  const failedCount = result?.failedCount ?? 0;
  const hasFailures = failedCount > 0;
  const hasResult = Boolean(result);

  const selectedClient = clients.find((c) => String(c.id) === clientId);
  const selectedCategory = activeCategories.find((c) => String(c.id) === debtCategoryId);
  const selectedType = activeTypes.find((t) => String(t.id) === debtTypeId);
  const selectedCurrency = activeCurrencies.find((c) => String(c.id) === currencyId);

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel dbu-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="debtor-bulk-upload-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        {/* Header */}
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Upload className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="debtor-bulk-upload-title" className="cf-title">Bulk Upload Debtors</h2>
              <p className="cf-subtitle">
                Follow the three steps below to import a batch of debtors from a CSV file.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
            disabled={isUploading}
          >
            <X className="modal-close-icon" />
          </button>
        </div>

        {/* Scrollable body */}
        <div className="cf-body dbu-body">

          {/* ── Step 1: Download template ── */}
          <div className="dbu-step">
            <div className="dbu-step-head">
              <span className="dbu-step-badge dbu-step-badge--done" aria-hidden="true">
                <Check className="dbu-step-badge-icon" />
              </span>
              <div className="dbu-step-meta">
                <p className="dbu-step-title">Download the template</p>
                <p className="dbu-step-desc">
                  Use this exact CSV layout — one debtor per row. The client, category, type and
                  currency will be set in the next step.
                </p>
              </div>
              <LoadingButton
                className="cf-btn-save dbu-download-btn"
                onClick={handleDownloadTemplate}
                loading={isDownloading}
                loadingText="Preparing…"
              >
                <Download className="dbu-btn-icon" />
                <span className="dbu-download-label">Template</span>
              </LoadingButton>
            </div>
          </div>

          {/* ── Step 2: Batch context ── */}
          <div className="dbu-step">
            <div className="dbu-step-head">
              <span
                className={`dbu-step-badge ${selectionsReady ? 'dbu-step-badge--done' : 'dbu-step-badge--active'}`}
                aria-hidden="true"
              >
                {selectionsReady ? <Check className="dbu-step-badge-icon" /> : '2'}
              </span>
              <div className="dbu-step-meta">
                <p className="dbu-step-title">Set the batch context</p>
                <p className="dbu-step-desc">
                  Every imported debtor will be tagged with all four selections. You can manage
                  these options under Settings.
                </p>
              </div>
            </div>

            <div className="dbu-form-grid">
              <div className="cf-field">
                <span className="cf-label">
                  <Building2 className="dbu-label-icon" />
                  Client <span className="cf-required" aria-hidden="true">*</span>
                </span>
                <ClientCombobox
                  clients={clients}
                  value={clientId}
                  onChange={setClientId}
                  disabled={isUploading || isLoadingLookups}
                  loading={isLoadingLookups}
                />
              </div>

              <div className="cf-field">
                <span className="cf-label">
                  <Layers className="dbu-label-icon" />
                  Debt Category <span className="cf-required" aria-hidden="true">*</span>
                </span>
                <div className="cf-select-wrap">
                  <select
                    className="cf-select"
                    value={debtCategoryId}
                    onChange={(e) => setDebtCategoryId(e.target.value)}
                    disabled={isUploading || isLoadingLookups}
                  >
                    <option value="">{isLoadingLookups ? 'Loading…' : 'Select a category…'}</option>
                    {activeCategories.map((c) => (
                      <option key={c.id} value={String(c.id)}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cf-field">
                <span className="cf-label">
                  <Tags className="dbu-label-icon" />
                  Debt Type <span className="cf-required" aria-hidden="true">*</span>
                </span>
                <div className="cf-select-wrap">
                  <select
                    className="cf-select"
                    value={debtTypeId}
                    onChange={(e) => setDebtTypeId(e.target.value)}
                    disabled={isUploading || isLoadingLookups}
                  >
                    <option value="">{isLoadingLookups ? 'Loading…' : 'Select a debt type…'}</option>
                    {activeTypes.map((t) => (
                      <option key={t.id} value={String(t.id)}>{t.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="cf-field">
                <span className="cf-label">
                  <Coins className="dbu-label-icon" />
                  Currency <span className="cf-required" aria-hidden="true">*</span>
                </span>
                <div className="cf-select-wrap">
                  <select
                    className="cf-select"
                    value={currencyId}
                    onChange={(e) => setCurrencyId(e.target.value)}
                    disabled={isUploading || isLoadingLookups}
                  >
                    <option value="">{isLoadingLookups ? 'Loading…' : 'Select a currency…'}</option>
                    {activeCurrencies.map((c) => (
                      <option key={c.id} value={String(c.id)}>
                        {c.code} — {c.name} ({c.symbol})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </div>
          </div>

          {/* ── Step 3: Upload file ── */}
          <div className="dbu-step">
            <div className="dbu-step-head">
              <span
                className={`dbu-step-badge ${
                  hasResult
                    ? 'dbu-step-badge--done'
                    : file
                      ? 'dbu-step-badge--active'
                      : 'dbu-step-badge--idle'
                }`}
                aria-hidden="true"
              >
                {hasResult ? <Check className="dbu-step-badge-icon" /> : '3'}
              </span>
              <div className="dbu-step-meta">
                <p className="dbu-step-title">Upload the filled CSV</p>
                <p className="dbu-step-desc">
                  Drag &amp; drop the file below or click to browse. Do not change the headers —
                  altered templates are rejected. Loan ID must be unique within the file; rows
                  missing any required column are skipped.
                </p>
              </div>
            </div>

            {/* Drag-and-drop zone */}
            <div
              className={`dbu-dropzone${isDragging ? ' dbu-dropzone--drag' : ''}${file ? ' dbu-dropzone--has-file' : ''}${isUploading ? ' dbu-dropzone--uploading' : ''}`}
              onDragEnter={handleDragEnter}
              onDragLeave={handleDragLeave}
              onDragOver={handleDragOver}
              onDrop={handleDrop}
              role="region"
              aria-label="File drop zone"
            >
              <input
                ref={inputRef}
                id="debtor-bulk-file"
                type="file"
                accept=".csv,text/csv"
                onChange={handleFileChange}
                disabled={isUploading}
                className="dbu-file-input"
                aria-label="Choose CSV file"
              />

              {isDragging ? (
                /* Drag-over state */
                <label htmlFor="debtor-bulk-file" className="dbu-dropzone-inner dbu-dropzone-inner--drag">
                  <div className="dbu-drop-icon-wrap" aria-hidden="true">
                    <FileUp className="dbu-drop-icon" />
                  </div>
                  <p className="dbu-drop-title">Drop it here</p>
                  <p className="dbu-drop-hint">Release to select this file</p>
                </label>
              ) : file ? (
                /* File selected */
                <label htmlFor="debtor-bulk-file" className="dbu-dropzone-inner dbu-dropzone-inner--file">
                  <div className="dbu-file-icon-wrap" aria-hidden="true">
                    <FileText className="dbu-file-icon" />
                  </div>
                  <div className="dbu-file-info">
                    <p className="dbu-file-name">{file.name}</p>
                    <p className="dbu-file-meta">
                      {(file.size / 1024).toFixed(1)} KB
                      <span className="dbu-file-meta-sep" aria-hidden="true">·</span>
                      <span className="dbu-file-replace">click to replace</span>
                    </p>
                  </div>
                  <span className="dbu-file-ready-badge" aria-label="File ready">
                    <Check className="dbu-file-ready-icon" />
                    Ready
                  </span>
                </label>
              ) : (
                /* Idle — no file chosen */
                <label htmlFor="debtor-bulk-file" className="dbu-dropzone-inner">
                  <div className="dbu-idle-icon-wrap" aria-hidden="true">
                    <Upload className="dbu-idle-icon" />
                  </div>
                  <div className="dbu-idle-text">
                    <p className="dbu-idle-title">
                      Drag &amp; drop your CSV file here,
                    </p>
                    <p className="dbu-idle-sub">
                      or{' '}
                      <span className="dbu-idle-browse">browse to choose a file</span>
                    </p>
                  </div>
                  <p className="dbu-idle-constraint">CSV only · max 5 MB · max 1,000 rows</p>
                </label>
              )}
            </div>
          </div>

          {/* ── Batch context summary strip (only once all four chosen and file ready) ── */}
          {selectionsReady && file && !hasResult && (
            <div className="dbu-batch-summary">
              <span className="dbu-batch-label">Uploading for</span>
              <div className="dbu-batch-chips">
                <span className="dbu-batch-chip">
                  <Building2 className="dbu-batch-chip-icon" />
                  {selectedClient?.name}
                </span>
                <span className="dbu-batch-chip">
                  <Layers className="dbu-batch-chip-icon" />
                  {selectedCategory?.name}
                </span>
                <span className="dbu-batch-chip">
                  <Tags className="dbu-batch-chip-icon" />
                  {selectedType?.name}
                </span>
                <span className="dbu-batch-chip">
                  <Coins className="dbu-batch-chip-icon" />
                  {selectedCurrency?.code}
                </span>
              </div>
            </div>
          )}

          {/* ── Error ── */}
          {error && (
            <div className="cf-callout cf-callout-error">
              <div className="cf-callout-icon cf-callout-icon-error" aria-hidden="true">
                <AlertTriangle className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">{error}</p>
            </div>
          )}

          {/* ── Upload result ── */}
          {hasResult && (
            <div className="cf-upload-results">
              <div className="cf-upload-result-summary">
                <div className="cf-upload-result-stat cf-upload-result-stat-ok">
                  <CheckCircle2 className="cf-upload-result-icon" />
                  <span><strong>{createdCount}</strong> imported</span>
                </div>
                <div className={`cf-upload-result-stat ${hasFailures ? 'cf-upload-result-stat-warn' : ''}`}>
                  <AlertTriangle className="cf-upload-result-icon" />
                  <span><strong>{failedCount}</strong> skipped</span>
                </div>
              </div>

              {hasFailures && (
                <div className="cf-upload-failed-list">
                  <p className="cf-upload-failed-header">Rows that could not be imported</p>
                  <div className="cf-upload-failed-rows">
                    {result.failed.map((f, i) => (
                      <div className="cf-upload-failed-row" key={`${f.row}-${i}`}>
                        <span className="cf-upload-failed-rownum">Row {f.row}</span>
                        <span className="cf-upload-failed-name">{f.name || '—'}</span>
                        <span className="cf-upload-failed-reason">{f.message}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <button
                type="button"
                className="cf-upload-reset"
                onClick={handleReset}
                disabled={isUploading}
              >
                <RotateCcw className="cf-upload-btn-icon" />
                Upload another file
              </button>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="cf-footer">
          <button
            type="button"
            className="cf-btn-cancel"
            onClick={onClose}
            disabled={isUploading}
          >
            Close
          </button>
          {!hasResult && (
            <LoadingButton
              className="cf-btn-save"
              onClick={handleUpload}
              loading={isUploading}
              loadingText="Uploading…"
              disabled={!canUpload}
            >
              <Upload className="dbu-btn-icon" />
              Upload &amp; Import
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default DebtorBulkUploadModal;
