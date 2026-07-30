/**
 * TemplateSelector — Searchable dropdown for consultation templates.
 * Fetches from /doctor/templates, groups by category, merges selected template into form.
 */

import { useState, useEffect, useRef } from 'react';
import { FileStack, Search, ChevronDown, X } from 'lucide-react';
import { listConsultationTemplates } from '../api';

const CATEGORY_LABELS = {
  surgery: 'Surgery',
  orthodontic: 'Orthodontic',
  prosthetic: 'Prosthetic',
  endodontic: 'Endodontic',
  periodontal: 'Periodontal',
  cosmetic: 'Cosmetic',
  diagnostic: 'Diagnostic',
  other: 'Other',
};

export default function TemplateSelector({ onSelect }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef(null);

  // Load templates when dropdown opens
  useEffect(() => {
    if (open && templates.length === 0) {
      setLoading(true);
      listConsultationTemplates()
        .then((res) => setTemplates(res.data || res || []))
        .catch(() => {})
        .finally(() => setLoading(false));
    }
  }, [open]);

  // Close on outside click
  useEffect(() => {
    const handler = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  const filtered = templates.filter(
    (t) =>
      !search ||
      t.name.toLowerCase().includes(search.toLowerCase()) ||
      t.code.toLowerCase().includes(search.toLowerCase()),
  );

  // Group by category
  const grouped = {};
  for (const tpl of filtered) {
    const cat = tpl.category || 'other';
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(tpl);
  }

  const handleSelect = (tpl) => {
    onSelect({
      chiefComplaint: tpl.chiefComplaint || '',
      diagnosis: tpl.diagnosis || '',
      treatmentPlan: tpl.treatment || tpl.treatmentPlan || '',
      followUpInstructions: tpl.followUpInstructions || '',
      procedure: tpl.defaultProcedure || '',
      priority: tpl.defaultPriority || '',
      prescriptions: tpl.defaultPrescriptions?.length > 0
        ? tpl.defaultPrescriptions
        : undefined,
      careTasks: tpl.defaultCareTasks?.length > 0
        ? tpl.defaultCareTasks.map((ct) => ({
            ...ct,
            enabled: true,
            reminderEnabled: true,
          }))
        : undefined,
      materialsUsed: tpl.defaultMaterials?.length > 0
        ? tpl.defaultMaterials.map((m) => ({
            item: m.item,
            itemName: m.itemName,
            quantity: m.quantity || 1,
            costPerUnit: m.costPerUnit || 0,
          }))
        : undefined,
    });
    setOpen(false);
    setSearch('');
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-[#1f4e8a] border border-[#b5c7dd] rounded-lg hover:bg-blue-50 transition-colors"
      >
        <FileStack className="h-4 w-4" />
        Apply Template
        <ChevronDown className={`h-3.5 w-3.5 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-lg z-50 overflow-hidden">
          {/* Search */}
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg">
              <Search className="h-4 w-4 text-gray-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search templates..."
                className="flex-1 bg-transparent text-sm outline-none placeholder:text-gray-400"
                autoFocus
              />
              {search && (
                <button onClick={() => setSearch('')} className="text-gray-400 hover:text-gray-600">
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>
          </div>

          {/* Results */}
          <div className="max-h-64 overflow-y-auto">
            {loading && (
              <div className="p-4 text-center text-sm text-gray-400">Loading templates...</div>
            )}

            {!loading && Object.keys(grouped).length === 0 && (
              <div className="p-4 text-center text-sm text-gray-400">No templates found</div>
            )}

            {Object.entries(grouped).map(([category, items]) => (
              <div key={category}>
                <div className="px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 bg-gray-50/80">
                  {CATEGORY_LABELS[category] || category}
                </div>
                {items.map((tpl) => (
                  <button
                    key={tpl._id}
                    onClick={() => handleSelect(tpl)}
                    className="w-full text-left px-3 py-2 hover:bg-blue-50 transition-colors flex items-center gap-2"
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-800 truncate">{tpl.name}</p>
                      <p className="text-[11px] text-gray-500">{tpl.code}</p>
                    </div>
                  </button>
                ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
