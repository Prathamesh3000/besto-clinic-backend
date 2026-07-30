import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Save, Send, ChevronDown } from 'lucide-react';
import { createJob, getJob, updateJob, publishJob, getJobDepartments, listBranches } from '../api';
import JobToast from '../components/jobs/JobToast';

const DEFAULT_DEPARTMENTS = [
  'Nursing', 'Administration', 'Clinical', 'Dental', 'Surgery',
  'Cardiology', 'Neurology', 'Pediatrics', 'Orthopedics', 'Ophthalmology',
  'Radiology', 'Pharmacy', 'Laboratory', 'Technician', 'Reception',
  'HR', 'Finance', 'Specialist',
];

const cardCls = 'bg-white rounded-2xl border border-neutral-200 shadow-[var(--shadow-sm)]';
const inputCls = 'w-full px-4 py-2.5 border border-neutral-200 rounded-xl text-sm bg-white text-neutral-900 placeholder-neutral-400 focus:border-primary-400 focus:ring-2 focus:ring-primary-100 outline-none transition-all';
const labelCls = 'block text-sm font-medium text-neutral-700 mb-1.5';
const btnPrimary = 'px-5 py-2.5 text-sm font-semibold text-white rounded-lg bg-primary-600 hover:bg-primary-700 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const btnSecondary = 'px-5 py-2.5 text-sm font-semibold text-neutral-700 rounded-lg border border-neutral-200 hover:bg-neutral-50 shadow-[var(--shadow-sm)] transition-all disabled:opacity-50';
const errorInputCls = 'border-red-300 focus:border-red-400 focus:ring-red-100';

const EMPLOYMENT_TYPES = [
  { value: 'full_time', label: 'Full-time' },
  { value: 'part_time', label: 'Part-time' },
  { value: 'contract', label: 'Contract' },
];

const EXPERIENCE_LEVELS = [
  { value: 'entry', label: 'Entry Level' },
  { value: 'mid', label: 'Mid Level' },
  { value: 'senior', label: 'Senior Level' },
];

/**
 * Parse API error into a human-readable message.
 */
function parseError(err) {
  const msg = err?.response?.data?.message || err?.message || 'Something went wrong';

  // Handle Joi/Mongoose "Validation failed" with field-level details
  const details = err?.response?.data?.details || err?.response?.data?.errors;
  if (details) {
    if (Array.isArray(details)) {
      return details.map((d) => d.message || d.msg || String(d)).join('. ');
    }
    if (typeof details === 'object') {
      return Object.entries(details)
        .map(([field, info]) => {
          const label = field.replace(/([A-Z])/g, ' $1').replace(/\./g, ' > ').trim();
          const text = typeof info === 'string' ? info : info?.message || JSON.stringify(info);
          return `${label}: ${text}`;
        })
        .join('. ');
    }
  }

  // Make common backend messages more user-friendly
  if (/jobPortalEnabled/i.test(msg)) {
    return 'The Job Portal feature is not enabled for your clinic. Please contact your platform administrator to enable it.';
  }
  if (/insufficient.*credit/i.test(msg)) {
    return 'You don\'t have enough credits to publish this listing. Purchase more credits from the Job Portal dashboard.';
  }
  if (/validation failed/i.test(msg)) {
    return 'Some required fields are missing or invalid. Please check the form and try again.';
  }

  return msg;
}

export default function CreateJobPosting() {
  const navigate = useNavigate();
  const { id } = useParams();
  const isEditing = !!id;

  const [form, setForm] = useState({
    title: '',
    department: '',
    employmentType: 'full_time',
    description: '',
    compensation: { salaryMin: '', salaryMax: '', currency: 'INR', showSalary: true, hasBenefits: false },
    requirements: { experienceLevel: 'entry', certifications: '', skills: '' },
    location: { type: 'on_site', branch: '', city: '', state: '' },
    isFeatured: false,
  });

  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [savedId, setSavedId] = useState(id || null);
  const [toast, setToast] = useState(null);
  const [fieldErrors, setFieldErrors] = useState({});
  const [deptSuggestions, setDeptSuggestions] = useState(DEFAULT_DEPARTMENTS);
  const [deptOpen, setDeptOpen] = useState(false);
  const deptRef = useRef(null);
  const [branches, setBranches] = useState([]);

  // Fetch existing departments used in active postings, merge with defaults
  useEffect(() => {
    getJobDepartments()
      .then((res) => {
        const fromApi = res.data || [];
        const merged = [...new Set([...fromApi, ...DEFAULT_DEPARTMENTS])].sort();
        setDeptSuggestions(merged);
      })
      .catch(() => {}); // keep defaults on error
  }, []);

  // Fetch active branches for location picker
  useEffect(() => {
    listBranches({ isActive: true })
      .then((res) => {
        const list = res.data?.items || res.data || [];
        setBranches(list);
      })
      .catch(() => {});
  }, []);

  // When editing, auto-match existing city to a branch
  useEffect(() => {
    if (!branches.length || form.location.branch || !form.location.city) return;
    const match = branches.find(
      (b) => b.address?.city?.toLowerCase() === form.location.city.toLowerCase(),
    );
    if (match) {
      setForm((prev) => ({
        ...prev,
        location: { ...prev.location, branch: match._id },
      }));
    }
  }, [branches, form.location.branch, form.location.city]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handler = (e) => {
      if (deptRef.current && !deptRef.current.contains(e.target)) setDeptOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const showToast = useCallback((type, title, message) => {
    setToast({ type, title, message });
  }, []);

  const clearToast = useCallback(() => setToast(null), []);

  useEffect(() => {
    if (!id) return;
    getJob(id).then((r) => {
      const job = r.data;
      setForm({
        title: job.title || '',
        department: job.department || '',
        employmentType: job.employmentType || 'full_time',
        description: job.description || '',
        compensation: {
          salaryMin: job.compensation?.salaryMin || '',
          salaryMax: job.compensation?.salaryMax || '',
          currency: job.compensation?.currency || 'INR',
          showSalary: job.compensation?.showSalary ?? true,
          hasBenefits: job.compensation?.hasBenefits ?? false,
        },
        requirements: {
          experienceLevel: job.requirements?.experienceLevel || 'entry',
          certifications: (job.requirements?.certifications || []).join(', '),
          skills: (job.requirements?.skills || []).join(', '),
        },
        location: {
          type: job.location?.type || 'on_site',
          branch: job.location?.branch || '',
          city: job.location?.city || '',
          state: job.location?.state || '',
        },
        isFeatured: job.isFeatured || false,
      });
    }).catch((err) => {
      showToast('error', 'Failed to load job', parseError(err));
      setTimeout(() => navigate('/clinic/jobs'), 2000);
    });
  }, [id, navigate, showToast]);

  const set = (path, value) => {
    setForm((prev) => {
      const next = { ...prev };
      const parts = path.split('.');
      if (parts.length === 1) {
        next[parts[0]] = value;
      } else {
        next[parts[0]] = { ...next[parts[0]], [parts[1]]: value };
      }
      return next;
    });
    // Clear field error on change
    setFieldErrors((prev) => {
      const next = { ...prev };
      delete next[path];
      return next;
    });
  };

  const validate = () => {
    const errors = {};
    if (!form.title.trim()) errors.title = 'Job title is required';
    if (!form.department.trim()) errors.department = 'Department is required';
    if (!form.description.trim()) errors.description = 'Job description is required';
    if (form.location.type !== 'remote') {
      if (!form.location.branch) errors['location.branch'] = 'Please select a branch for on-site/hybrid roles';
    }
    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const buildPayload = () => ({
    ...form,
    compensation: {
      ...form.compensation,
      salaryMin: Number(form.compensation.salaryMin) || 0,
      salaryMax: Number(form.compensation.salaryMax) || 0,
    },
    requirements: {
      experienceLevel: form.requirements.experienceLevel,
      certifications: form.requirements.certifications
        ? form.requirements.certifications.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
      skills: form.requirements.skills
        ? form.requirements.skills.split(',').map((s) => s.trim()).filter(Boolean)
        : [],
    },
  });

  const handleSave = async () => {
    if (!validate()) {
      showToast('warning', 'Missing required fields', 'Please fill in all highlighted fields before saving.');
      return null;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (savedId) {
        await updateJob(savedId, payload);
        showToast('success', 'Draft saved', 'Your job listing has been saved as a draft.');
        return savedId;
      } else {
        const r = await createJob(payload);
        const newId = r.data._id;
        setSavedId(newId);
        showToast('success', 'Draft saved', 'Your job listing has been saved as a draft.');
        return newId;
      }
    } catch (err) {
      showToast('error', 'Could not save listing', parseError(err));
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handlePublish = async () => {
    if (!validate()) {
      showToast('warning', 'Missing required fields', 'Please fill in all highlighted fields before publishing.');
      return;
    }
    setPublishing(true);
    try {
      let jobId = savedId;
      if (!jobId) {
        jobId = await handleSave();
        if (!jobId) {
          setPublishing(false);
          return;
        }
      } else {
        const payload = buildPayload();
        await updateJob(jobId, payload);
      }
      await publishJob(jobId);
      showToast('success', 'Published!', 'Your job listing is now live.');
      setTimeout(() => navigate('/clinic/jobs'), 400);
    } catch (err) {
      showToast('error', 'Could not publish listing', parseError(err));
    } finally {
      setPublishing(false);
    }
  };

  const fieldErrorCls = (field) => fieldErrors[field] ? errorInputCls : '';

  return (
    <div className="space-y-6 max-w-6xl mx-auto">
      {/* Toast */}
      {toast && (
        <div className="sticky top-4 z-50">
          <JobToast type={toast.type} title={toast.title} message={toast.message} onClose={clearToast} />
        </div>
      )}

      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate('/clinic/jobs')} className="p-2 rounded-lg hover:bg-neutral-100 transition-colors">
            <ArrowLeft className="w-5 h-5 text-neutral-600" />
          </button>
          <div>
            <h1 className="text-xl font-bold text-neutral-900">
              {isEditing ? 'Edit Listing' : 'Create New Listing'}
            </h1>
            <p className="text-sm text-neutral-500">Fill in the details for your job posting</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleSave} disabled={saving} className={btnSecondary}>
            <span className="flex items-center gap-2">
              <Save className="w-4 h-4" /> {saving ? 'Saving...' : 'Save Draft'}
            </span>
          </button>
          <div className="flex items-center gap-2">
            <span className="text-xs text-neutral-500">
              {form.isFeatured ? '3 credits' : '1 credit'}
            </span>
            <button onClick={handlePublish} disabled={publishing || !form.title} className={btnPrimary}>
              <span className="flex items-center gap-2">
                <Send className="w-4 h-4" /> {publishing ? 'Publishing...' : 'Publish Listing'}
              </span>
            </button>
          </div>
        </div>
      </div>

      {/* Bento Grid */}
      <div className="grid grid-cols-12 gap-6">
        {/* Left Column */}
        <div className="col-span-12 lg:col-span-8 space-y-6">
          {/* Basic Details */}
          <div className={`${cardCls} p-6`}>
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Basic Details</h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Job Title <span className="text-red-400">*</span></label>
                <input
                  type="text"
                  placeholder="e.g. Senior Dental Hygienist"
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  className={`${inputCls} ${fieldErrorCls('title')}`}
                />
                {fieldErrors.title && <p className="text-xs text-red-500 mt-1">{fieldErrors.title}</p>}
              </div>
              <div ref={deptRef} className="relative">
                <label className={labelCls}>Department <span className="text-red-400">*</span></label>
                <div className="relative">
                  <input
                    type="text"
                    placeholder="Type or select a department"
                    value={form.department}
                    onChange={(e) => { set('department', e.target.value); setDeptOpen(true); }}
                    onFocus={() => setDeptOpen(true)}
                    className={`${inputCls} pr-9 ${fieldErrorCls('department')}`}
                  />
                  <button
                    type="button"
                    tabIndex={-1}
                    onClick={() => setDeptOpen((o) => !o)}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 p-0.5 text-neutral-400 hover:text-neutral-600"
                  >
                    <ChevronDown className={`w-4 h-4 transition-transform ${deptOpen ? 'rotate-180' : ''}`} />
                  </button>
                </div>
                {deptOpen && (() => {
                  const q = form.department.toLowerCase().trim();
                  const filtered = deptSuggestions.filter((d) => d.toLowerCase().includes(q));
                  const hasExact = filtered.some((d) => d.toLowerCase() === q);
                  if (filtered.length === 0 && !q) return null;
                  return (
                    <ul className="absolute z-30 mt-1 w-full bg-white border border-neutral-200 rounded-xl shadow-lg max-h-48 overflow-y-auto">
                      {filtered.map((dept) => (
                        <li
                          key={dept}
                          onClick={() => { set('department', dept); setDeptOpen(false); }}
                          className={`px-4 py-2 text-sm cursor-pointer hover:bg-primary-50 hover:text-primary-700 transition-colors ${
                            form.department === dept ? 'bg-primary-50 text-primary-700 font-medium' : 'text-neutral-700'
                          }`}
                        >
                          {dept}
                        </li>
                      ))}
                      {q && !hasExact && (
                        <li
                          onClick={() => { set('department', form.department.trim()); setDeptOpen(false); }}
                          className="px-4 py-2 text-sm cursor-pointer hover:bg-neutral-50 text-neutral-500 border-t border-neutral-100"
                        >
                          Use &quot;{form.department.trim()}&quot;
                        </li>
                      )}
                    </ul>
                  );
                })()}
                {fieldErrors.department && <p className="text-xs text-red-500 mt-1">{fieldErrors.department}</p>}
              </div>
              <div>
                <label className={labelCls}>Employment Type</label>
                <div className="flex gap-2">
                  {EMPLOYMENT_TYPES.map((t) => (
                    <button
                      key={t.value}
                      onClick={() => set('employmentType', t.value)}
                      className={`px-4 py-2 text-sm font-medium rounded-lg border transition-all ${
                        form.employmentType === t.value
                          ? 'bg-primary-50 border-primary-300 text-primary-700'
                          : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Job Description */}
          <div className={`${cardCls} p-6`}>
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Job Description <span className="text-red-400">*</span></h2>
            <textarea
              rows={12}
              placeholder="Describe the role, responsibilities, and what you're looking for..."
              value={form.description}
              onChange={(e) => set('description', e.target.value)}
              className={`${inputCls} resize-y ${fieldErrorCls('description')}`}
            />
            {fieldErrors.description && <p className="text-xs text-red-500 mt-1">{fieldErrors.description}</p>}
          </div>
        </div>

        {/* Right Column */}
        <div className="col-span-12 lg:col-span-4 space-y-6">
          {/* Compensation */}
          <div className={`${cardCls} p-6`}>
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Compensation</h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Salary Range <span className="font-normal text-neutral-400">(monthly, in &#8377;)</span></label>
                <div className="flex gap-3">
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">&#8377;</span>
                    <input
                      type="number"
                      placeholder="Min"
                      value={form.compensation.salaryMin}
                      onChange={(e) => set('compensation.salaryMin', e.target.value)}
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                  <div className="relative flex-1">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-neutral-400">&#8377;</span>
                    <input
                      type="number"
                      placeholder="Max"
                      value={form.compensation.salaryMax}
                      onChange={(e) => set('compensation.salaryMax', e.target.value)}
                      className={`${inputCls} pl-7`}
                    />
                  </div>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.compensation.hasBenefits}
                  onChange={(e) => set('compensation.hasBenefits', e.target.checked)}
                  className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
                />
                <span className="text-sm text-neutral-700">Include benefits package indicator</span>
              </label>
            </div>
          </div>

          {/* Requirements */}
          <div className={`${cardCls} p-6`}>
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Role Requirements</h2>
            <div className="space-y-4">
              <div>
                <label className={labelCls}>Minimum Experience</label>
                <select
                  value={form.requirements.experienceLevel}
                  onChange={(e) => set('requirements.experienceLevel', e.target.value)}
                  className={inputCls}
                >
                  {EXPERIENCE_LEVELS.map((l) => (
                    <option key={l.value} value={l.value}>{l.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelCls}>Key Certifications</label>
                <textarea
                  rows={3}
                  placeholder="BSN, RN, ACLS (comma-separated)"
                  value={form.requirements.certifications}
                  onChange={(e) => set('requirements.certifications', e.target.value)}
                  className={`${inputCls} resize-y`}
                />
              </div>
              <div>
                <label className={labelCls}>Skills</label>
                <textarea
                  rows={3}
                  placeholder="Patient care, IV therapy (comma-separated)"
                  value={form.requirements.skills}
                  onChange={(e) => set('requirements.skills', e.target.value)}
                  className={`${inputCls} resize-y`}
                />
              </div>
            </div>
          </div>

          {/* Location */}
          <div className={`${cardCls} p-6`}>
            <h2 className="text-base font-semibold text-neutral-900 mb-4">Location</h2>
            <div className="space-y-4">
              <div className="flex gap-2">
                {['on_site', 'remote', 'hybrid'].map((t) => (
                  <button
                    key={t}
                    onClick={() => {
                      set('location.type', t);
                      if (t === 'remote') {
                        set('location.branch', '');
                        set('location.city', '');
                        set('location.state', '');
                      }
                    }}
                    className={`px-3 py-1.5 text-xs font-medium rounded-lg border transition-all capitalize ${
                      form.location.type === t
                        ? 'bg-primary-50 border-primary-300 text-primary-700'
                        : 'border-neutral-200 text-neutral-600 hover:bg-neutral-50'
                    }`}
                  >
                    {t.replace('_', '-')}
                  </button>
                ))}
              </div>
              {form.location.type !== 'remote' && (
                <>
                  <div>
                    <label className={labelCls}>Branch <span className="text-red-400">*</span></label>
                    <select
                      value={form.location.branch}
                      onChange={(e) => {
                        const branchId = e.target.value;
                        set('location.branch', branchId);
                        const selected = branches.find((b) => b._id === branchId);
                        if (selected) {
                          set('location.city', selected.address?.city || '');
                          set('location.state', selected.address?.state || '');
                        } else {
                          set('location.city', '');
                          set('location.state', '');
                        }
                      }}
                      className={`${inputCls} ${fieldErrorCls('location.branch')}`}
                    >
                      <option value="">Select a branch</option>
                      {branches.map((b) => (
                        <option key={b._id} value={b._id}>
                          {b.name}{b.address?.city ? ` — ${b.address.city}` : ''}
                        </option>
                      ))}
                    </select>
                    {fieldErrors['location.branch'] && <p className="text-xs text-red-500 mt-1">{fieldErrors['location.branch']}</p>}
                  </div>
                  {form.location.city && (
                    <p className="text-xs text-neutral-500">
                      {form.location.city}{form.location.state ? `, ${form.location.state}` : ''}
                    </p>
                  )}
                </>
              )}
            </div>
          </div>

          {/* Featured Toggle */}
          <div className={`${cardCls} p-6`}>
            <label className="flex items-center gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={form.isFeatured}
                onChange={(e) => set('isFeatured', e.target.checked)}
                className="w-4 h-4 rounded border-neutral-300 text-primary-600 focus:ring-primary-500"
              />
              <div>
                <p className="text-sm font-medium text-neutral-900">Featured Listing</p>
                <p className="text-xs text-neutral-500">+2 credits on top of 1 publish credit (3 total)</p>
              </div>
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
