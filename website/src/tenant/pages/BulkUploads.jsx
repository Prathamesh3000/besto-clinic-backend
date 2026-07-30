import { useState, useCallback, useEffect, useMemo } from 'react';
import {
  Upload, Stethoscope, UserCog, Users, Package, Download, ChevronDown, ChevronUp,
  CheckCircle2, XCircle, FileSpreadsheet, Info, AlertCircle,
} from 'lucide-react';
import { bulkImportDoctors, bulkImportStaff, bulkImportPatients, bulkImportInventory, listRoles } from '../api';
import BulkUploadModal from '../components/BulkUploadModal';

/* ─── Design tokens (consistent with other pages) ─── */
const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const cardHover = 'hover:shadow-[var(--shadow-md)] hover:-translate-y-0.5 transition-all duration-200';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnGhost = 'px-4 py-2.5 text-sm font-medium text-neutral-600 bg-neutral-100 rounded-lg hover:bg-neutral-200 transition';

/* ─── Base entity configurations ──────────────────── */
const BASE_ENTITIES = [
  {
    key: 'doctors',
    label: 'Doctors',
    icon: Stethoscope,
    color: { bg: 'bg-blue-50', text: 'text-blue-600', border: 'border-blue-100', ring: 'ring-blue-100' },
    description: 'Import doctor profiles with credentials, specialization, and branch assignment.',
    importFn: bulkImportDoctors,
    columns: [
      { key: 'name', label: 'Name', required: true, example: 'Dr. Priya Sharma' },
      { key: 'email', label: 'Email', required: true, example: 'priya@clinic.com' },
      { key: 'phone', label: 'Phone', example: '+91 9876543210' },
      { key: 'password', label: 'Password', required: true, example: 'Doctor@123' },
      { key: 'specialization', label: 'Specialization', example: 'Cardiology' },
      { key: 'licenseNumber', label: 'License Number', example: 'MH-12345' },
      { key: 'consultationFee', label: 'Consultation Fee', example: '500' },
      { key: 'branchCode', label: 'Branch Code', example: 'MAIN' },
    ],
  },
  {
    key: 'staff',
    label: 'Staff',
    icon: UserCog,
    color: { bg: 'bg-purple-50', text: 'text-purple-600', border: 'border-purple-100', ring: 'ring-purple-100' },
    description: 'Import non-doctor staff members with roles and branch assignment.',
    importFn: bulkImportStaff,
    columns: [
      { key: 'name', label: 'Name', required: true, example: 'Ravi Kumar' },
      { key: 'email', label: 'Email', required: true, example: 'ravi@clinic.com' },
      { key: 'phone', label: 'Phone', example: '+91 9876543210' },
      { key: 'password', label: 'Password', required: true, example: 'Staff@123' },
      { key: 'role', label: 'Role', required: true, example: 'receptionist' },
      { key: 'branchCode', label: 'Branch Code', example: 'MAIN' },
    ],
  },
  {
    key: 'patients',
    label: 'Patients',
    icon: Users,
    color: { bg: 'bg-emerald-50', text: 'text-emerald-600', border: 'border-emerald-100', ring: 'ring-emerald-100' },
    description: 'Import patient records with demographics and address details.',
    importFn: bulkImportPatients,
    columns: [
      { key: 'name', label: 'Name', required: true, example: 'Anita Desai' },
      { key: 'phone', label: 'Phone', required: true, example: '+91 9876543210' },
      { key: 'email', label: 'Email', example: 'anita@example.com' },
      { key: 'gender', label: 'Gender', example: 'female', options: [
        { value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' },
      ] },
      { key: 'dateOfBirth', label: 'Date of Birth', example: '1990-05-15' },
      { key: 'bloodGroup', label: 'Blood Group', example: 'B+', options: [
        { value: 'A+', label: 'A+' }, { value: 'A-', label: 'A-' },
        { value: 'B+', label: 'B+' }, { value: 'B-', label: 'B-' },
        { value: 'AB+', label: 'AB+' }, { value: 'AB-', label: 'AB-' },
        { value: 'O+', label: 'O+' }, { value: 'O-', label: 'O-' },
      ] },
      { key: 'address.street', label: 'Street', example: '123 MG Road' },
      { key: 'address.city', label: 'City', example: 'Mumbai' },
      { key: 'address.state', label: 'State', example: 'Maharashtra' },
      { key: 'address.zipCode', label: 'Zip Code', example: '400001' },
    ],
  },
  {
    key: 'inventory',
    label: 'Inventory',
    icon: Package,
    color: { bg: 'bg-amber-50', text: 'text-amber-600', border: 'border-amber-100', ring: 'ring-amber-100' },
    description: 'Import inventory items with stock levels, pricing, and supplier details.',
    importFn: bulkImportInventory,
    columns: [
      { key: 'name', label: 'Name', required: true, example: 'Composite Resin Kit' },
      { key: 'code', label: 'Code', required: true, example: 'CRK-001' },
      { key: 'category', label: 'Category', required: true, example: 'consumables', options: [
        { value: 'braces', label: 'Braces' },
        { value: 'implants', label: 'Implants' },
        { value: 'prosthetics', label: 'Prosthetics' },
        { value: 'surgical_kits', label: 'Surgical Kits' },
        { value: 'consumables', label: 'Consumables' },
        { value: 'instruments', label: 'Instruments' },
        { value: 'orthodontic', label: 'Orthodontic' },
        { value: 'endodontic', label: 'Endodontic' },
        { value: 'periodontal', label: 'Periodontal' },
        { value: 'imaging', label: 'Imaging' },
        { value: 'sterilization', label: 'Sterilization' },
        { value: 'other', label: 'Other' },
      ] },
      { key: 'description', label: 'Description', example: 'Universal composite resin' },
      { key: 'unit', label: 'Unit', example: 'piece' },
      { key: 'currentStock', label: 'Initial Stock', example: '100' },
      { key: 'minimumThreshold', label: 'Min Threshold', example: '10' },
      { key: 'costPerUnit', label: 'Cost Per Unit', example: '250' },
      { key: 'supplier.name', label: 'Supplier Name', example: 'MedSupply Co.' },
      { key: 'supplier.contactPhone', label: 'Supplier Phone', example: '+91 9876543210' },
      { key: 'supplier.contactEmail', label: 'Supplier Email', example: 'orders@medsupply.com' },
      { key: 'expiryDate', label: 'Expiry Date', example: '2025-12-31' },
      { key: 'branchCode', label: 'Branch Code', required: true, example: 'MAIN' },
    ],
  },
];

/* ─── Template download helper ────────────────────── */
function downloadTemplate(entity) {
  const header = entity.columns.map((c) => c.label).join(',');
  const example = entity.columns.map((c) => c.example || '').join(',');
  // Add a hints row showing valid options for columns that have them
  const hasOptions = entity.columns.some((c) => c.options?.length);
  const hints = hasOptions
    ? entity.columns.map((c) => c.options?.length ? c.options.map((o) => o.value).join(' | ') : '').join(',')
    : '';
  const csv = hints
    ? `${header}\n# Valid values: ${hints}\n${example}\n`
    : `${header}\n${example}\n`;
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${entity.key}_template.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/* ─── Entity Card Component ───────────────────────── */
function EntityCard({ entity, onUpload, lastResult }) {
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  const Icon = entity.icon;
  const c = entity.color;

  return (
    <div className={`${cardCls} ${cardHover} overflow-hidden`}>
      {/* Card header */}
      <div className="p-6 pb-4">
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-12 h-12 rounded-2xl ${c.bg} flex items-center justify-center`}>
              <Icon className={`h-6 w-6 ${c.text}`} />
            </div>
            <div>
              <h3 className="text-lg font-semibold text-neutral-900 font-display">{entity.label}</h3>
              <p className="text-xs text-neutral-500 mt-0.5">{entity.description}</p>
            </div>
          </div>
        </div>

        {/* Last upload result (session-only) */}
        {lastResult && (
          <div className={`flex items-center gap-3 p-3 rounded-xl mb-4 ${
            lastResult.errorCount === 0 ? 'bg-emerald-50 border border-emerald-100' : 'bg-amber-50 border border-amber-100'
          }`}>
            {lastResult.errorCount === 0 ? (
              <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
            )}
            <div className="text-sm">
              <span className="font-medium text-neutral-900">{lastResult.successCount}</span>
              <span className="text-neutral-500"> imported</span>
              {lastResult.errorCount > 0 && (
                <>
                  <span className="text-neutral-400 mx-1.5">&middot;</span>
                  <span className="font-medium text-red-600">{lastResult.errorCount}</span>
                  <span className="text-neutral-500"> failed</span>
                </>
              )}
            </div>
          </div>
        )}

        {/* Actions — wrap rather than overflow when the card is narrow */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => onUpload(entity)}
            className={`${btnPrimary} flex items-center gap-2 flex-1 justify-center`}
          >
            <Upload className="h-4 w-4" /> Upload CSV
          </button>
          <button
            onClick={() => downloadTemplate(entity)}
            className={`${btnGhost} flex items-center gap-2`}
          >
            <Download className="h-4 w-4" /> Template
          </button>
        </div>
      </div>

      {/* Field reference (expandable) */}
      <div className="border-t border-neutral-100">
        <button
          onClick={() => setFieldsExpanded(!fieldsExpanded)}
          className="w-full flex items-center justify-between px-6 py-3 text-xs font-medium text-neutral-500 hover:bg-neutral-50 transition"
        >
          <span className="flex items-center gap-1.5">
            <FileSpreadsheet className="h-3.5 w-3.5" />
            {entity.columns.length} fields &middot; {entity.columns.filter((c) => c.required).length} required
          </span>
          {fieldsExpanded ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
        </button>
        {fieldsExpanded && (
          <div className="px-6 pb-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-neutral-400">
                  <th className="pb-2 font-semibold">Column</th>
                  <th className="pb-2 font-semibold">Required</th>
                  <th className="pb-2 font-semibold">Example</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-neutral-50">
                {entity.columns.map((col) => (
                  <tr key={col.key}>
                    <td className="py-1.5 font-medium text-neutral-700">{col.label}</td>
                    <td className="py-1.5">
                      {col.required ? (
                        <span className="text-red-500 font-semibold">Yes</span>
                      ) : (
                        <span className="text-neutral-400">No</span>
                      )}
                    </td>
                    <td className="py-1.5 text-neutral-500 font-mono">{col.example || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════ */
export default function BulkUploads() {
  const [activeEntity, setActiveEntity] = useState(null);
  const [results, setResults] = useState({}); // { doctors: {...}, staff: {...}, patients: {...} }
  const [staffRoles, setStaffRoles] = useState([]);

  // Fetch active roles for staff validation
  useEffect(() => {
    listRoles({ excludeGroup: 'clinical', isActive: true, limit: 100 })
      .then((res) => {
        const roles = res?.data?.items || res?.items || [];
        setStaffRoles(roles.map((r) => ({ value: r.slug, label: r.name })));
      })
      .catch(() => {}); // Non-blocking — backend still validates
  }, []);

  // Inject fetched role options into staff entity columns
  const entities = useMemo(() => BASE_ENTITIES.map((entity) => {
    if (entity.key !== 'staff' || staffRoles.length === 0) return entity;
    return {
      ...entity,
      columns: entity.columns.map((col) =>
        col.key === 'role' ? { ...col, options: staffRoles } : col,
      ),
    };
  }), [staffRoles]);

  const handleUpload = useCallback((entity) => {
    setActiveEntity(entity);
  }, []);

  const handleClose = useCallback(() => {
    setActiveEntity(null);
  }, []);

  const handleRefresh = useCallback(() => {
    // No list to refresh on this page — handled by the import result
  }, []);

  // Wrap the import function to capture result
  const handleImport = useCallback(async (rows) => {
    if (!activeEntity) return;
    const res = await activeEntity.importFn(rows);
    const data = res?.data ?? res;
    setResults((prev) => ({ ...prev, [activeEntity.key]: data }));
    return res;
  }, [activeEntity]);

  return (
    <div className="max-w-[1280px] mx-auto w-full space-y-6">

      {/* ── Page Header ────────────────────────────── */}
      <div className="animate-[fadeUp_0.4s_ease-out_both]">
        <h1 className="text-2xl font-semibold font-display text-neutral-900">Bulk Uploads</h1>
        <p className="text-sm text-neutral-500 mt-1">
          Import doctors, staff, patients, and inventory in bulk using CSV files
        </p>
      </div>

      {/* ── Entity Cards ───────────────────────────── */}
      {/* 4-up only on very wide screens. At xl inside max-w-[1280px] minus the
          260px sidebar each card was ~265px, which squeezed the 48px icon, the
          description and the two-button action row into an unreadable column. */}
      <div className="grid grid-cols-1 md:grid-cols-2 2xl:grid-cols-4 gap-5 animate-[fadeUp_0.4s_ease-out_both]" style={{ animationDelay: '50ms' }}>
        {entities.map((entity, i) => (
          <EntityCard
            key={entity.key}
            entity={entity}
            onUpload={handleUpload}
            lastResult={results[entity.key]}
          />
        ))}
      </div>

      {/* ── Upload Guidelines ──────────────────────── */}
      <div className={`${cardCls} p-6 animate-[fadeUp_0.4s_ease-out_both]`} style={{ animationDelay: '100ms' }}>
        <div className="flex items-center gap-2 mb-4">
          <Info className="h-4 w-4 text-neutral-400" />
          <h2 className="text-sm font-semibold text-neutral-700">Upload Guidelines</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 text-xs text-neutral-600">
          <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-neutral-700">File Format</p>
            <ul className="space-y-1 text-neutral-500">
              <li>&bull; CSV files only (.csv)</li>
              <li>&bull; Maximum 500 rows per upload</li>
              <li>&bull; Maximum file size: 5 MB</li>
              <li>&bull; First row must be column headers</li>
            </ul>
          </div>
          <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-neutral-700">Password Requirements</p>
            <ul className="space-y-1 text-neutral-500">
              <li>&bull; Minimum 8 characters</li>
              <li>&bull; At least 1 uppercase letter (A-Z)</li>
              <li>&bull; At least 1 lowercase letter (a-z)</li>
              <li>&bull; At least 1 digit (0-9)</li>
              <li>&bull; Required for Doctors and Staff only</li>
            </ul>
          </div>
          <div className="bg-neutral-50 rounded-xl p-4 space-y-2">
            <p className="font-semibold text-neutral-700">Tips</p>
            <ul className="space-y-1 text-neutral-500">
              <li>&bull; Download the template first for correct headers</li>
              <li>&bull; Use Branch Code (e.g. MAIN) instead of Branch ID</li>
              <li>&bull; Duplicate emails will be reported as errors</li>
              <li>&bull; Patient uploads don&apos;t require a password</li>
              <li>&bull; Inventory codes must be unique per branch</li>
            </ul>
          </div>
        </div>
      </div>

      {/* ── Bulk Upload Modal ──────────────────────── */}
      {activeEntity && (
        <BulkUploadModal
          open={!!activeEntity}
          onClose={handleClose}
          entityName={activeEntity.label}
          columns={activeEntity.columns}
          onImport={handleImport}
          onRefresh={handleRefresh}
        />
      )}
    </div>
  );
}
