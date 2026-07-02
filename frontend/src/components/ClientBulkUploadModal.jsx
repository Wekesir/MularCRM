import { useEffect, useRef, useState } from 'react';
import {
  X,
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  AlertTriangle,
  FileUp,
  RotateCcw,
} from 'lucide-react';
import LoadingButton from './LoadingButton';
import { downloadClientTemplate, bulkUploadClients } from '../api/clients';

function ClientBulkUploadModal({ open, onClose, onCompleted }) {
  const [file, setFile] = useState(null);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => {
      if (e.key === 'Escape' && !isUploading) onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, isUploading, onClose]);

  // Reset transient state whenever the modal is (re)opened.
  useEffect(() => {
    if (open) {
      setFile(null);
      setResult(null);
      setError('');
    }
  }, [open]);

  if (!open) return null;

  const handleDownloadTemplate = async () => {
    setIsDownloading(true);
    try {
      await downloadClientTemplate();
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to download template.');
    } finally {
      setIsDownloading(false);
    }
  };

  const handleFileChange = (e) => {
    setError('');
    setResult(null);
    const selected = e.target.files?.[0];
    if (!selected) {
      setFile(null);
      return;
    }
    if (!selected.name.toLowerCase().endsWith('.xlsx')) {
      setFile(null);
      setError('Only Excel (.xlsx) files are accepted. Please download the template and upload it as .xlsx.');
      if (inputRef.current) inputRef.current.value = '';
      return;
    }
    setFile(selected);
  };

  const handleUpload = async () => {
    if (!file) {
      setError('Please choose an .xlsx file to upload.');
      return;
    }
    setIsUploading(true);
    setError('');
    try {
      const res = await bulkUploadClients(file);
      setResult(res);
      if (typeof onCompleted === 'function') {
        onCompleted(res);
      }
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

  return (
    <div className="modal-backdrop modal-backdrop-static" role="presentation">
      <div
        className="modal-panel cf-panel cf-panel-wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby="bulk-upload-title"
      >
        <div className="cf-accent-strip" aria-hidden="true" />

        {/* Header */}
        <div className="cf-header">
          <div className="cf-header-identity">
            <div className="cf-header-icon" aria-hidden="true">
              <Upload className="cf-header-icon-svg" />
            </div>
            <div>
              <h2 id="bulk-upload-title" className="cf-title">Bulk Upload Clients</h2>
              <p className="cf-subtitle">
                Onboard many clients at once from an Excel workbook matching the template.
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

        {/* Body */}
        <div className="cf-body">
          {/* Step 1 — download template */}
          <div className="cf-upload-step">
            <div className="cf-upload-step-number" aria-hidden="true">1</div>
            <div className="cf-upload-step-text">
              <p className="cf-upload-step-title">Download the template</p>
              <p className="cf-upload-step-desc">
                Use this exact workbook. The Business&nbsp;Type column has a built-in
                dropdown of accepted values so you can fill it in without errors.
              </p>
            </div>
            <LoadingButton
              className="cf-btn-save cf-upload-download-btn"
              onClick={handleDownloadTemplate}
              loading={isDownloading}
              loadingText="Preparing…"
            >
              <Download className="cf-upload-btn-icon" />
              Download Template
            </LoadingButton>
          </div>

          {/* Step 2 — choose file */}
          <div className="cf-upload-step">
            <div className="cf-upload-step-number" aria-hidden="true">2</div>
            <div className="cf-upload-step-text">
              <p className="cf-upload-step-title">Fill it in &amp; upload</p>
              <p className="cf-upload-step-desc">
                One client per row starting from row&nbsp;3. Email must be unique within
                the file and against existing clients. Maximum 500 rows per upload.
              </p>
            </div>
          </div>

          <label className="cf-upload-dropzone" htmlFor="cf-bulk-file">
            <input
              ref={inputRef}
              id="cf-bulk-file"
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={handleFileChange}
              disabled={isUploading}
              className="cf-upload-input"
            />
            <div className="cf-upload-dropzone-icon" aria-hidden="true">
              {file ? <FileSpreadsheet className="cf-upload-dropzone-svg" /> : <FileUp className="cf-upload-dropzone-svg" />}
            </div>
            {file ? (
              <div className="cf-upload-dropzone-info">
                <p className="cf-upload-dropzone-filename">{file.name}</p>
                <p className="cf-upload-dropzone-meta">
                  {(file.size / 1024).toFixed(1)} KB · click to replace
                </p>
              </div>
            ) : (
              <div className="cf-upload-dropzone-info">
                <p className="cf-upload-dropzone-filename">Click to choose an .xlsx file</p>
                <p className="cf-upload-dropzone-meta">Excel workbook only — .xlsx</p>
              </div>
            )}
          </label>

          {error && (
            <div className="cf-callout cf-callout-error">
              <div className="cf-callout-icon cf-callout-icon-error" aria-hidden="true">
                <AlertTriangle className="cf-callout-icon-svg" />
              </div>
              <p className="cf-callout-text">{error}</p>
            </div>
          )}

          {/* Results */}
          {hasResult && (
            <div className="cf-upload-results">
              <div className="cf-upload-result-summary">
                <div className="cf-upload-result-stat cf-upload-result-stat-ok">
                  <CheckCircle2 className="cf-upload-result-icon" />
                  <span><strong>{createdCount}</strong> onboarded</span>
                </div>
                <div className={`cf-upload-result-stat ${hasFailures ? 'cf-upload-result-stat-warn' : ''}`}>
                  <AlertTriangle className="cf-upload-result-icon" />
                  <span><strong>{failedCount}</strong> skipped</span>
                </div>
              </div>

              {hasFailures && (
                <div className="cf-upload-failed-list">
                  <p className="cf-upload-failed-header">
                    Rows that could not be imported
                  </p>
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
              disabled={!file}
            >
              <Upload className="cf-upload-btn-icon" />
              Upload &amp; Import
            </LoadingButton>
          )}
        </div>
      </div>
    </div>
  );
}

export default ClientBulkUploadModal;
