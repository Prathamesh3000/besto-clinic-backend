/**
 * DoctorSearchInline - Search and display doctors within chatbot
 * Shows results inline without leaving the modal
 */

import React, { useState } from 'react';
import { Search, MapPin, Loader2, Stethoscope, Star, Clock, ChevronRight } from 'lucide-react';
import { fetchFeaturedDoctors } from '../../../api/publicApi';
import '../../../styles/chatbotDesignSystem.css';

const SPECIALTIES = [
  'General Dentistry',
  'Orthodontics',
  'Endodontics',
  'Periodontics',
  'Oral Surgery',
  'Pediatric Dentistry',
  'Prosthodontics',
  'Cosmetic Dentistry',
];

export default function DoctorSearchInline({ onClose }) {
  const [searchQuery, setSearchQuery] = useState('');
  const [location, setLocation] = useState('');
  const [searching, setSearching] = useState(false);
  const [doctors, setDoctors] = useState([]);
  const [hasSearched, setHasSearched] = useState(false);

  const handleSearch = async (specialty = null) => {
    setSearching(true);
    setHasSearched(true);

    try {
      const params = {};
      if (specialty) params.specialization = specialty;
      else if (searchQuery) params.search = searchQuery;
      if (location) params.location = location;

      const res = await fetchFeaturedDoctors(params);
      const raw = res.data || res;

      // Flatten clinic-grouped results
      let flatDoctors = [];
      if (Array.isArray(raw)) {
        raw.forEach((item) => {
          if (item.doctors) {
            item.doctors.forEach((doc) =>
              flatDoctors.push({
                ...doc,
                clinicName: item.clinicName,
                clinicCity: item.clinicCity,
                clinicSlug: item.clinicSlug,
              }),
            );
          } else {
            flatDoctors.push(item);
          }
        });
      }

      setDoctors(flatDoctors);
    } catch (error) {
      console.error('Doctor search error:', error);
      setDoctors([]);
    } finally {
      setSearching(false);
    }
  };

  const handleSpecialtyClick = (specialty) => {
    handleSearch(specialty);
  };

  const handleDoctorClick = (doctor) => {
    // Public clinic profile is /clinics/:slug (plural). Singular /clinic is the
    // staff portal, so /clinic/<slug> matched no route and — because this opens
    // a new tab, i.e. a real page load — the server answered a bare "Not Found".
    // Prefer the doctor profile route when we have an id.
    const url = doctor.clinicSlug && doctor._id
      ? `/clinics/${doctor.clinicSlug}/doctors/${doctor._id}`
      : doctor.clinicSlug
        ? `/clinics/${doctor.clinicSlug}`
        : `/browse?tab=doctors&q=${encodeURIComponent(doctor.name)}`;
    window.open(url, '_blank');
  };

  return (
    <div style={{ padding: '24px', maxHeight: '600px', overflowY: 'auto' }}>
      {/* Header */}
      {!hasSearched && (
        <>
          <div style={{ marginBottom: '24px' }}>
            <div
              style={{
                width: '56px',
                height: '56px',
                background: 'var(--chatbot-bg-primary)',
                border: '1px solid var(--chatbot-border)',
                borderRadius: 'var(--chatbot-radius-lg)',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '16px',
              }}
            >
              <Stethoscope size={28} strokeWidth={2} style={{ color: 'var(--chatbot-text-secondary)' }} />
            </div>

            <h2
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-2xl)',
                fontWeight: 'var(--chatbot-weight-bold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '8px',
              }}
            >
              Find Doctors
            </h2>

            <p
              style={{
                fontFamily: 'var(--chatbot-font-body)',
                fontSize: 'var(--chatbot-text-base)',
                color: 'var(--chatbot-text-secondary)',
              }}
            >
              Search for dentists by name or browse by specialty
            </p>
          </div>

          {/* Search Inputs */}
          <div style={{ marginBottom: '24px' }}>
            {/* Search query */}
            <div style={{ marginBottom: '12px' }}>
              <div style={{ position: 'relative' }}>
                <Search
                  size={18}
                  strokeWidth={2}
                  style={{
                    position: 'absolute',
                    left: '12px',
                    top: '50%',
                    transform: 'translateY(-50%)',
                    color: 'var(--chatbot-text-tertiary)',
                  }}
                />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search by doctor name..."
                  onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                  style={{
                    width: '100%',
                    padding: '12px 12px 12px 40px',
                    fontFamily: 'var(--chatbot-font-body)',
                    fontSize: 'var(--chatbot-text-sm)',
                    color: 'var(--chatbot-text-primary)',
                    background: 'var(--chatbot-bg-card)',
                    border: '1px solid var(--chatbot-border)',
                    borderRadius: 'var(--chatbot-radius-md)',
                    outline: 'none',
                  }}
                  onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)')}
                  onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--chatbot-border)')}
                />
              </div>
            </div>

            {/* Search Button */}
            <button
              className="chatbot-btn-primary"
              onClick={() => handleSearch()}
              disabled={!searchQuery.trim() && !location.trim()}
              style={{ width: '100%', marginBottom: '16px' }}
            >
              {searching ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} strokeWidth={2} />}
              <span style={{ marginLeft: '8px' }}>Search</span>
            </button>
          </div>

          {/* Divider */}
          <div
            style={{
              height: '1px',
              background: 'var(--chatbot-border)',
              margin: '24px 0',
            }}
          />

          {/* Browse by Specialty */}
          <div>
            <h3
              style={{
                fontFamily: 'var(--chatbot-font-heading)',
                fontSize: 'var(--chatbot-text-lg)',
                fontWeight: 'var(--chatbot-weight-semibold)',
                color: 'var(--chatbot-text-primary)',
                marginBottom: '12px',
              }}
            >
              Or Browse by Specialty
            </h3>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
              {SPECIALTIES.map((specialty) => (
                <button
                  key={specialty}
                  onClick={() => handleSpecialtyClick(specialty)}
                  disabled={searching}
                  style={{
                    padding: '10px 12px',
                    fontFamily: 'var(--chatbot-font-body)',
                    fontSize: 'var(--chatbot-text-sm)',
                    fontWeight: 'var(--chatbot-weight-medium)',
                    color: 'var(--chatbot-text-secondary)',
                    background: 'var(--chatbot-bg-card)',
                    border: '1px solid var(--chatbot-border)',
                    borderRadius: 'var(--chatbot-radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                    textAlign: 'left',
                  }}
                  onMouseEnter={(e) => {
                    if (!searching) {
                      e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)';
                      e.currentTarget.style.background = 'rgba(76, 166, 38, 0.05)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.borderColor = 'var(--chatbot-border)';
                    e.currentTarget.style.background = 'var(--chatbot-bg-card)';
                  }}
                >
                  {specialty}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Loading State */}
      {searching && (
        <div style={{ padding: '40px 0', textAlign: 'center' }}>
          <Loader2 size={32} strokeWidth={2} style={{ color: 'var(--chatbot-brand-green)' }} className="animate-spin" />
          <p
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
              marginTop: '12px',
            }}
          >
            Searching for doctors...
          </p>
        </div>
      )}

      {/* Results */}
      {hasSearched && !searching && (
        <div>
          {/* Back button */}
          <button
            onClick={() => {
              setHasSearched(false);
              setDoctors([]);
              setSearchQuery('');
            }}
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-brand-green)',
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              marginBottom: '16px',
              padding: '4px 0',
            }}
          >
            ← Back to search
          </button>

          {doctors.length > 0 ? (
            <>
              <h3
                style={{
                  fontFamily: 'var(--chatbot-font-heading)',
                  fontSize: 'var(--chatbot-text-xl)',
                  fontWeight: 'var(--chatbot-weight-semibold)',
                  color: 'var(--chatbot-text-primary)',
                  marginBottom: '16px',
                }}
              >
                Found {doctors.length} {doctors.length === 1 ? 'doctor' : 'doctors'}
              </h3>

              {/* Doctor Cards */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {doctors.map((doctor) => (
                  <div
                    key={doctor._id}
                    onClick={() => handleDoctorClick(doctor)}
                    style={{
                      background: 'var(--chatbot-bg-card)',
                      border: '1px solid var(--chatbot-border)',
                      borderRadius: 'var(--chatbot-radius-lg)',
                      padding: '16px',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)';
                      e.currentTarget.style.boxShadow = 'var(--chatbot-shadow-md)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--chatbot-border)';
                      e.currentTarget.style.boxShadow = 'none';
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'start', gap: '12px' }}>
                      {/* Avatar */}
                      <div
                        style={{
                          width: '48px',
                          height: '48px',
                          borderRadius: '50%',
                          background: 'var(--chatbot-bg-primary)',
                          border: '1px solid var(--chatbot-border)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          flexShrink: 0,
                        }}
                      >
                        {doctor.profilePhoto ? (
                          <img
                            src={doctor.profilePhoto}
                            alt={doctor.name}
                            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
                          />
                        ) : (
                          <Stethoscope size={20} strokeWidth={2} style={{ color: 'var(--chatbot-text-tertiary)' }} />
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <h4
                          style={{
                            fontFamily: 'var(--chatbot-font-heading)',
                            fontSize: 'var(--chatbot-text-base)',
                            fontWeight: 'var(--chatbot-weight-semibold)',
                            color: 'var(--chatbot-text-primary)',
                            marginBottom: '4px',
                          }}
                        >
                          {doctor.name}
                        </h4>

                        {doctor.specialization && (
                          <p
                            style={{
                              fontFamily: 'var(--chatbot-font-body)',
                              fontSize: 'var(--chatbot-text-sm)',
                              color: 'var(--chatbot-text-secondary)',
                              marginBottom: '6px',
                            }}
                          >
                            {doctor.specialization}
                          </p>
                        )}

                        {/* Clinic info */}
                        {doctor.clinicName && (
                          <p
                            style={{
                              fontFamily: 'var(--chatbot-font-body)',
                              fontSize: 'var(--chatbot-text-xs)',
                              color: 'var(--chatbot-text-tertiary)',
                              marginBottom: '6px',
                            }}
                          >
                            {doctor.clinicName}
                            {doctor.clinicCity && ` • ${doctor.clinicCity}`}
                          </p>
                        )}

                        {/* Rating */}
                        {doctor.rating && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Star
                              size={14}
                              fill="var(--chatbot-warning)"
                              stroke="var(--chatbot-warning)"
                              strokeWidth={2}
                            />
                            <span
                              style={{
                                fontFamily: 'var(--chatbot-font-body)',
                                fontSize: 'var(--chatbot-text-sm)',
                                fontWeight: 'var(--chatbot-weight-semibold)',
                                color: 'var(--chatbot-text-primary)',
                              }}
                            >
                              {doctor.rating}
                            </span>
                            {doctor.reviewCount && (
                              <span
                                style={{
                                  fontFamily: 'var(--chatbot-font-body)',
                                  fontSize: 'var(--chatbot-text-xs)',
                                  color: 'var(--chatbot-text-tertiary)',
                                }}
                              >
                                ({doctor.reviewCount})
                              </span>
                            )}
                          </div>
                        )}
                      </div>

                      {/* Arrow */}
                      <ChevronRight size={20} strokeWidth={2} style={{ color: 'var(--chatbot-text-tertiary)' }} />
                    </div>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ padding: '40px 0', textAlign: 'center' }}>
              <p
                style={{
                  fontFamily: 'var(--chatbot-font-body)',
                  fontSize: 'var(--chatbot-text-base)',
                  color: 'var(--chatbot-text-secondary)',
                }}
              >
                No doctors found. Try a different search or specialty.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
