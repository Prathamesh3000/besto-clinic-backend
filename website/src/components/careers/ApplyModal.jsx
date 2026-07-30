import { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, ChevronRight, ChevronLeft, CheckCircle2, AlertCircle, FileText, Loader2 } from 'lucide-react';
import { applyToJob } from '../../lib/careersApi';

const ACCEPTED_TYPES = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5 MB
const STEP_LABELS = ['Contact', 'Resume', 'Review'];

function validateEmailFormat(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ─── Extracted components (stable references — no remount on parent re-render) ──

function Field({ label, field, type = 'text', required, placeholder, value, error, onChange }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-2">
        {label} {required && <span className="text-red-500">*</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(field, e.target.value)}
        placeholder={placeholder}
        className={`w-full px-4 py-3 rounded-xl border text-sm transition-colors focus:outline-none focus:ring-2 focus:ring-primary-600/15 focus:border-primary-400 ${
          error ? 'border-red-300 bg-red-50' : 'border-neutral-200 bg-white hover:border-neutral-300'
        }`}
      />
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

function FileUploadZone({ file, fileRef, dragOver, error, onFile, onClear, onDragOver, onDragLeave, onDrop }) {
  return (
    <div>
      <label className="block text-sm font-medium text-neutral-700 mb-2">
        Resume <span className="text-red-500">*</span>
      </label>
      <div
        onDragOver={onDragOver}
        onDragLeave={onDragLeave}
        onDrop={onDrop}
        onClick={() => fileRef.current?.click()}
        className={`border-2 border-dashed rounded-xl p-8 text-center cursor-pointer transition-colors ${
          dragOver ? 'border-primary-400 bg-primary-50' : error ? 'border-red-300 bg-red-50' : 'border-neutral-200 hover:border-primary-300 hover:bg-primary-50/30 bg-white'
        }`}
      >
        {file ? (
          <div className="flex items-center justify-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center">
              <FileText className="w-5 h-5 text-primary-600" />
            </div>
            <span className="text-sm text-neutral-800 font-medium">{file.name}</span>
            <button
              onClick={(e) => { e.stopPropagation(); onClear(); }}
              className="ml-1 p-1 rounded-lg text-neutral-400 hover:text-red-500 hover:bg-red-50 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ) : (
          <>
            <div className="w-12 h-12 rounded-xl bg-primary-50 flex items-center justify-center mx-auto mb-3">
              <Upload className="w-6 h-6 text-primary-500" />
            </div>
            <p className="text-sm text-neutral-600">Drag & drop your resume or <span className="text-primary-600 font-semibold">browse</span></p>
            <p className="text-xs text-neutral-400 mt-1.5">PDF or DOC, max 5 MB</p>
          </>
        )}
      </div>
      <input ref={fileRef} type="file" accept=".pdf,.doc,.docx" className="hidden" onChange={(e) => onFile(e.target.files[0])} />
      {error && <p className="text-xs text-red-500 mt-1.5">{error}</p>}
    </div>
  );
}

function StepIndicator({ step }) {
  return (
    <div className="flex items-center justify-center mb-8">
      {[1, 2, 3].map((s) => (
        <div key={s} className="flex items-center">
          <div className="flex flex-col items-center gap-1.5">
            <div className={`w-9 h-9 rounded-full flex items-center justify-center text-xs font-semibold transition-all duration-400 ease-out ${
              s < step
                ? 'bg-green-100 text-green-700 scale-[0.92]'
                : s === step
                  ? 'bg-primary-600 text-white scale-105 shadow-md shadow-primary-600/20'
                  : 'bg-neutral-100 text-neutral-400'
            }`}>
              {s < step ? <CheckCircle2 className="w-4 h-4" /> : s}
            </div>
            <span className={`text-[11px] font-medium transition-colors duration-300 ${
              s === step ? 'text-primary-600' : s < step ? 'text-green-600' : 'text-neutral-400'
            }`}>
              {STEP_LABELS[s - 1]}
            </span>
          </div>
          {s < 3 && (
            <div className="w-14 h-[3px] mb-5 mx-2 bg-neutral-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-green-400 rounded-full transition-all duration-500 ease-out"
                style={{ width: s < step ? '100%' : '0%' }}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function ResultScreen({ result, onClose }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-6 text-center">
      {result.type === 'success' ? (
        <>
          <div className="w-18 h-18 rounded-full bg-green-50 flex items-center justify-center mb-5">
            <CheckCircle2 className="w-9 h-9 text-green-600" />
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-3">Application Submitted!</h3>
          <p className="text-sm text-neutral-500 max-w-xs leading-relaxed">{result.message}</p>
        </>
      ) : (
        <>
          <div className={`w-18 h-18 rounded-full flex items-center justify-center mb-5 ${result.type === 'duplicate' ? 'bg-amber-50' : 'bg-red-50'}`}>
            <AlertCircle className={`w-9 h-9 ${result.type === 'duplicate' ? 'text-amber-600' : 'text-red-600'}`} />
          </div>
          <h3 className="text-xl font-semibold text-neutral-900 mb-3">
            {result.type === 'duplicate' ? 'Already Applied' : 'Submission Failed'}
          </h3>
          <p className="text-sm text-neutral-500 max-w-xs leading-relaxed">{result.message}</p>
        </>
      )}
      <button onClick={onClose} className="mt-8 px-8 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors">
        Close
      </button>
    </div>
  );
}

// ─── Main Modal ──────────────────────────────────────────────

export default function ApplyModal({ open, onClose, job, mode = 'full' }) {
  const [step, setStep] = useState(1);
  const [form, setForm] = useState({ name: '', email: '', phone: '', coverLetter: '' });
  const [file, setFile] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null);
  const [errors, setErrors] = useState({});
  const fileRef = useRef(null);

  const reset = () => {
    setStep(1);
    setForm({ name: '', email: '', phone: '', coverLetter: '' });
    setFile(null);
    setResult(null);
    setErrors({});
    setSubmitting(false);
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleField = useCallback((field, value) => {
    setForm((f) => ({ ...f, [field]: value }));
    setErrors((e) => (e[field] ? { ...e, [field]: null } : e));
  }, []);

  const handleFile = useCallback((f) => {
    if (!f) return;
    if (!ACCEPTED_TYPES.includes(f.type)) {
      setErrors((e) => ({ ...e, file: 'Only PDF or DOC files are accepted' }));
      return;
    }
    if (f.size > MAX_FILE_SIZE) {
      setErrors((e) => ({ ...e, file: 'File size must be under 5 MB' }));
      return;
    }
    setFile(f);
    setErrors((e) => ({ ...e, file: null }));
  }, []);

  const handleClearFile = useCallback(() => setFile(null), []);

  const handleDragOver = useCallback((e) => { e.preventDefault(); setDragOver(true); }, []);
  const handleDragLeave = useCallback(() => setDragOver(false), []);
  const handleDrop = useCallback((e) => {
    e.preventDefault();
    setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) handleFile(f);
  }, [handleFile]);

  // ─── Validation ───────────────────────────────────────────
  const validateStep1 = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!validateEmailFormat(form.email)) e.email = 'Enter a valid email';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const validateStep2 = () => {
    if (!file) {
      setErrors({ file: 'Resume is required' });
      return false;
    }
    return true;
  };

  const validateQuick = () => {
    const e = {};
    if (!form.name.trim()) e.name = 'Name is required';
    if (!form.email.trim()) e.email = 'Email is required';
    else if (!validateEmailFormat(form.email)) e.email = 'Enter a valid email';
    if (!form.phone.trim()) e.phone = 'Phone is required';
    if (!file) e.file = 'Resume is required';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  // ─── Navigation ───────────────────────────────────────────
  const handleNext = () => {
    if (step === 1 && !validateStep1()) return;
    if (step === 2 && !validateStep2()) return;
    setStep((s) => Math.min(s + 1, 3));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  // ─── Submit ───────────────────────────────────────────────
  const readFileAsBase64 = (f) =>
    new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result.split(',')[1]); // strip data:...;base64, prefix
      reader.onerror = () => reject(new Error('Failed to read file'));
      reader.readAsDataURL(f);
    });

  const handleSubmit = async () => {
    if (mode === 'quick' && !validateQuick()) return;

    setSubmitting(true);
    try {
      const resumeData = await readFileAsBase64(file);
      const payload = {
        name: form.name.trim(),
        email: form.email.trim().toLowerCase(),
        phone: form.phone.trim(),
        resumeData,
        resumeFileName: file.name,
        resumeMimeType: file.type,
        coverLetter: form.coverLetter.trim() || null,
      };
      await applyToJob(job._id, payload);
      setResult({ type: 'success', message: 'Application submitted! Check your email for confirmation.' });
    } catch (err) {
      if (err.message?.toLowerCase().includes('already applied')) {
        setResult({ type: 'duplicate', message: "You've already applied to this position." });
      } else {
        setResult({ type: 'error', message: err.message || 'Something went wrong. Please try again.' });
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (!open) return null;

  // ─── Shared file upload props ─────────────────────────────
  const fileUploadProps = {
    file, fileRef, dragOver, error: errors.file,
    onFile: handleFile, onClear: handleClearFile,
    onDragOver: handleDragOver, onDragLeave: handleDragLeave, onDrop: handleDrop,
  };

  // ─── Render ───────────────────────────────────────────────
  return createPortal(
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4">
      {/* Step transition keyframes */}
      <style>{`
        @keyframes applyStepIn {
          from { opacity: 0; transform: translateY(8px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .apply-step-enter { animation: applyStepIn 300ms ease-out both; }
      `}</style>
      <div className="absolute inset-0 bg-neutral-950/40 backdrop-blur-sm" onClick={!submitting ? handleClose : undefined} />
      <div className="relative bg-white rounded-2xl shadow-[0_25px_60px_-15px_rgba(0,0,0,0.2)] w-full max-w-lg max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white rounded-t-2xl border-b border-neutral-100 px-8 py-5 flex items-center justify-between z-10">
          <div>
            <h2 className="text-lg font-semibold text-neutral-900">
              {mode === 'quick' ? 'Quick Apply' : 'Apply for this role'}
            </h2>
            <p className="text-sm text-neutral-500 mt-1">{job?.title}</p>
          </div>
          <button onClick={!submitting ? handleClose : undefined} className="p-2 rounded-xl hover:bg-neutral-100 text-neutral-400 hover:text-neutral-600 transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="px-8 py-7">
          {result ? (
            <ResultScreen result={result} onClose={handleClose} />
          ) : mode === 'quick' ? (
            /* ─── Quick Apply: single screen ─── */
            <div className="space-y-5">
              <Field label="Full Name" field="name" required placeholder="Your full name" value={form.name} error={errors.name} onChange={handleField} />
              <Field label="Email" field="email" type="email" required placeholder="you@example.com" value={form.email} error={errors.email} onChange={handleField} />
              <Field label="Phone" field="phone" type="tel" required placeholder="+91 XXXXXXXXXX" value={form.phone} error={errors.phone} onChange={handleField} />
              <FileUploadZone {...fileUploadProps} />
              <div className="pt-2">
                <button
                  onClick={handleSubmit}
                  disabled={submitting}
                  className="w-full py-3.5 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Application'}
                </button>
              </div>
            </div>
          ) : (
            /* ─── Full Apply: 3 steps ─── */
            <>
              <StepIndicator step={step} />

              {step === 1 && (
                <div key="step-1" className="space-y-5 apply-step-enter">
                  <Field label="Full Name" field="name" required placeholder="Your full name" value={form.name} error={errors.name} onChange={handleField} />
                  <Field label="Email" field="email" type="email" required placeholder="you@example.com" value={form.email} error={errors.email} onChange={handleField} />
                  <Field label="Phone" field="phone" type="tel" required placeholder="+91 XXXXXXXXXX" value={form.phone} error={errors.phone} onChange={handleField} />
                  <div className="flex justify-end pt-4">
                    <button onClick={handleNext} className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors">
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 2 && (
                <div key="step-2" className="space-y-5 apply-step-enter">
                  <FileUploadZone {...fileUploadProps} />
                  <div>
                    <label className="block text-sm font-medium text-neutral-700 mb-2">Cover Letter <span className="text-neutral-400 font-normal">(optional)</span></label>
                    <textarea
                      value={form.coverLetter}
                      onChange={(e) => handleField('coverLetter', e.target.value)}
                      rows={4}
                      placeholder="Why are you interested in this role?"
                      className="w-full px-4 py-3 rounded-xl border border-neutral-200 text-sm bg-white hover:border-neutral-300 focus:outline-none focus:ring-2 focus:ring-primary-600/15 focus:border-primary-400 resize-none"
                    />
                  </div>
                  <div className="flex justify-between pt-4">
                    <button onClick={handleBack} className="flex items-center gap-2 px-5 py-3 border border-neutral-200 text-neutral-600 text-sm font-medium rounded-xl hover:bg-neutral-50 transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button onClick={handleNext} className="flex items-center gap-2 px-6 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors">
                      Next <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              )}

              {step === 3 && (
                <div key="step-3" className="space-y-5 apply-step-enter">
                  <div className="bg-neutral-50 rounded-xl p-5 space-y-4 text-sm">
                    <h4 className="text-xs font-semibold text-neutral-400 uppercase tracking-wider">Review your details</h4>
                    <div className="space-y-3">
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Name</span>
                        <span className="text-neutral-900 font-medium">{form.name}</span>
                      </div>
                      <div className="border-t border-neutral-100" />
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Email</span>
                        <span className="text-neutral-900 font-medium">{form.email}</span>
                      </div>
                      <div className="border-t border-neutral-100" />
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Phone</span>
                        <span className="text-neutral-900 font-medium">{form.phone}</span>
                      </div>
                      <div className="border-t border-neutral-100" />
                      <div className="flex justify-between items-center">
                        <span className="text-neutral-500">Resume</span>
                        <span className="text-neutral-900 font-medium flex items-center gap-1.5"><FileText className="w-3.5 h-3.5 text-primary-500" /> {file?.name}</span>
                      </div>
                    </div>
                    {form.coverLetter && (
                      <>
                        <div className="border-t border-neutral-100" />
                        <div>
                          <span className="text-neutral-500 block mb-2">Cover Letter</span>
                          <p className="text-neutral-700 text-xs leading-relaxed bg-white rounded-lg p-4 border border-neutral-100">{form.coverLetter}</p>
                        </div>
                      </>
                    )}
                  </div>
                  <div className="flex justify-between pt-4">
                    <button onClick={handleBack} className="flex items-center gap-2 px-5 py-3 border border-neutral-200 text-neutral-600 text-sm font-medium rounded-xl hover:bg-neutral-50 transition-colors">
                      <ChevronLeft className="w-4 h-4" /> Back
                    </button>
                    <button
                      onClick={handleSubmit}
                      disabled={submitting}
                      className="flex items-center gap-2 px-7 py-3 bg-primary-600 text-white text-sm font-semibold rounded-xl hover:bg-primary-700 transition-colors disabled:opacity-50"
                    >
                      {submitting ? <><Loader2 className="w-4 h-4 animate-spin" /> Submitting...</> : 'Submit Application'}
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
