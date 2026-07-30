import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, MapPin, Phone, Mail, Hash, ChevronRight, Loader2, Clock, Users } from 'lucide-react';
import { fetchTenant, getClinicDoctors, getClinicBranches } from '../api/publicApi';
import SEO from '../components/common/SEO';
import SectionHeading from '../components/common/SectionHeading';
import DoctorCard from '../components/marketplace/DoctorCard';
import { resolveAssetUrl } from '../lib/assetUrl';

export default function ClinicProfile() {
  const { slug } = useParams();
  const [clinic, setClinic] = useState(null);
  const [doctors, setDoctors] = useState([]);
  const [branches, setBranches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [logoError, setLogoError] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const [clinicRes, doctorsRes, branchesRes] = await Promise.all([
          fetchTenant(slug),
          getClinicDoctors(slug).catch(() => ({ data: [] })),
          getClinicBranches(slug).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setClinic(clinicRes.data || clinicRes);
        const rawDoctors = doctorsRes.data || doctorsRes;
        setDoctors(Array.isArray(rawDoctors) ? rawDoctors : []);
        const rawBranches = branchesRes.data || branchesRes;
        setBranches(Array.isArray(rawBranches) ? rawBranches : []);
      } catch {
        if (!cancelled) setError('Clinic not found');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [slug]);

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-50/50 pt-32 flex justify-center">
        <Loader2 className="w-8 h-8 text-primary-400 animate-spin" />
      </div>
    );
  }

  if (error || !clinic) {
    return (
      <div className="min-h-screen bg-neutral-50/50 pt-32 text-center px-4">
        <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
          <Building2 className="w-7 h-7 text-neutral-900/20" />
        </div>
        <h2 className="text-xl font-bold text-neutral-900 mb-2">Clinic Not Found</h2>
        <p className="text-sm text-neutral-900/40 mb-6">This clinic may not exist or is no longer active.</p>
        <Link to="/browse?tab=clinics" className="text-sm font-semibold text-primary-600 hover:text-primary-700 transition-colors">
          Browse All Clinics
        </Link>
      </div>
    );
  }

  const address = clinic.address || {};
  const addressParts = [address.street, address.locality, address.city, address.state].filter(Boolean);

  return (
    <>
      <SEO
        title={`${clinic.name} — BestoClinic`}
        description={`Visit ${clinic.name} in ${address.city || 'your city'}. View doctors, book appointments, and more.`}
      />

      <div className="min-h-screen bg-neutral-50/50 pt-24 lg:pt-28 pb-16">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          {/* Breadcrumb */}
          <nav className="flex items-center gap-1.5 text-sm text-neutral-900/40 mb-8">
            <Link to="/" className="hover:text-neutral-900 transition-colors">Home</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <Link to="/browse?tab=clinics" className="hover:text-neutral-900 transition-colors">Clinics</Link>
            <ChevronRight className="w-3.5 h-3.5" />
            <span className="text-neutral-900/70 font-medium truncate">{clinic.name}</span>
          </nav>

          {/* Clinic Hero Card */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5 }}
            className="bg-white rounded-2xl border border-neutral-300/60 p-6 sm:p-8 mb-12"
          >
            <div className="flex flex-col sm:flex-row items-start gap-6">
              {/* Logo */}
              {clinic.logo && !logoError ? (
                <img
                  src={resolveAssetUrl(clinic.logo)}
                  alt={clinic.name}
                  className="w-20 h-20 rounded-2xl object-cover border border-neutral-200/60 shrink-0"
                  onError={() => setLogoError(true)}
                />
              ) : (
                <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center shrink-0">
                  <Building2 className="w-9 h-9 text-primary-600" />
                </div>
              )}

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3 mb-3 flex-wrap">
                  <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 font-display">
                    {clinic.name}
                  </h1>
                  {clinic.clinicCode && (
                    <span className="inline-flex items-center gap-1 px-3 py-1 bg-primary-50 text-primary-700 text-xs font-semibold rounded-lg border border-primary-200/40 shrink-0">
                      <Hash className="w-3 h-3" />
                      {clinic.clinicCode}
                    </span>
                  )}
                </div>

                {/* Address */}
                {addressParts.length > 0 && (
                  <div className="flex items-start gap-2 text-sm text-neutral-900/50 mb-3">
                    <MapPin className="w-4 h-4 shrink-0 mt-0.5" />
                    <span>{addressParts.join(', ')}{address.zipCode ? ` - ${address.zipCode}` : ''}</span>
                  </div>
                )}

                {/* Contact */}
                <div className="flex flex-wrap items-center gap-4">
                  {clinic.phone && (
                    <a href={`tel:${clinic.phone}`} className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900 transition-colors">
                      <Phone className="w-3.5 h-3.5" />
                      {clinic.phone}
                    </a>
                  )}
                  {clinic.email && (
                    <a href={`mailto:${clinic.email}`} className="flex items-center gap-1.5 text-sm text-neutral-900/40 hover:text-neutral-900 transition-colors">
                      <Mail className="w-3.5 h-3.5" />
                      {clinic.email}
                    </a>
                  )}
                </div>
              </div>

              {/* Stats */}
              <div className="flex sm:flex-col items-center gap-4 sm:gap-2 shrink-0">
                <div className="text-center px-4 py-3 bg-primary-50/60 rounded-xl">
                  <p className="text-2xl font-bold text-primary-700">{doctors.length}</p>
                  <p className="text-[11px] text-primary-600 font-medium">Doctors</p>
                </div>
              </div>
            </div>
          </motion.div>

          {/* Branches / Locations Section */}
          {branches.length > 0 && (
            <>
              <SectionHeading
                label="Locations"
                title={branches.length === 1 ? 'Our Location' : `Our Locations (${branches.length})`}
                description="Visit us at any of our branches"
              />
              <div className="grid sm:grid-cols-2 gap-5 mt-8 mb-12">
                {branches.map((branch) => {
                  const ba = branch.address || {};
                  const baParts = [ba.street, ba.city, ba.state].filter(Boolean);
                  const days = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
                  const today = days[new Date().getDay()];
                  const todayHours = (branch.operatingHours || []).find((h) => h.day === today);
                  const isOpen = todayHours && !todayHours.isClosed;
                  const now = new Date();
                  const currentMin = now.getHours() * 60 + now.getMinutes();
                  let statusLabel = 'Closed today';
                  if (isOpen) {
                    const [ch, cm] = todayHours.closeTime.split(':').map(Number);
                    const closeMin = ch * 60 + cm;
                    const [oh, om] = todayHours.openTime.split(':').map(Number);
                    const openMin = oh * 60 + om;
                    if (currentMin >= openMin && currentMin < closeMin) {
                      statusLabel = `Open · Closes ${todayHours.closeTime}`;
                    } else if (currentMin < openMin) {
                      statusLabel = `Opens at ${todayHours.openTime}`;
                    } else {
                      statusLabel = 'Closed for today';
                    }
                  }
                  const currentlyOpen = isOpen && (() => {
                    const [oh, om] = todayHours.openTime.split(':').map(Number);
                    const [ch, cm] = todayHours.closeTime.split(':').map(Number);
                    return currentMin >= (oh * 60 + om) && currentMin < (ch * 60 + cm);
                  })();

                  return (
                    <motion.div
                      key={branch._id}
                      initial={{ opacity: 0, y: 20 }}
                      whileInView={{ opacity: 1, y: 0 }}
                      viewport={{ once: true }}
                      transition={{ duration: 0.4 }}
                      className="bg-white rounded-2xl border border-neutral-300/60 p-5"
                    >
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <h4 className="text-sm font-bold text-neutral-900">{branch.name}</h4>
                        <span className="text-[10px] font-semibold text-primary-700 bg-primary-50 px-2 py-0.5 rounded-md shrink-0">
                          {branch.code}
                        </span>
                      </div>

                      {baParts.length > 0 && (
                        <div className="flex items-start gap-1.5 text-xs text-neutral-900/50 mb-2">
                          <MapPin className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                          <span>{baParts.join(', ')}{ba.zipCode ? ` - ${ba.zipCode}` : ''}</span>
                        </div>
                      )}

                      {branch.phone && (
                        <a href={`tel:${branch.phone}`} className="flex items-center gap-1.5 text-xs text-neutral-900/40 hover:text-neutral-900 transition-colors mb-2">
                          <Phone className="w-3.5 h-3.5" />
                          {branch.phone}
                        </a>
                      )}

                      <div className="flex items-center justify-between mt-3 pt-3 border-t border-neutral-200/40">
                        <div className="flex items-center gap-1.5">
                          <Clock className="w-3.5 h-3.5" />
                          <span className={`text-xs font-medium ${currentlyOpen ? 'text-emerald-600' : 'text-neutral-900/40'}`}>
                            {statusLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-1 text-xs text-neutral-900/40">
                          <Users className="w-3.5 h-3.5" />
                          <span>{branch.doctorCount} doctor{branch.doctorCount !== 1 ? 's' : ''}</span>
                        </div>
                      </div>
                    </motion.div>
                  );
                })}
              </div>
            </>
          )}

          {/* Doctors Section */}
          <SectionHeading
            label="Our Doctors"
            title={`Doctors at ${clinic.name}`}
            description="View profiles and book appointments with any of our specialists"
          />

          {doctors.length === 0 ? (
            <div className="text-center py-16">
              <p className="text-sm text-neutral-900/40">No doctors listed yet at this clinic.</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5 mt-8">
              {doctors.map((doc, i) => (
                <DoctorCard
                  key={doc._id || i}
                  doctor={{ ...doc, clinicSlug: slug, clinicName: clinic.name, clinicCity: address.city }}
                  index={i}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
