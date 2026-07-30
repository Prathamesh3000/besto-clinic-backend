import { useState, useCallback, useRef } from 'react';
import Papa from 'papaparse';
import { Modal } from '../../platform/components/shared';
import {
  Upload, FileSpreadsheet, AlertCircle, CheckCircle2,
  XCircle, Download, ChevronDown, ChevronUp, Loader2,
} from 'lucide-react';

const MAX_ROWS = 500;
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB

const STEPS = ['upload', 'preview', 'importing', 'result'];

/**
 * Reusable Bulk CSV Upload modal with 4-step flow:
 *   UPLOAD → PREVIEW → IMPORTING → RESULT
 *
 * Props:
 *   open            boolean
 *   onClose         () => void
 *   entityName      string  e.g. "Branches"
 *   columns         [{ key, label, required?, example? }]
 *   onImport        (rows) => Promise<{ data: { successCount, errorCount, errors } }>
 *   onRefresh       () => void   — called after a successful import
 */
export default function BulkUploadModal({ open, onClose, entityName, columns, onImport, onRefresh }) {
  const [step, setStep] = useState('upload');
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validRows, setValidRows] = useState([]);
  const [rowErrors, setRowErrors] = useState([]); // [{ row, message }]
  const [importResult, setImportResult] = useState(null);
  const [errorsExpanded, setErrorsExpanded] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const fileRef = useRef(null);

  // ─── Reset ─────────────────────────────────────
  const reset = () => {
    setStep('upload');
    setFile(null);
    setParsedRows([]);
    setValidRows([]);
    setRowErrors([]);
    setImportResult(null);
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

  // ─── Nested field builder ──────────────────────
  const buildNestedRow = (flatRow) => {
    const obj = {};
    for (const col of columns) {
      const rawValue = flatRow[col.label] ?? flatRow[col.key] ?? '';
      const value = typeof rawValue === 'string' ? rawValue.trim() : rawValue;
      if (!value && value !== 0) continue;

      if (col.key.includes('.')) {
        const parts = col.key.split('.');
        let ref = obj;
        for (let i = 0; i < parts.length - 1; i++) {
          if (!ref[parts[i]]) ref[parts[i]] = {};
          ref = ref[parts[i]];
        }
        ref[parts[parts.length - 1]] = value;
      } else {
        obj[col.key] = value;
      }
    }
    return obj;
  };

  // ─── Client-side validation ────────────────────
  const validateRow = (nested, rowIndex) => {
    const errors = [];
    for (const col of columns) {
      const parts = col.key.split('.');
      let val = nested;
      for (const p of parts) val = val?.[p];

      if (col.required && !val && val !== 0) {
        errors.push(`${col.label} is required`);
        continue;
      }

      // Validate against allowed options (case-insensitive match on value or label)
      if (col.options?.length && val) {
        const lower = String(val).toLowerCase();
        const match = col.options.some(
          (o) => o.value.toLowerCase() === lower || o.label.toLowerCase() === lower,
        );
        if (!match) {
          errors.push(`${col.label} must be one of: ${col.options.map((o) => o.label).join(', ')}`);
        }
      }
    }
    return errors.length > 0 ? { row: rowIndex + 1, message: errors.join('; ') } : null;
  };

  // ─── Parse CSV ─────────────────────────────────
  const handleFile = useCallback((f) => {
    if (!f) return;

    if (f.size > MAX_FILE_SIZE) {
      setRowErrors([{ row: 0, message: `File too large (${(f.size / 1024 / 1024).toFixed(1)}MB). Maximum is 5MB.` }]);
      return;
    }

    setFile(f);

    Papa.parse(f, {
      header: true,
      skipEmptyLines: true,
      complete: (result) => {
        const rows = result.data.slice(0, MAX_ROWS);
        setParsedRows(rows);

        const nested = rows.map((r) => buildNestedRow(r));
        const errors = [];
        const valid = [];

        nested.forEach((row, i) => {
          const err = validateRow(row, i);
          if (err) errors.push(err);
          else valid.push(row);
        });

        setValidRows(valid);
        setRowErrors(errors);
        setStep('preview');
      },
      error: () => {
        setRowErrors([{ row: 0, message: 'Failed to parse CSV. Please check the file format.' }]);
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

  // ─── Import ────────────────────────────────────
  const handleImport = async () => {
    setStep('importing');
    try {
      const res = await onImport(validRows);
      const data = res?.data ?? res;
      setImportResult(data);
      setStep('result');
      if (data.successCount > 0) onRefresh?.();
    } catch (err) {
      setImportResult({
        successCount: 0,
        errorCount: validRows.length,
        errors: [{ row: 0, message: err.message || 'Import failed' }],
      });
      setStep('result');
    }
  };

  // ─── Error report download ─────────────────────
  const downloadErrorReport = () => {
    const allErrors = [
      ...rowErrors,
      ...(importResult?.errors || []),
    ];
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
            <p className="text-xs text-neutral-400 mt-1">CSV only &middot; Max {MAX_ROWS} rows &middot; Max 5MB</p>
            <input
              ref={fileRef}
              type="file"
              accept=".csv"
              className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])}
            />
          </div>

          {rowErrors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg px-4 py-3 text-sm text-red-700">
              {rowErrors[0].message}
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

    // ── STEP 2: Preview ──
    if (step === 'preview') {
      const previewRows = parsedRows.slice(0, 10);
      const visibleCols = columns.slice(0, 6);
      return (
        <div className="space-y-4">
          {/* Summary */}
          <div className="flex items-center gap-4 text-sm">
            <div className="flex items-center gap-1.5 text-neutral-700">
              <FileSpreadsheet className="h-4 w-4 text-neutral-400" />
              <span className="font-medium">{file?.name}</span>
            </div>
            <span className="text-neutral-400">&middot;</span>
            <span className="text-neutral-600">{parsedRows.length} rows parsed</span>
            <span className="text-neutral-400">&middot;</span>
            <span className="text-emerald-600 font-medium">{validRows.length} valid</span>
            {rowErrors.length > 0 && (
              <>
                <span className="text-neutral-400">&middot;</span>
                <span className="text-red-600 font-medium">{rowErrors.length} errors</span>
              </>
            )}
          </div>

          {/* Error list (collapsible) */}
          {rowErrors.length > 0 && (
            <div className="bg-red-50 border border-red-100 rounded-lg overflow-hidden">
              <button
                onClick={() => setErrorsExpanded(!errorsExpanded)}
                className="w-full flex items-center justify-between px-4 py-2.5 text-sm font-medium text-red-700"
              >
                <span className="flex items-center gap-1.5">
                  <AlertCircle className="h-4 w-4" /> {rowErrors.length} validation error{rowErrors.length !== 1 ? 's' : ''}
                </span>
                {errorsExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </button>
              {errorsExpanded && (
                <div className="px-4 pb-3 max-h-40 overflow-y-auto space-y-1">
                  {rowErrors.map((e, i) => (
                    <p key={i} className="text-xs text-red-600">
                      <span className="font-semibold">Row {e.row}:</span> {e.message}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Preview table */}
          <div className="border border-neutral-200 rounded-lg overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-neutral-50">
                  <th className="px-3 py-2 text-left font-semibold text-neutral-500">#</th>
                  {visibleCols.map((c) => (
                    <th key={c.key} className="px-3 py-2 text-left">
                      <span className="font-semibold text-neutral-500">
                        {c.label} {c.required && <span className="text-red-400">*</span>}
                      </span>
                      {c.options?.length > 0 && (
                        <div className="font-normal text-neutral-400 text-[10px] mt-0.5">
                          {c.options.map((o) => o.label).join(' \u00b7 ')}
                        </div>
                      )}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-100">
                {previewRows.map((row, ri) => {
                  const hasError = rowErrors.some((e) => e.row === ri + 1);
                  return (
                    <tr key={ri} className={hasError ? 'bg-red-50/50' : ''}>
                      <td className="px-3 py-2 text-neutral-400 font-mono">{ri + 1}</td>
                      {visibleCols.map((c) => (
                        <td key={c.key} className="px-3 py-2 text-neutral-700 max-w-[160px] truncate">
                          {row[c.label] || row[c.key] || <span className="text-neutral-300">—</span>}
                        </td>
                      ))}
                    </tr>
                  );
                })}
              </tbody>
            </table>
            {parsedRows.length > 10 && (
              <div className="px-3 py-2 bg-neutral-50 text-xs text-neutral-400 text-center">
                Showing first 10 of {parsedRows.length} rows
              </div>
            )}
          </div>

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
              disabled={validRows.length === 0}
              className="px-5 py-2 text-sm font-semibold text-white bg-primary-600 hover:bg-primary-700 rounded-xl shadow-sm transition disabled:opacity-50"
            >
              Import {validRows.length} Valid Row{validRows.length !== 1 ? 's' : ''}
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
            Importing {validRows.length} record{validRows.length !== 1 ? 's' : ''}...
          </p>
          <div className="w-64 h-2 bg-neutral-100 rounded-full overflow-hidden">
            <div className="h-full bg-primary-500 rounded-full animate-pulse" style={{ width: '60%' }} />
          </div>
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
            {allErrors.length > 0 && (
              <button
                onClick={downloadErrorReport}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-red-600 hover:text-red-700 transition"
              >
                <Download className="h-3.5 w-3.5" /> Download Error Report
              </button>
            )}
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
