import { useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Building2, MapPin, ArrowRight, Hash } from 'lucide-react';
import { resolveAssetUrl } from '../../lib/assetUrl';

export default function ClinicCard({ clinic, index = 0 }) {
  const name = clinic.name || 'Clinic';
  const logo = resolveAssetUrl(clinic.logo) || null;
  const [logoError, setLogoError] = useState(false);
  const code = clinic.clinicCode || '';
  const address = clinic.address || {};
  const locationParts = [address.locality, address.city].filter(Boolean);
  const distance = clinic.distanceKm || null;
  const slug = clinic.slug;

  return (
    <Link to={`/clinics/${slug}`} className="group block">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4, delay: index * 0.06 }}
        whileHover={{ y: -4 }}
        className="bg-white rounded-2xl border border-neutral-200 p-5 hover:shadow-lg hover:shadow-primary-100/50 hover:border-primary-200 transition-all duration-300 h-full flex flex-col"
      >
        {/* Logo + Name */}
        <div className="flex items-center gap-3 mb-3">
          {logo && !logoError ? (
            <img
              src={logo}
              alt={name}
              className="w-12 h-12 rounded-xl object-cover shrink-0 border border-neutral-200/60"
              onError={() => setLogoError(true)}
            />
          ) : (
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-primary-50 to-primary-100 flex items-center justify-center shrink-0">
              <Building2 className="w-6 h-6 text-primary-600" />
            </div>
          )}
          <div className="min-w-0">
            <h4 className="text-sm font-bold text-neutral-900 truncate">{name}</h4>
            {code && (
              <div className="flex items-center gap-1 mt-0.5">
                <Hash className="w-3 h-3 text-neutral-900/30" />
                <span className="text-[11px] font-medium text-neutral-900/40 tracking-wide">{code}</span>
              </div>
            )}
          </div>
        </div>

        {/* Address */}
        {locationParts.length > 0 && (
          <div className="flex items-center gap-1.5 text-[11px] text-neutral-900/40 mb-3">
            <MapPin className="w-3 h-3 shrink-0" />
            <span className="truncate">
              {locationParts.join(', ')}
              {distance != null && ` (${distance.toFixed(1)} km)`}
            </span>
          </div>
        )}

        {/* Full address line */}
        {address.street && (
          <p className="text-[11px] text-neutral-900/30 truncate mt-auto">
            {address.street}
          </p>
        )}

        {/* CTA */}
        <div className="flex items-center gap-1 mt-3 pt-3 border-t border-neutral-200/40 text-xs font-semibold text-primary-600 group-hover:gap-2 transition-all">
          View Clinic <ArrowRight className="w-3 h-3" />
        </div>
      </motion.div>
    </Link>
  );
}
