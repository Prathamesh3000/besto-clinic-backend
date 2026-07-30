import { useState, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, MapPin, Clock, Building2, Briefcase, DollarSign, Award, Send, Zap } from 'lucide-react';
import { getPublicJob } from '../lib/careersApi';
import { resolveAssetUrl } from '../lib/assetUrl';
import ApplyModal from '../components/careers/ApplyModal';

const EMPLOYMENT_LABELS = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
};

const EXPERIENCE_LABELS = {
  entry: 'Entry Level',
  mid: 'Mid Level',
  senior: 'Senior Level',
};

/**
 * Known section-header phrases for job descriptions.
 * Sorted longest-first so "Required Qualifications" matches before "Qualifications".
 */
const SECTION_HEADERS = [
  'Key Responsibilities', 'Core Responsibilities', 'Major Responsibilities',
  'Role Responsibilities', 'Your Responsibilities', 'Responsibilities',
  "What You'll Do", 'What You Will Do', 'Duties',
  "What We're Looking For", 'What We Are Looking For', "Who We're Looking For",
  'What We Offer', 'Why Join Us', 'Why Work With Us',
  'Required Qualifications', 'Preferred Qualifications', 'Minimum Qualifications',
  'Job Requirements', 'Role Requirements', 'Requirements',
  'Qualifications', 'Nice to Have', 'Bonus Points', 'Good to Have',
  'About the Role', 'About the Position', 'About Us', 'About the Company',
  'Role Overview', 'Position Summary', 'Job Summary', 'Job Description', 'Overview',
  'Perks & Benefits', 'Perks and Benefits', 'Salary & Benefits', 'Salary and Benefits',
  'Benefits', 'Perks', 'Compensation & Benefits',
  'Required Skills', 'Skills Required', 'Desired Skills', 'Technical Skills', 'Skills',
  'Core Competencies', 'Competencies',
  'Education & Experience', 'Education', 'Work Experience', 'Experience Required', 'Experience',
  'Work Environment', 'Working Hours', 'Schedule', 'Location',
  'How to Apply', 'Application Process',
].sort((a, b) => b.length - a.length);

/** Find positions of known section headers within text */
function findSectionHeaders(text) {
  const lower = text.toLowerCase();
  const found = [];

  for (const header of SECTION_HEADERS) {
    const target = header.toLowerCase();
    let pos = 0;
    while ((pos = lower.indexOf(target, pos)) !== -1) {
      const before = pos > 0 ? text[pos - 1] : '\n';
      const afterIdx = pos + header.length;
      const after = afterIdx < text.length ? text[afterIdx] : '\n';
      const isSingleWord = !header.includes(' ');

      // Word boundary: preceded by whitespace, newline, or punctuation (or start of text)
      const validBefore = /[\s\n.!?,;:(]/.test(before) || pos === 0;
      // Followed by whitespace, newline, colon, or end of text
      const validAfter = /[\s\n:.]/.test(after) || afterIdx === text.length;

      // Single-word headers (e.g. "Education") require stronger boundary to avoid mid-sentence matches
      const strongBoundary = !isSingleWord || pos === 0 || /[\n.]/.test(before);

      if (validBefore && validAfter && strongBoundary) {
        found.push({ header: text.slice(pos, afterIdx), index: pos, length: header.length });
      }
      pos = afterIdx;
    }
  }

  found.sort((a, b) => a.index - b.index);
  // Remove overlapping matches
  const result = [];
  for (const f of found) {
    const last = result[result.length - 1];
    if (!last || f.index >= last.index + last.length) result.push(f);
  }
  return result;
}

/** Split text into paragraphs by newlines */
function splitParagraphs(text) {
  return text.split(/\n\s*\n|\n/).map((p) => p.trim()).filter(Boolean);
}

/** Split section content into individual bullet items */
function splitIntoBullets(text) {
  if (!text) return [];

  // 1. If content has multiple newlines, split by line
  const byLine = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (byLine.length > 1) {
    return byLine.map((l) => l.replace(/^[-•*]\s+/, '').replace(/^\d+[.)]\s+/, ''));
  }

  // 2. Try explicit list markers within the text
  const byMarker = text.split(/\s*[-•*]\s+/).filter(Boolean);
  if (byMarker.length > 1) return byMarker.map((s) => s.trim());

  // 3. Smart split: detect boundaries where lowercase→space→Uppercase with min chunk length
  const items = [];
  let start = 0;
  for (let i = 1; i < text.length - 1; i++) {
    if (
      text[i] === ' ' &&
      /[a-z).]/.test(text[i - 1]) &&
      /[A-Z]/.test(text[i + 1]) &&
      (i - start) >= 20
    ) {
      items.push(text.slice(start, i).trim());
      start = i + 1;
    }
  }
  if (start < text.length) items.push(text.slice(start).trim());

  return items.length > 0 ? items.filter(Boolean) : [text.trim()];
}

/**
 * Parse plain-text job description into structured JSX.
 * Detects section headers (inline or line-based), renders content as indented bullet points.
 */
function formatJobDescription(text) {
  if (!text) return null;

  // Already HTML → render as-is
  if (/<[a-z][\s\S]*>/i.test(text)) {
    return <div className="prose prose-sm max-w-none text-neutral-700" dangerouslySetInnerHTML={{ __html: text }} />;
  }

  const headers = findSectionHeaders(text);

  // No recognisable headers → render as simple paragraphs
  if (headers.length === 0) {
    return (
      <div className="space-y-3">
        {splitParagraphs(text).map((p, i) => (
          <p key={i} className="text-sm text-neutral-700 leading-relaxed">{p}</p>
        ))}
      </div>
    );
  }

  // Build intro + sections
  const sections = [];
  const introText = text.slice(0, headers[0].index).trim();
  if (introText) sections.push({ type: 'intro', content: introText });

  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const contentStart = h.index + h.length;
    const contentEnd = i + 1 < headers.length ? headers[i + 1].index : text.length;
    let content = text.slice(contentStart, contentEnd).trim();
    content = content.replace(/^[:\-–—]\s*/, ''); // strip leading colon / dash after header
    if (content) sections.push({ type: 'section', header: h.header, content });
  }

  return (
    <div className="space-y-6">
      {sections.map((s, idx) => {
        if (s.type === 'intro') {
          return (
            <div key={idx} className="space-y-3">
              {splitParagraphs(s.content).map((p, i) => (
                <p key={i} className="text-sm text-neutral-700 leading-relaxed">{p}</p>
              ))}
            </div>
          );
        }
        const bullets = splitIntoBullets(s.content);
        return (
          <div key={idx}>
            <p className="text-sm font-semibold text-neutral-800 mb-2.5">{s.header}</p>
            <ul className="space-y-2 pl-4">
              {bullets.map((item, i) => (
                <li key={i} className="flex items-start gap-2.5 text-sm text-neutral-700 leading-relaxed">
                  <span className="mt-[7px] w-1.5 h-1.5 rounded-full bg-neutral-900 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        );
      })}
    </div>
  );
}

export default function JobDetail() {
  const { slug } = useParams();
  const [job, setJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [modalMode, setModalMode] = useState('full');

  useEffect(() => {
    setLoading(true);
    getPublicJob(slug)
      .then((r) => setJob(r.data))
      .catch((err) => {
        console.error('Failed to load job:', err.message);
      })
      .finally(() => setLoading(false));
  }, [slug]);

  const openApply = (mode) => {
    setModalMode(mode);
    setModalOpen(true);
  };

  if (loading) {
    return (
      <div className="bg-neutral-50 pt-24 lg:pt-28 pb-16 flex items-center justify-center min-h-[60vh]">
        <span className="text-neutral-400">Loading job details...</span>
      </div>
    );
  }

  if (!job) {
    return (
      <div className="bg-neutral-50 pt-24 lg:pt-28 pb-16 flex flex-col items-center justify-center min-h-[60vh]">
        <p className="text-neutral-500 mb-4">Job not found</p>
        <Link to="/careers" className="text-primary-600 font-medium">Back to jobs</Link>
      </div>
    );
  }

  return (
    <div className="bg-neutral-50 pt-20 lg:pt-24 pb-16">
      <div className="max-w-6xl mx-auto px-6 lg:px-10 py-10">
        {/* Breadcrumb */}
        <Link to="/careers" className="inline-flex items-center gap-2 text-sm text-neutral-500 hover:text-primary-600 mb-8 transition-colors">
          <ArrowLeft className="w-4 h-4" /> Back to Jobs
        </Link>

        {/* Hero header — clinic logo + title + meta tags */}
        <div className="flex items-start gap-5 mb-10">
          {job.clinicLogo ? (
            <img
              src={resolveAssetUrl(job.clinicLogo)}
              alt={job.clinicName}
              className="w-14 h-14 rounded-xl object-cover border border-neutral-200 shrink-0"
            />
          ) : (
            <div className="w-14 h-14 rounded-xl bg-white border border-neutral-200 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-neutral-400" />
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-2xl lg:text-3xl font-bold text-neutral-900 leading-tight">{job.title}</h1>
            <p className="text-neutral-500 mt-1">{job.clinicName}{(job.location?.city || job.clinicLocation?.city) ? ` \u00B7 ${job.location?.city || job.clinicLocation?.city}${(job.location?.state || job.clinicLocation?.state) ? `, ${job.location?.state || job.clinicLocation?.state}` : ''}` : ''}</p>
            <div className="flex flex-wrap gap-2.5 mt-4">
              {(job.location?.city || job.clinicLocation?.city) && (
                <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600">
                  <MapPin className="w-3.5 h-3.5 text-neutral-400" /> {job.location?.city || job.clinicLocation?.city}{(job.location?.state || job.clinicLocation?.state) ? `, ${job.location?.state || job.clinicLocation?.state}` : ''}
                </span>
              )}
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600">
                <Clock className="w-3.5 h-3.5 text-neutral-400" /> {EMPLOYMENT_LABELS[job.employmentType] || job.employmentType}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600">
                <Briefcase className="w-3.5 h-3.5 text-neutral-400" /> {job.department}
              </span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-white border border-neutral-200 rounded-lg text-sm text-neutral-600">
                <Award className="w-3.5 h-3.5 text-neutral-400" /> {EXPERIENCE_LABELS[job.requirements?.experienceLevel] || 'Any'}
              </span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-10">
          {/* Main Content — open layout, no card wrapper */}
          <div className="col-span-12 lg:col-span-8 space-y-10">
            {/* Description */}
            <div>
              {formatJobDescription(job.description)}
            </div>

            {/* Requirements */}
            {((job.requirements?.certifications?.length > 0) || (job.requirements?.skills?.length > 0)) && (
              <div className="pt-8 border-t border-neutral-200">
                <h2 className="text-base font-semibold text-neutral-900 mb-5">Requirements</h2>
                {job.requirements.certifications?.length > 0 && (
                  <div className="mb-5">
                    <p className="text-sm font-medium text-neutral-500 mb-2.5">Certifications</p>
                    <div className="flex flex-wrap gap-2">
                      {job.requirements.certifications.map((c) => (
                        <span key={c} className="px-3.5 py-1.5 bg-primary-50 text-primary-700 text-sm font-medium rounded-lg">{c}</span>
                      ))}
                    </div>
                  </div>
                )}
                {job.requirements.skills?.length > 0 && (
                  <div>
                    <p className="text-sm font-medium text-neutral-500 mb-2.5">Skills</p>
                    <div className="flex flex-wrap gap-2">
                      {job.requirements.skills.map((s) => (
                        <span key={s} className="px-3.5 py-1.5 bg-purple-50 text-purple-700 text-sm font-medium rounded-lg">{s}</span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Sidebar */}
          <div className="col-span-12 lg:col-span-4 space-y-5">
            {/* Apply Card */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6 space-y-3 lg:sticky lg:top-28">
              <button
                onClick={() => openApply('full')}
                className="w-full py-3.5 bg-primary-600 text-white font-semibold rounded-xl hover:bg-primary-700 transition-colors flex items-center justify-center gap-2"
              >
                <Send className="w-4 h-4" /> Apply
              </button>
              <button
                onClick={() => openApply('quick')}
                className="w-full py-3 border border-neutral-200 text-neutral-700 font-medium rounded-xl hover:bg-neutral-50 transition-colors flex items-center justify-center gap-2"
              >
                <Zap className="w-4 h-4" /> Quick Apply
              </button>
              <p className="text-xs text-neutral-400 text-center">No account needed</p>
            </div>

            {/* Compensation */}
            {job.compensation?.showSalary && job.compensation.salaryMax > 0 && (
              <div className="bg-white rounded-2xl border border-neutral-200 p-6">
                <h3 className="text-sm font-semibold text-neutral-900 mb-2">Compensation</h3>
                <p className="text-xl font-bold text-secondary-600">
                  &#8377;{job.compensation.salaryMin.toLocaleString('en-IN')} – &#8377;{job.compensation.salaryMax.toLocaleString('en-IN')}
                </p>
                <p className="text-xs text-neutral-500 mt-1">per month</p>
                {job.compensation.hasBenefits && (
                  <p className="text-sm text-neutral-600 mt-2">+ Benefits package included</p>
                )}
              </div>
            )}

            {/* Clinic Info */}
            <div className="bg-white rounded-2xl border border-neutral-200 p-6">
              <h3 className="text-sm font-semibold text-neutral-900 mb-3">About the Clinic</h3>
              <div className="flex items-center gap-3">
                {job.clinicLogo ? (
                  <img src={resolveAssetUrl(job.clinicLogo)} alt={job.clinicName} className="w-10 h-10 rounded-xl object-cover border border-neutral-200" />
                ) : (
                  <div className="w-10 h-10 rounded-xl bg-neutral-100 flex items-center justify-center">
                    <Building2 className="w-5 h-5 text-neutral-500" />
                  </div>
                )}
                <div>
                  <p className="text-sm font-medium text-neutral-900">{job.clinicName}</p>
                  {job.clinicLocation?.city && (
                    <p className="text-xs text-neutral-500">{job.clinicLocation.city}, {job.clinicLocation.state}</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Apply Modal */}
      <ApplyModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        job={job}
        mode={modalMode}
      />
    </div>
  );
}
