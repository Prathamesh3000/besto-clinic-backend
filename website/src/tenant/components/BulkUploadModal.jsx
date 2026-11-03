import { useState, useCallback, useMemo, useRef } from 'react';
import Papa from 'papaparse';
import { Modal } from '../../platform/components/shared';
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2,
  XCircle, Download, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Loader2, Trash2,
} from 'lucide-react';

const MAX_ROWS = 5000;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const PAGE_SIZE = 50;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// ─── Pure helpers ──────────────────────────────────

const matchOption = (col, value) => {
  const lower = String(value).trim().toLowerCase();
  return col.options.find((o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower);
};

const isIsoDate = (v) => /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

// Column keys the server validates specially (matching the API row schemas).
const EMAIL_KEYS = new Set(['email', 'supplier.contactEmail']);
const DATE_KEYS = new Set(['dateOfBirth', 'expiryDate']);
// key -> whole number only?
const NUMBER_KEYS = { currentStock: true, minimumThreshold: true, costPerUnit: false, consultationFee: false };
const isValidNumber = (v, wholeOnly) => {
  const n = Number(v);
  return Number.isFinite(n) && n >= 0 && (!wholeOnly || Number.isInteger(n));
};

/** { [column key]: message } for every cell of a row that would be rejected. */
const validateValues = (columns, values) => {
  const errs = {};
  for (const col of columns) {
    const v = String(values[col.key] ?? '').trim();
    if (!v) {
      if (col.required) errs[col.key] = `${col.label} is required`;
      continue;
    }
    if (col.options?.length && !matchOption(col, v)) {
      errs[col.key] = `${col.label} must be one of: ${col.options.map((o) => o.label).join(', ')}`;
    } else if (col.key === 'phone' && (v.length < 10 || v.length > 15)) {
      // Same 10-15 character rule the patient, doctor and staff APIs enforce.
      errs[col.key] = 'Phone must be 10-15 characters';
    } else if (EMAIL_KEYS.has(col.key) && !EMAIL_RE.test(v)) {
      errs[col.key] = 'Enter a valid email address';
    } else if (DATE_KEYS.has(col.key) && !isIsoDate(v)) {
      errs[col.key] = 'Use the format YYYY-MM-DD';
    } else if (col.key === 'password' && !(v.length >= 8 && /[a-z]/.test(v) && /[A-Z]/.test(v) && /\d/.test(v))) {
      errs[col.key] = 'Password needs 8+ characters with an uppercase letter, a lowercase letter and a digit';
    } else if (col.key in NUMBER_KEYS && !isValidNumber(v, NUMBER_KEYS[col.key])) {
      errs[col.key] = NUMBER_KEYS[col.key] ? `${col.label} must be a whole number, 0 or more` : `${col.label} must be a number, 0 or more`;
    }
  }
  return errs;
};

/** Flat { 'address.city': 'Pune' } -> nested API payload; dropdown values are normalised. */
const toNested = (columns, values) => {
  const obj = {};
  for (const col of columns) {
    let value = String(values[col.key] ?? '').trim();
    if (!value) continue;
    if (col.options?.length) value = matchOption(col, value)?.value ?? value;

    const parts = col.key.split('.');
    let ref = obj;
    for (let i = 0; i < parts.length - 1; i++) {
      if (!ref[parts[i]]) ref[parts[i]] = {};
      ref = ref[parts[i]];
    }
    ref[parts[parts.length - 1]] = value;
  }
  return obj;
};

/**
 * Reusable Bulk CSV Upload modal with 4-step flow:
 *   UPLOAD → PREVIEW (editable) → IMPORTING → RESULT
 *
 * Every row is shown in the preview and every cell can be edited; a row is imported
 * only once it passes validation, so a few bad values never block the rest of a file.
 * Rows the server still rejects can be sent back to the editor from the result step.
 *
 * Props:
 *   open            boolean
 *   onClose         () => void
 *   entityName      string  e.g. "Branches"
 *   columns         [{ key, label, required?, example?, options? }]
 *   onImport        (rows) => Promise<{ data: { successCount, errorCount, errors } }>
 *                   (error `row` = 1-based position in the array passed in)
 *   onRefresh       () => void   — called after a successful import
 */
export default function BulkUploadModal({ open, onClose, entityName, columns, onImport, onRefresh }) {
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [rows, setRows] = useState([]); // [{ id, src, values, serverError? }]
  const [uploadError, setUploadError] = useState('');
  const [page, setPage] = useState(0);
  const [onlyProblems, setOnlyProblems] = useState(false);
  const [importResult, setImportResult] = useState(null);
  const [failedRows, setFailedRows] = useState([]);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);
  const nextId = useRef(1);

  // ─── Reset ─────────────────────────────────────
  const reset = () => {
    setStep('upload');
    setFile(null);
    setRows([]);
    setUploadError('');
    setPage(0);
    setOnlyProblems(false);
    setImportResult(null);
    setFailedRows([]);
    setErrorsExpanded(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  // ─── Template download ─────────────────────────
  const downloadTemplate = () => {
    const header = columns.map((c) => c.label).join(',');
    const example = columns.map((c) => c.example || '').join(',');
    const hasOptions = columns.some((c) => c.options?.length);
    const hints = hasOptions
      ? columns.map((c) => c.options?.length ? c.options.map((o) => o.value).join(' | ') : '').join(',')
      : '';
    const csv = hints
      ? `${header}\n# Valid values: ${hints}\n${example}\n`
      : `${header}\n${example}\n`;
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityName.toLowerCase()}_template.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Parse CSV ─────────────────────────────────
  const handleFile = useCallback((f) => {
    if (!f) return;
    setUploadError('');

    if (f.size > MAX_FILE_SIZE) {
      setUploadError(`File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.`);
      return;
    }

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        // `src` is the row's position in the file, kept so errors still point at the
        // right line after rows are edited, filtered or deleted.
        const data = result.data
          .map((r, i) => ({ r, src: i + 1 }))
          // The template's "# Valid values" hint line is not a record.
          .filter(({ r }) => !String(Object.values(r).find((v) => String(v).trim()) ?? '').trim().startsWith('#'));

        if (data.length === 0) {
          setUploadError('No rows found in this file.');
          return;
        }
        if (data.length > MAX_ROWS) {
          setUploadError(`This file has ${data.length.toLocaleString()} rows. The limit is ${MAX_ROWS.toLocaleString()} per upload - please split it.`);
          return;
        }

        setFile(f);
        setRows(data.map(({ r, src }) => {
          const values = {};
          for (const col of columns) {
            const raw = r[col.label] ?? r[col.key] ?? '';
            values[col.key] = typeof raw === 'string' ? raw.trim() : String(raw);
          }
          return { id: nextId.current++, src, values };
        }));
        setPage(0);
        setOnlyProblems(false);
        setStep('preview');
      },
      error: () => {
        setUploadError('Failed to parse CSV. Please check the file format.');
      },
    });
  }, [columns]);

  const onDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files?.[0];
    if (f && (f.type === 'text/csv' || f.name.endsWith('.csv'))) handleFile(f);
  }, [handleFile]);

  const onDragOver = (e) => { e.preventDefault(); setDragOver(true); };
  const onDragLeave = () => setDragOver(false);

  // ─── Live validation ───────────────────────────
  const checked = useMemo(
    () => rows.map((r) => {
      const errs = validateValues(columns, r.values);
      return { ...r, errs, hasProblem: Object.keys(errs).length > 0 || !!r.serverError };
    }),
    [rows, columns],
  );
  const validCount = checked.filter((r) => !r.hasProblem).length;
  const problemCount = checked.length - validCount;

  const shown = onlyProblems ? checked.filter((r) => r.hasProblem) : checked;
  const pageCount = Math.max(1, Math.ceil(shown.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = shown.slice(safePage * PAGE_SIZE, (safePage + 1) * PAGE_SIZE);

  const updateCell = (id, key, value) => {
    setRows((prev) => prev.map((r) => (
      r.id === id ? { ...r, values: { ...r.values, [key]: value }, serverError: undefined } : r
    )));
  };
  const removeRow = (id) => setRows((prev) => prev.filter((r) => r.id !== id));

  // ─── Import ────────────────────────────────────
  const handleImport = async () => {
    const toSend = checked.filter((r) => !r.hasProblem);
    setStep('importing');
    try {
      const res = await onImport(toSend.map((r) => toNested(columns, r.values)));
      const data = res?.data ?? res;

      // Server rows are positions in what we sent; map them back to file rows.
      const failed = new Map();
      const errors = (data.errors || []).map((e) => {
        const sent = e.row >= 1 ? toSend[e.row - 1] : null;
        if (sent) failed.set(sent.id, { ...sent, serverError: e.message });
        return { ...e, row: sent ? sent.src : e.row };
      });
      setFailedRows([...failed.values()].map((r) => ({ id: r.id, src: r.src, values: r.values, serverError: r.serverError })));
      setImportResult({ ...data, errors });
      setStep('result');
      if (data.successCount > 0) onRefresh?.();
    } catch (err) {
      setFailedRows([]);
      setImportResult({
        successCount: 0,
        errorCount: toSend.length,
        errors: [{ row: 0, message: err.message || 'Import failed' }],
      });
      setStep('result');
    }
  };

  const retryFailed = () => {
    setRows(failedRows);
    setImportResult(null);
    setPage(0);
    setOnlyProblems(true);
    setErrorsExpanded(false);
    setStep('preview');
  };

  // ─── Error report download ─────────────────────
  const downloadErrorReport = () => {
    const rowIssues = checked
      .filter((r) => r.hasProblem)
      .map((r) => ({ row: r.src, message: r.serverError || Object.values(r.errs).join('; ') }));
    const allErrors = importResult ? (importResult.errors || []) : rowIssues;
    if (allErrors.length === 0) return;

    const csv = 'Row,Error\n' + allErrors.map((e) => `${e.row},"${(e.message || '').replace(/"/g, '""')}"`).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${entityName.toLowerCase()}_errors.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // ─── Preview cell ──────────────────────────────
  const renderCell = (row, col) => {
    const err = row.errs[col.key];
    const cls = `w-full min-w-[110px] px-2 py-1 text-xs rounded border bg-white focus:outline-none focus:ring-1 ${
      err ? 'border-red-300 bg-red-50 focus:ring-red-300' : 'border-transparent hover:border-neutral-200 focus:border-primary-300 focus:ring-primary-200'
    }`;
    const value = row.values[col.key] ?? '';
    if (col.options?.length) {
      const known = !value || matchOption(col, value);
      return (
        <select
          value={known ? (matchOption(col, value)?.value ?? '') : value}
          onChange={(e) => updateCell(row.id, col.key, e.target.value)}
          title={err}
          aria-label={`${col.label}, row ${row.src}`}
          className={cls}
        >
          <option value="">—</option>
          {!known && <option value={value}>{value}</option>}
          {col.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      );
    }
    return (
      <input
        value={value}
        onChange={(e) => updateCell(row.id, col.key, e.target.value)}
        title={err}
        aria-label={`${col.label}, row ${row.src}`}
        aria-invalid={!!err}
        className={cls}
      />
    );
  };

  // ─── Render body ───────────────────────────────
  const renderBody = () => {
    // ── STEP 1: Upload ──
    if (step === 'upload') {
      return (
        <div className="space-y-4">
          <div
            onDrop={onDrop}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onClick={() => fileRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
              dragOver ? 'border-primary-400 bg-primary-50' : 'border-neutral-200 hover:border-primary-300 hover:bg-neutral-50'
            }`}
          >
            <Upload className="h-8 w-8 mx-auto text-neutral-400 mb-3" />
            <p className="text-sm font-medium text-neutral-700">
              Drop your CSV file here, or <span className="text-primary-600">browse</span>
            </p>
            <p className="text-xs text-neutral-400 mt-1">CSV only &middot; Up to {MAX_ROWS.toLocaleString()} rows &middot; Max 5MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => { handleFile(e.target.files?.[0]); e.target.value = ''; }}
            />
          </div>

          {uploadError && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
              {uploadError}
            </div>
          )}

          <button
            onClick={downloadTemplate}
            className="inline-flex items-center gap-2 text-xs font-medium text-primary-600 hover:text-primary-700 transition"
          >
            <Download className="h-3.5 w-3.5" /> Download CSV Template
          </button>
        </div>
      );
    }

    // ── STEP 2: Preview (editable) ──
    if (step === 'preview') {
      return (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <div className="flex items-center gap-1.5 text-neutral-700">
              <FileSpreadsheet className="h-4 w-4 text-neutral-400" />
              <span className="font-medium">{file?.name}</span>
            </div>
            <span className="text-neutral-600">{checked.length.toLocaleString()} rows</span>
            <span className="text-emerald-600 font-medium">{validCount.toLocaleString()} ready</span>
            {problemCount > 0 && (
              <span className="text-red-600 font-medium">{problemCount.toLocaleString()} need fixing</span>
            )}
          </div>

          {problemCount > 0 && (
            <div className="flex flex-wrap items-center justify-between gap-2 bg-amber-50 border border-amber-100 rounded-lg px-4 py-2.5 text-xs text-amber-800">
              <span className="flex items-center gap-1.5">
                <AlertCircle className="h-4 w-4 shrink-0" />
                Click any highlighted cell to correct it. Rows still marked red are skipped.
              </span>
              <span className="flex items-center gap-3">
                <label className="inline-flex items-center gap-1.5 font-medium cursor-pointer">
                  <input
                    type="checkbox"
                    checked={onlyProblems}
                    onChange={(e) => { setOnlyProblems(e.target.checked); setPage(0); }}
                  />
                  Show only rows to fix
                </label>
                <button onClick={downloadErrorReport} className="inline-flex items-center gap-1 font-medium hover:underline">
                  <Download className="h-3.5 w-3.5" /> Error list
                </button>
              </span>
            </div>
          )}

          {/* Editable table */}
          <div className="border border-neutral-200 rounded-lg overflow-auto max-h-[50vh]">
            <table className="w-full text-xs">
              <thead className="sticky top-0 z-10">
                <tr className="bg-neutral-50">
                  <th className="px-3 py-2 text-left font-semibold text-neutral-500">#</th>
                  {columns.map((c) => (
                    <th key={c.key} className="px-2 py-2 text-left whitespace-nowrap">
                      <span className="font-semibold text-neutral-500">
                        {c.label} {c.required && <span className="text-red-400">*</span>}
                      </span>
                    </th>
                  ))}
                  <th className="px-2 py-2 text-left font-semibold text-neutral-500">Issue</th>
                  <th className="px-2 py-2" />
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {pageRows.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 3} className="px-3 py-8 text-center text-neutral-400">
                      {onlyProblems ? 'No rows need fixing.' : 'No rows left.'}
                    </td>
                  </tr>
                )}
                {pageRows.map((row) => (
                  <tr key={row.id} className={row.hasProblem ? 'bg-red-50/40' : ''}>
                    <td className="px-3 py-1.5 text-neutral-400 font-mono">{row.src}</td>
                    {columns.map((c) => (
                      <td key={c.key} className="px-1 py-1">{renderCell(row, c)}</td>
                    ))}
                    <td className="px-2 py-1.5 text-red-600 min-w-[160px]">
                      {row.serverError || Object.values(row.errs)[0] || ''}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => removeRow(row.id)}
                        aria-label={`Remove row ${row.src}`}
                        title="Remove this row"
                        className="text-neutral-300 hover:text-red-500 transition"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {shown.length > PAGE_SIZE && (
            <div className="flex items-center justify-between text-xs text-neutral-500">
              <span>
                Rows {safePage * PAGE_SIZE + 1}-{Math.min((safePage + 1) * PAGE_SIZE, shown.length)} of {shown.length.toLocaleString()}
              </span>
              <span className="flex items-center gap-2">
                <button
                  onClick={() => setPage(Math.max(0, safePage - 1))}
                  disabled={safePage === 0}
                  aria-label="Previous page"
                  className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                Page {safePage + 1} of {pageCount}
                <button
                  onClick={() => setPage(Math.min(pageCount - 1, safePage + 1))}
                  disabled={safePage >= pageCount - 1}
                  aria-label="Next page"
                  className="p-1 rounded hover:bg-neutral-100 disabled:opacity-30"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </span>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <button
              onClick={reset}
              className="text-sm font-medium text-neutral-500 hover:text-neutral-700 transition"
            >
              Upload Different File
            </button>
            <button
              onClick={handleImport}
              disabled={validCount === 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition disabled:opacity-50"
            >
              Import {validCount.toLocaleString()} Row{validCount !== 1 ? 's' : ''}
              {problemCount > 0 && ` (skip ${problemCount.toLocaleString()})`}
            </button>
          </div>
        </div>
      );
    }

    // ── STEP 3: Importing ──
    if (step === 'importing') {
      return (
        <div className="flex flex-col items-center justify-center py-12 space-y-4">
          <Loader2 className="h-8 w-8 text-primary-600 animate-spin" />
          <p className="text-sm font-medium text-neutral-700">
            Importing {validCount.toLocaleString()} record{validCount !== 1 ? 's' : ''}...
          </p>
          <p className="text-xs text-neutral-400">Large files are sent in batches. Please keep this window open.</p>
        </div>
      );
    }

    // ── STEP 4: Result ──
    if (step === 'result' && importResult) {
      const allErrors = [...(importResult.errors || [])];
      return (
        <div className="space-y-4">
          {/* Success/Failure counts */}
          <div className="flex gap-4">
            {importResult.successCount > 0 && (
              <div className="flex-1 bg-emerald-50 border border-emerald-100 rounded-xl p-4 flex items-center gap-3">
                <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-emerald-700">{importResult.successCount}</p>
                  <p className="text-xs text-emerald-600">Successfully imported</p>
                </div>
              </div>
            )}
            {importResult.errorCount > 0 && (
              <div className="flex-1 bg-red-50 border border-red-100 rounded-xl p-4 flex items-center gap-3">
                <XCircle className="h-6 w-6 text-red-600 shrink-0" />
                <div>
                  <p className="text-lg font-bold text-red-700">{importResult.errorCount}</p>
                  <p className="text-xs text-red-600">Failed to import</p>
                </div>
              </div>
            )}
          </div>

          {/* Error details */}
          {allErrors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-red-700"
              >
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> {allErrors.length} error{allErrors.length !== 1 ? 's' : ''}
                </span>
                {errorsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {errorsExpanded && (
                <div className="px-4 pb-3 max-h-40 overflow-y-auto space-y-1">
                  {allErrors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      {e.row ? <span className="font-semibold">Row {e.row}: </span> : null}
                      {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div className="flex items-center gap-4">
              {allErrors.length > 0 && (
                <button
                  onClick={downloadErrorReport}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition"
                >
                  <Download className="h-3.5 w-3.5" /> Download Error Report
                </button>
              )}
              {failedRows.length > 0 && (
                <button
                  onClick={retryFailed}
                  className="text-xs font-semibold text-primary-600 hover:text-primary-700 transition"
                >
                  Fix &amp; retry {failedRows.length} failed row{failedRows.length !== 1 ? 's' : ''}
                </button>
              )}
            </div>
            <div className="ml-auto">
              <button
                onClick={handleClose}
                className="px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      );
    }

    return null;
  };

  return (
    <Modal
      open={open}
      onClose={step === 'importing' ? undefined : handleClose}
      title={`Bulk Import ${entityName}`}
      wide
    >
      {renderBody()}
    </Modal>
  );
}
