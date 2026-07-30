import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, MapPin, Briefcase, Clock, Star,
  ChevronLeft, ChevronRight, Stethoscope, ClipboardList,
  HeartPulse, Microscope, Loader2, ArrowRight, Tag,
  Syringe, Brain, Baby, Bone, Eye, Smile,
} from 'lucide-react';
import { listPublicJobs, getPublicDepartments } from '../lib/careersApi';
import { resolveAssetUrl } from '../lib/assetUrl';
import SEO from '../components/common/SEO';
import Btn from '../components/common/Btn';
import { EASE, VP } from '../components/common/designSystem';

/** Map known department keywords to icons. Unmatched departments get Tag icon. */
const DEPT_ICON_MAP = {
  nursing: Stethoscope,
  administration: ClipboardList,
  specialist: HeartPulse,
  technician: Microscope,
  clinical: Stethoscope,
  dental: Smile,
  surgery: Syringe,
  cardiology: HeartPulse,
  neurology: Brain,
  pediatrics: Baby,
  orthopedics: Bone,
  ophthalmology: Eye,
  radiology: Microscope,
  pharmacy: Syringe,
  laboratory: Microscope,
  hr: ClipboardList,
  finance: ClipboardList,
  reception: ClipboardList,
};

function getDeptIcon(label) {
  const key = label.toLowerCase().trim();
  for (const [k, icon] of Object.entries(DEPT_ICON_MAP)) {
    if (key.includes(k)) return icon;
  }
  return Tag;
}

const FALLBACK_CATEGORIES = ['Nursing', 'Administration', 'Specialist', 'Technician'];

const EMPLOYMENT_LABELS = {
  full_time: 'Full-time',
  part_time: 'Part-time',
  contract: 'Contract',
};

/** Reusable job card — used in both featured carousel and regular grid */
function JobCard({ job, navigate, featured = false }) {
  return (
    <motion.div
      onClick={() => navigate(`/careers/${job.slug}`)}
      whileHover={{ y: -2 }}
      transition={{ duration: 0.2 }}
      className={`bg-white rounded-2xl border p-6 cursor-pointer hover:shadow-lg transition-all duration-300 ${
        featured
          ? 'border-primary-200 ring-1 ring-primary-100 hover:shadow-primary-100/50'
          : 'border-neutral-200 hover:border-primary-200 hover:shadow-primary-100/50'
      }`}
    >
      {featured && (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-gradient-to-r from-primary-500 to-primary-600 text-white text-xs rounded-full font-semibold mb-3">
          <Star className="w-3 h-3 fill-white" /> Featured
        </span>
      )}

      <div className="flex items-start gap-3 mb-4">
        {job.clinicLogo ? (
          <img
            src={resolveAssetUrl(job.clinicLogo)}
            alt={job.clinicName}
            className="w-11 h-11 rounded-xl object-cover border border-neutral-200 shrink-0"
          />
        ) : (
          <div className="w-11 h-11 rounded-xl bg-primary-50 flex items-center justify-center text-sm font-bold text-primary-600 shrink-0">
            {(job.clinicName || 'C')[0]}
          </div>
        )}
        <div className="flex-1 min-w-0">
          <h3 className="text-base font-semibold text-neutral-900 truncate">{job.title}</h3>
          <p className="text-sm text-neutral-500">{job.clinicName}</p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3 mb-4">
        {(job.location?.city || job.clinicLocation?.city) && (
          <span className="flex items-center gap-1 text-xs text-neutral-500">
            <MapPin className="w-3.5 h-3.5" /> {(job.location?.city || job.clinicLocation?.city)}{(job.location?.state || job.clinicLocation?.state) ? `, ${job.location?.state || job.clinicLocation?.state}` : ''}
          </span>
        )}
        <span className="flex items-center gap-1 text-xs text-neutral-500">
          <Clock className="w-3.5 h-3.5" /> {EMPLOYMENT_LABELS[job.employmentType] || job.employmentType}
        </span>
      </div>

      <div className="flex flex-wrap gap-1.5 mb-4">
        {(job.requirements?.skills || []).slice(0, 3).map((s) => (
          <span key={s} className="px-2.5 py-1 bg-primary-50/80 text-primary-700 text-xs rounded-lg font-medium border border-primary-200/40">
            {s}
          </span>
        ))}
      </div>

      {job.compensation?.showSalary && job.compensation.salaryMax > 0 && (
        <p className="text-sm font-semibold text-primary-600">
          &#8377;{job.compensation.salaryMin.toLocaleString('en-IN')} – &#8377;{job.compensation.salaryMax.toLocaleString('en-IN')}/mo
        </p>
      )}
    </motion.div>
  );
}

/** Featured carousel + regular grid split */
function FeaturedAndGrid({ jobs, navigate, page, totalPages, setPage }) {
  const scrollRef = useRef(null);

  const featuredJobs = jobs.filter((j) => j.isFeatured);
  const regularJobs = jobs.filter((j) => !j.isFeatured);

  const scroll = (dir) => {
    if (!scrollRef.current) return;
    const amount = scrollRef.current.offsetWidth * 0.8;
    scrollRef.current.scrollBy({ left: dir === 'left' ? -amount : amount, behavior: 'smooth' });
  };

  return (
    <motion.div
      key={`jobs-${page}`}
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Featured Carousel */}
      {featuredJobs.length > 0 && (
        <div className="mb-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Star className="w-4 h-4 text-primary-500 fill-primary-500" />
              <h3 className="text-sm font-semibold text-neutral-900 uppercase tracking-wide">Featured Positions</h3>
            </div>
            {featuredJobs.length > 2 && (
              <div className="flex items-center gap-1.5">
                <button
                  onClick={() => scroll('left')}
                  className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <ChevronLeft className="w-4 h-4 text-neutral-600" />
                </button>
                <button
                  onClick={() => scroll('right')}
                  className="p-1.5 rounded-lg border border-neutral-200 hover:bg-neutral-50 transition-colors cursor-pointer"
                >
                  <ChevronRight className="w-4 h-4 text-neutral-600" />
                </button>
              </div>
            )}
          </div>
          <div
            ref={scrollRef}
            className="flex gap-5 overflow-x-auto pb-2 snap-x snap-mandatory scrollbar-hide"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {featuredJobs.map((job) => (
              <div key={job._id} className="w-[340px] sm:w-[380px] shrink-0 snap-start">
                <JobCard job={job} navigate={navigate} featured />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Regular Grid */}
      {regularJobs.length > 0 && (
        <div>
          {featuredJobs.length > 0 && (
            <div className="flex items-center gap-4 mb-6">
              <hr className="flex-1 border-neutral-200" />
              <span className="text-xs font-medium text-neutral-400 uppercase tracking-wider shrink-0">All Positions</span>
              <hr className="flex-1 border-neutral-200" />
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {regularJobs.map((job) => (
              <JobCard key={job._id} job={job} navigate={navigate} />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2 mt-12">
          <button
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
            className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
          {Array.from({ length: Math.min(totalPages, 5) }, (_, i) => i + 1).map((p) => (
            <button
              key={p}
              onClick={() => setPage(p)}
              className={`w-10 h-10 rounded-xl text-sm font-medium transition-colors cursor-pointer ${
                page === p
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'border border-neutral-200 text-neutral-600 hover:bg-neutral-50'
              }`}
            >
              {p}
            </button>
          ))}
          <button
            disabled={page >= totalPages}
            onClick={() => setPage(page + 1)}
            className="p-2.5 rounded-xl border border-neutral-200 hover:bg-neutral-50 disabled:opacity-40 transition-colors cursor-pointer disabled:cursor-not-allowed"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}
    </motion.div>
  );
}

export default function Careers() {
  const navigate = useNavigate();
  const [jobs, setJobs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [filters, setFilters] = useState({
    search: '',
    city: '',
    employmentType: '',
    department: '',
    sort: 'newest',
  });
  const [searchInput, setSearchInput] = useState('');
  const [cityInput, setCityInput] = useState('');
  const [departments, setDepartments] = useState([]);

  useEffect(() => {
    getPublicDepartments()
      .then((res) => {
        const depts = res.data || [];
        setDepartments(depts.length > 0 ? depts : FALLBACK_CATEGORIES);
      })
      .catch(() => setDepartments(FALLBACK_CATEGORIES));
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    try {
      const res = await listPublicJobs({ ...filters, page, limit: 12 });
      setJobs(res.data || []);
      setTotal(res.meta?.total || 0);
    } catch (err) {
      console.error('Failed to load jobs:', err.message);
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { fetchJobs(); }, [fetchJobs]);

  const handleSearch = (e) => {
    e.preventDefault();
    setFilters((f) => ({ ...f, search: searchInput, city: cityInput }));
    setPage(1);
  };

  const totalPages = Math.ceil(total / 12);

  return (
    <>
      <SEO
        title="Careers"
        description="Find your next healthcare role at top clinics. Browse nursing, administration, specialist, and technician positions."
        keywords="healthcare jobs, dental careers, clinic jobs, nursing jobs"
      />

      {/* Hero */}
      <section
        className="relative overflow-hidden"
        style={{ background: 'linear-gradient(135deg, var(--color-primary-700) 0%, var(--color-primary-950) 100%)' }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <div className="absolute top-1/4 right-0 w-[600px] h-[600px] bg-primary-500/10 rounded-full blur-[120px]" />
        </div>

        <div className="relative max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-36 lg:pt-44 pb-24">
          <motion.div
            initial={{ opacity: 0, y: 30 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: EASE }}
            className="text-center mb-10"
          >
            <span className="inline-block px-4 py-1.5 bg-white/10 text-white text-sm font-semibold rounded-full mb-6 tracking-wide uppercase border border-white/20">
              Careers
            </span>
            <h1 className="text-4xl sm:text-5xl xl:text-6xl font-bold font-display text-white leading-tight mb-6">
              Find Your Next Healthcare Role
            </h1>
            <p className="text-lg text-primary-100/80 leading-relaxed max-w-2xl mx-auto mb-10">
              Discover opportunities at top clinics across India. From nursing to administration, find a role that matches your skills.
            </p>

            {/* Department Pills — dynamic from active job postings */}
            <div className="flex flex-wrap justify-center gap-3">
              {departments.slice(0, 8).map((dept) => {
                const Icon = getDeptIcon(dept);
                const isActive = filters.department === dept;
                return (
                  <button
                    key={dept}
                    onClick={() => {
                      setFilters((f) => ({
                        ...f,
                        department: f.department === dept ? '' : dept,
                        search: '',
                      }));
                      setSearchInput('');
                      setPage(1);
                    }}
                    className={`flex items-center gap-2 px-5 py-2.5 backdrop-blur-sm rounded-xl text-sm font-medium transition-colors cursor-pointer border ${
                      isActive
                        ? 'bg-white text-primary-700 border-white/80'
                        : 'bg-white/10 text-white hover:bg-white/20 border-white/10'
                    }`}
                  >
                    <Icon className="w-4 h-4" /> {dept}
                  </button>
                );
              })}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Search Bar — overlapping hero */}
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 -mt-7 relative z-10 mb-8">
        <motion.form
          onSubmit={handleSearch}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.2, ease: EASE }}
          className="bg-white rounded-2xl shadow-xl shadow-neutral-200/60 border border-neutral-200 p-4 flex flex-col sm:flex-row items-center gap-4"
        >
          <div className="flex-1 relative w-full">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="Job title, keywords, or clinic"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm border border-neutral-200 rounded-xl focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
            />
          </div>
          <div className="flex-1 relative w-full">
            <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-neutral-400" />
            <input
              type="text"
              placeholder="City, state, or remote"
              value={cityInput}
              onChange={(e) => setCityInput(e.target.value)}
              className="w-full pl-10 pr-4 py-3 text-sm border border-neutral-200 rounded-xl focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none transition-colors"
            />
          </div>
          <Btn type="submit" className="w-full sm:w-auto">
            Search Jobs
          </Btn>
        </motion.form>
      </div>

      {/* Job Listings */}
      <div className="min-h-[60vh] bg-white pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          {/* Header + Sort */}
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold font-display text-neutral-900">
                {filters.search ? `Results for "${filters.search}"` : filters.department ? `${filters.department} Jobs` : 'Recommended for You'}
              </h2>
              <p className="text-sm text-neutral-400 mt-1">{total} position{total !== 1 ? 's' : ''} available</p>
            </div>
            <select
              value={filters.sort}
              onChange={(e) => { setFilters((f) => ({ ...f, sort: e.target.value })); setPage(1); }}
              className="px-3 py-2 border border-neutral-200 rounded-xl text-sm bg-white focus:border-primary-600 focus:ring-2 focus:ring-primary-100 outline-none cursor-pointer"
            >
              <option value="newest">Newest First</option>
              <option value="salary_high">Highest Salary</option>
              <option value="salary_low">Lowest Salary</option>
            </select>
          </div>

          {/* Results */}
          <AnimatePresence mode="wait">
            {loading ? (
              <motion.div
                key="loading"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="flex justify-center py-24"
              >
                <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
              </motion.div>
            ) : jobs.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-24"
              >
                <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Briefcase className="w-7 h-7 text-neutral-300" />
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">No jobs found</h3>
                <p className="text-sm text-neutral-400 max-w-md mx-auto">
                  Try adjusting your search or removing some filters to see more results.
                </p>
              </motion.div>
            ) : (
              <FeaturedAndGrid jobs={jobs} navigate={navigate} page={page} totalPages={totalPages} setPage={setPage} />
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* CTA Banner */}
      <section className="py-20 bg-neutral-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <motion.div
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={VP}
            transition={{ duration: 0.5, ease: EASE }}
            className="bg-gradient-to-br from-primary-600 via-primary-700 to-primary-800 rounded-3xl p-10 lg:p-16 text-center relative overflow-hidden"
          >
            <div className="absolute inset-0 pointer-events-none">
              <div className="absolute top-0 right-0 w-80 h-80 bg-white/5 rounded-full blur-3xl" />
            </div>
            <div className="relative">
              <h2 className="text-3xl md:text-4xl font-bold font-display text-white mb-4">
                Ready to grow your team?
              </h2>
              <p className="text-primary-100/80 text-lg max-w-xl mx-auto mb-8">
                Post jobs on BestoClinic and reach thousands of qualified healthcare professionals.
              </p>
              <div className="flex flex-col sm:flex-row gap-4 justify-center">
                <Btn variant="ctaWhite" to="/register">
                  Post a Job <ArrowRight className="w-4 h-4 ml-2" />
                </Btn>
                <Btn variant="heroOutline" to="/contact">Contact Us</Btn>
              </div>
            </div>
          </motion.div>
        </div>
      </section>
    </>
  );
}
