import { useState, useEffect, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { Loader2, Stethoscope, Building2, X } from 'lucide-react';
import { fetchFeaturedDoctors, fetchTenants } from '../api/publicApi';
import SEO from '../components/common/SEO';
import { EASE, VP } from '../components/common/designSystem';
import SearchBar from '../components/common/SearchBar';
import DoctorCard from '../components/marketplace/DoctorCard';
import ClinicCard from '../components/marketplace/ClinicCard';
import Pagination from '../components/marketplace/Pagination';

const LIMIT = 12;

const tabs = [
  { key: 'doctors', label: 'Doctors', icon: Stethoscope },
  { key: 'clinics', label: 'Clinics', icon: Building2 },
];

const SPECIALTIES = [
  'General Dentist', 'Orthodontist', 'Periodontist', 'Endodontist',
  'Oral Surgeon', 'Prosthodontist', 'Pediatric Dentist',
];

export default function Browse() {
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = searchParams.get('tab') || 'doctors';
  const q = searchParams.get('q') || '';
  const specialty = searchParams.get('specialty') || '';
  const location = searchParams.get('location') || '';
  const lat = searchParams.get('lat') || '';
  const lon = searchParams.get('lon') || '';
  const page = parseInt(searchParams.get('page') || '1', 10);

  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [totalPages, setTotalPages] = useState(1);
  const [total, setTotal] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);

    async function load() {
      try {
        if (tab === 'doctors') {
          const params = { page, limit: LIMIT };
          if (q) params.search = q;
          if (specialty) params.specialization = specialty;
          if (lat && lon) { params.lat = lat; params.lon = lon; }

          const res = await fetchFeaturedDoctors(params);
          if (cancelled) return;
          const raw = res.data || res;

          if (Array.isArray(raw) && raw.length > 0 && raw[0].doctors) {
            const flat = raw.flatMap((group) =>
              group.doctors.map((doc) => ({
                ...doc,
                clinicName: group.clinicName,
                clinicSlug: group.clinicSlug,
                clinicCity: group.clinicCity,
                // Carried through so DoctorCard can show the clinic's logo —
                // it was dropped here, which is why the doctors list had none.
                clinicLogo: group.clinicLogo || doc.clinicLogo || '',
                distanceKm: group.distanceKm,
              })),
            );
            setResults(flat);
            setTotalPages(1);
            setTotal(flat.length);
          } else if (Array.isArray(raw)) {
            setResults(raw);
            const meta = res.meta;
            setTotalPages(meta?.totalPages || 1);
            setTotal(meta?.total || raw.length);
          } else {
            setResults([]);
            setTotalPages(1);
            setTotal(0);
          }
        } else {
          const params = { page, limit: LIMIT };
          if (q) params.search = q;
          if (lat && lon) { params.lat = lat; params.lon = lon; }

          const res = await fetchTenants(params);
          if (cancelled) return;
          const raw = res.data || res;
          setResults(Array.isArray(raw) ? raw : []);
          const meta = res.meta;
          setTotalPages(meta?.totalPages || 1);
          setTotal(meta?.total || (Array.isArray(raw) ? raw.length : 0));
        }
      } catch {
        if (!cancelled) {
          setResults([]);
          setTotalPages(1);
          setTotal(0);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [tab, q, specialty, lat, lon, page]);

  const updateParams = useCallback((updates) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      Object.entries(updates).forEach(([k, v]) => {
        if (v === null || v === '' || v === undefined) {
          next.delete(k);
        } else {
          next.set(k, v);
        }
      });
      return next;
    });
  }, [setSearchParams]);

  const handleSearch = useCallback(({ query, location: loc, lat: newLat, lon: newLon }) => {
    updateParams({
      q: query || null,
      location: loc || null,
      lat: newLat || null,
      lon: newLon || null,
      page: null,
    });
  }, [updateParams]);

  const handleTabChange = useCallback((newTab) => {
    updateParams({ tab: newTab, page: null, specialty: null });
  }, [updateParams]);

  const handlePageChange = useCallback((newPage) => {
    updateParams({ page: newPage > 1 ? newPage : null });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, [updateParams]);

  const handleRemoveFilter = useCallback((key) => {
    updateParams({ [key]: null, page: null });
  }, [updateParams]);

  const activeFilters = [];
  if (specialty) activeFilters.push({ key: 'specialty', label: specialty });
  if (location) activeFilters.push({ key: 'location', label: location, removeKeys: ['location', 'lat', 'lon'] });

  return (
    <>
      <SEO
        title={tab === 'doctors' ? 'Browse Doctors' : 'Browse Clinics'}
        description={tab === 'doctors'
          ? 'Find and book top-rated dentists near you.'
          : 'Discover dental clinics on BestoClinic.'}
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
            <h1 className="text-4xl sm:text-5xl font-bold font-display text-white leading-tight mb-4">
              Find Your Perfect {tab === 'doctors' ? 'Doctor' : 'Clinic'}
            </h1>
            <p className="text-lg text-primary-100/80 max-w-xl mx-auto">
              Browse top-rated dental professionals and clinics near you.
            </p>
          </motion.div>

          <div className="max-w-3xl mx-auto">
            <SearchBar
              variant="page"
              defaultQuery={q}
              defaultLocation={location}
              defaultLat={lat ? parseFloat(lat) : null}
              defaultLon={lon ? parseFloat(lon) : null}
              onSearch={handleSearch}
            />
          </div>
        </div>
      </section>

      {/* Specialty Pills */}
      {tab === 'doctors' && (
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 -mt-5 relative z-10 mb-8">
          <div className="flex flex-wrap justify-center gap-2">
            {SPECIALTIES.map((spec) => (
              <button
                key={spec}
                onClick={() => updateParams({ specialty: spec === specialty ? null : spec, page: null })}
                className={`px-4 py-2 rounded-full text-sm font-medium transition-colors cursor-pointer shadow-sm ${
                  specialty === spec
                    ? 'bg-primary-600 text-white border border-primary-600'
                    : 'bg-white text-neutral-600 border border-neutral-200 hover:border-primary-200 hover:text-primary-600'
                }`}
              >
                {spec}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Content */}
      <div className="min-h-[60vh] bg-white pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
          {/* Tab Switcher */}
          <div className="flex justify-center mb-6">
            <div className="relative inline-flex items-center bg-neutral-100 rounded-2xl p-1 border border-neutral-200">
              <motion.div
                className="absolute top-1 bottom-1 rounded-xl bg-white shadow-sm border border-neutral-200/40"
                animate={{
                  left: tab === 'doctors' ? '4px' : '50%',
                  right: tab === 'doctors' ? '50%' : '4px',
                }}
                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
              />
              {tabs.map(({ key, label, icon: Icon }) => (
                <button
                  key={key}
                  onClick={() => handleTabChange(key)}
                  className={`relative z-10 flex items-center gap-2 px-6 py-2.5 text-sm font-semibold rounded-xl transition-colors duration-200 cursor-pointer ${
                    tab === key ? 'text-neutral-900' : 'text-neutral-400 hover:text-neutral-600'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Active Filters */}
          {activeFilters.length > 0 && (
            <div className="flex items-center gap-2 mb-6 flex-wrap">
              <span className="text-xs text-neutral-400 font-medium">Filters:</span>
              {activeFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => {
                    if (f.removeKeys) {
                      const updates = {};
                      f.removeKeys.forEach((k) => { updates[k] = null; });
                      updates.page = null;
                      updateParams(updates);
                    } else {
                      handleRemoveFilter(f.key);
                    }
                  }}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-primary-50 text-primary-700 rounded-lg border border-primary-200/40 hover:bg-primary-100 transition-colors cursor-pointer"
                >
                  {f.label}
                  <X className="w-3 h-3" />
                </button>
              ))}
            </div>
          )}

          {/* Results count */}
          {!loading && (
            <p className="text-sm text-neutral-400 mb-6">
              {total} {tab === 'doctors' ? 'doctor' : 'clinic'}{total !== 1 ? 's' : ''} found
              {q && <> for "<span className="font-medium text-neutral-600">{q}</span>"</>}
            </p>
          )}

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
            ) : results.length === 0 ? (
              <motion.div
                key="empty"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="text-center py-24"
              >
                <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  {tab === 'doctors' ? (
                    <Stethoscope className="w-7 h-7 text-neutral-300" />
                  ) : (
                    <Building2 className="w-7 h-7 text-neutral-300" />
                  )}
                </div>
                <h3 className="text-lg font-semibold text-neutral-900 mb-2">No results found</h3>
                <p className="text-sm text-neutral-400 max-w-md mx-auto">
                  Try adjusting your search or removing some filters to see more results.
                </p>
              </motion.div>
            ) : (
              <motion.div
                key={`${tab}-${page}`}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3 }}
              >
                <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                  {tab === 'doctors'
                    ? results.map((doc, i) => (
                        <DoctorCard key={doc._id || i} doctor={doc} index={i} />
                      ))
                    : results.map((clinic, i) => (
                        <ClinicCard key={clinic._id || i} clinic={clinic} index={i} />
                      ))}
                </div>

                <Pagination
                  currentPage={page}
                  totalPages={totalPages}
                  onPageChange={handlePageChange}
                />
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </>
  );
}
