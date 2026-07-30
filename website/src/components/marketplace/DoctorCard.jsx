import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Star, MapPin, ArrowRight, IndianRupee } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';

export default function DoctorCard({ doctor, index = 0 }) {
  // Falls back to the MapPin icon when the clinic has no logo, or when the
  // stored logo path 404s (uploads are on local disk, so files can go missing).
  const clinicLogo = resolveAssetUrl(doctor.clinicLogo) || '';
  const [logoError, setLogoError] = useState(false);
  const name = doctor.name || 'Doctor';
  const specs = doctor.specializations || [];
  const rating = doctor.averageRating || null;
  const branch = doctor.branchName || '';
  const clinic = doctor.clinicName || '';
  const city = doctor.clinicCity || doctor.city || '';
  const fee = doctor.consultationFee || null;
  const experience = doctor.experienceYears || doctor.experience || null;
  const distance = doctor.distanceKm || null;
  const initials = name.split(' ').map((n) => n[0]).join('').slice(0, 2);
  const profileUrl = doctor.clinicSlug && doctor._id
    ? `/clinics/${doctor.clinicSlug}/doctors/${doctor._id}`
    : null;

  const card = (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ duration: 0.4, delay: index * 0.06 }}
      whileHover={{ y: -4 }}
      className="bg-white rounded-2xl border border-neutral-200 p-5 hover:shadow-lg hover:shadow-primary-100/50 hover:border-primary-200 transition-all duration-300 h-full flex flex-col"
    >
      {/* Avatar + Name */}
      <div className="flex items-center gap-3 mb-3">
        <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-100 to-primary-200 flex items-center justify-center text-sm font-bold text-primary-700 shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-neutral-900 truncate">{name}</h4>
          {specs.length > 0 && (
            <p className="text-xs text-primary-600 font-medium truncate">{specs[0]}</p>
          )}
        </div>
      </div>

      {/* Rating + Experience */}
      <div className="flex items-center gap-2 mb-3 flex-wrap">
        {rating > 0 && (
          <div className="flex items-center gap-0.5 px-2 py-0.5 bg-amber-50 rounded-md">
            <Star className="w-3 h-3 text-amber-500 fill-amber-500" />
            <span className="text-xs font-semibold text-amber-700">{Number(rating).toFixed(1)}</span>
          </div>
        )}
        {experience && (
          <span className="text-[11px] text-neutral-900/40">{experience} yrs exp.</span>
        )}
        {fee && (
          <span className="flex items-center gap-0.5 text-[11px] text-neutral-900/40">
            <IndianRupee className="w-2.5 h-2.5" />{fee}
          </span>
        )}
      </div>

      {/* Clinic & Location */}
      {(clinic || city) && (
        <div className="flex items-center gap-1.5 text-[11px] text-neutral-900/40 mt-auto">
          {clinicLogo && !logoError ? (
            <img
              src={clinicLogo}
              alt={clinic}
              className="w-4 h-4 rounded object-contain shrink-0"
              onError={() => setLogoError(true)}
            />
          ) : (
            <MapPin className="w-3 h-3 shrink-0" />
          )}
          <span className="truncate">
            {[branch || clinic, city].filter(Boolean).join(', ')}
            {distance != null && ` (${distance.toFixed(1)} km)`}
          </span>
        </div>
      )}

      {/* View Profile CTA */}
      {profileUrl && (
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-neutral-200/40 text-xs font-semibold text-primary-600 group-hover:gap-2 transition-all">
          View Profile <ArrowRight className="w-3 h-3" />
        </div>
      )}
    </motion.div>
  );

  if (profileUrl) {
    return (
      <Link to={profileUrl} className="group block">
        {card}
      </Link>
    );
  }
  return card;
}
