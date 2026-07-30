import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Loader2, ArrowRight, KeyRound } from 'lucide-react';
import { fetchFeaturedDoctors } from '../../api/publicApi';
import { resolveClinicCode } from '../../tenant/api';
import SectionHeading from '../common/SectionHeading';
import Button from '../common/Button';
import DoctorCard from '../marketplace/DoctorCard';

export default function DoctorDiscovery() {
  const navigate = useNavigate();
  const [doctors, setDoctors] = useState([]);
  const [loading, setLoading] = useState(true);

  // Clinic code quick-join
  const [clinicCode, setClinicCode] = useState('');
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState('');

  useEffect(() => {
    let cancelled = false;

    async function loadDoctors() {
      try {
        const res = await fetchFeaturedDoctors({ limit: 8 });
        if (cancelled) return;
        // API returns flat list or clinic-grouped — normalize to flat
        const raw = res.data || res;
        let flat = [];
        if (Array.isArray(raw)) {
          raw.forEach((item) => {
            if (item.doctors) {
              item.doctors.forEach((doc) => flat.push({
                ...doc,
                clinicName: item.clinicName,
                clinicCity: item.clinicCity,
              }));
            } else {
              flat.push(item);
            }
          });
        }
        // Ensure clinic diversity — max 2 doctors per clinic
        const clinicCount = {};
        const diverse = [];
        for (const d of flat) {
          const key = d.clinicSlug || d.clinicName || '';
          clinicCount[key] = (clinicCount[key] || 0) + 1;
          if (clinicCount[key] <= 2) diverse.push(d);
          if (diverse.length >= 8) break;
        }
        setDoctors(diverse);
      } catch {
        setDoctors([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    loadDoctors();
    return () => { cancelled = true; };
  }, []);

  const handleClinicCodeSubmit = async (e) => {
    e.preventDefault();
    const code = clinicCode.trim().toUpperCase();
    if (!code) return;
    setCodeLoading(true);
    setCodeError('');
    try {
      const res = await resolveClinicCode(code);
      const clinic = res.data;
      navigate(`/patient/register?clinic=${clinic.slug}&clinicName=${encodeURIComponent(clinic.name)}&clinicCode=${code}&clinicId=${clinic.clinicId}`);
    } catch {
      setCodeError('Invalid clinic code. Please check and try again.');
    } finally {
      setCodeLoading(false);
    }
  };

  return (
    <section id="find-doctors" className="py-20 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <SectionHeading
          label="Featured Doctors"
          title="Top-rated doctors on BestoClinic"
          description="Click any doctor to view their profile and book an appointment — no account needed to browse"
        />

        {loading ? (
          <div className="flex justify-center py-16">
            <Loader2 className="w-7 h-7 text-primary-400 animate-spin" />
          </div>
        ) : doctors.length === 0 ? (
          <div className="text-center py-16">
            <p className="text-neutral-900/40 text-sm">Doctors will appear here once clinics are onboarded.</p>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5 mt-12">
            {doctors.map((doc, i) => (
              <DoctorCard key={doc._id || i} doctor={doc} index={i} />
            ))}
          </div>
        )}

        {/* ── Browse All CTAs ── */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4 mt-10">
          <Button variant="primary" to="/browse?tab=doctors">
            Browse All Doctors <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
          <Button variant="outline" to="/browse?tab=clinics">
            Browse All Clinics
          </Button>
        </div>

        {/* ── Quick Join: Clinic Code ── */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5, delay: 0.2 }}
          className="mt-16 max-w-2xl mx-auto"
        >
          <div className="bg-gradient-to-br from-neutral-50 to-white rounded-2xl border border-neutral-300/60 p-8 text-center">
            <div className="w-12 h-12 bg-primary-50 rounded-2xl flex items-center justify-center mx-auto mb-4">
              <KeyRound className="w-6 h-6 text-primary-600" />
            </div>
            <h3 className="text-lg font-bold font-display text-neutral-900 mb-2">
              Have a Clinic Code?
            </h3>
            <p className="text-sm text-neutral-900/50 mb-6 max-w-md mx-auto">
              If your clinic gave you a code (e.g. SMILE2847), enter it below to register directly.
            </p>

            <form onSubmit={handleClinicCodeSubmit} className="flex gap-3 max-w-sm mx-auto">
              <div className="flex-1 relative">
                <input
                  type="text"
                  value={clinicCode}
                  onChange={(e) => { setClinicCode(e.target.value.toUpperCase()); setCodeError(''); }}
                  placeholder="Enter clinic code"
                  maxLength={10}
                  className="w-full px-4 py-3 text-sm font-medium border border-neutral-300/60 rounded-xl focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-400 transition bg-white tracking-wider uppercase placeholder:normal-case placeholder:tracking-normal"
                />
              </div>
              <button
                type="submit"
                disabled={codeLoading || !clinicCode.trim()}
                className="px-6 py-3 text-sm font-semibold text-white bg-gradient-to-r from-primary-500 to-primary-600 rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all disabled:opacity-50 cursor-pointer flex items-center gap-2 shadow-sm shadow-primary-600/20"
              >
                {codeLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <>Join <ArrowRight className="w-4 h-4" /></>
                )}
              </button>
            </form>
            {codeError && (
              <p className="text-xs text-red-600 mt-3">{codeError}</p>
            )}

            <p className="text-xs text-neutral-900/30 mt-4">
              Don't have a code? Browse the doctors above and register when you book.
            </p>
          </div>
        </motion.div>
      </div>
    </section>
  );
}
