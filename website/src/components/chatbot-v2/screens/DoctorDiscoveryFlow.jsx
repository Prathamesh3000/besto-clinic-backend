/**
 * DoctorDiscoveryFlow - Message-based doctor discovery interface
 * Renders location card, city picker, specializations, and doctor results
 */

import React, { useEffect } from 'react';
import { MapPin, Loader2, Stethoscope, Star, ChevronRight, Building2 } from 'lucide-react';
import useDoctorDiscovery, { CITY_COORDS, DENTAL_SPECIALIZATIONS } from '../hooks/useDoctorDiscovery';
import '../../../styles/chatbotDesignSystem.css';

// Location Permission Card
function LocationCard({ onChoice, consumed }) {
  if (consumed) return null;

  return (
    <div
      style={{
        background: 'var(--chatbot-bg-card)',
        border: '1px solid var(--chatbot-border)',
        borderRadius: 'var(--chatbot-radius-lg)',
        padding: '20px',
        marginBottom: '12px',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'start', gap: '12px', marginBottom: '16px' }}>
        <div
          style={{
            width: '40px',
            height: '40px',
            borderRadius: '50%',
            background: 'var(--chatbot-bg-primary)',
            border: '1px solid var(--chatbot-border)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
          }}
        >
          <MapPin size={20} strokeWidth={2} style={{ color: 'var(--chatbot-brand-green)' }} />
        </div>
        <div style={{ flex: 1 }}>
          <h4
            style={{
              fontFamily: 'var(--chatbot-font-heading)',
              fontSize: 'var(--chatbot-text-base)',
              fontWeight: 'var(--chatbot-weight-semibold)',
              color: 'var(--chatbot-text-primary)',
              marginBottom: '6px',
            }}
          >
            Find Dentists Near You
          </h4>
          <p
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
              lineHeight: 'var(--chatbot-leading-relaxed)',
            }}
          >
            Allow location access to find the best dentists nearby, or select your city manually.
          </p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
        <button
          className="chatbot-btn-primary"
          onClick={() => onChoice('allow')}
          style={{
            flex: '1 1 auto',
            minWidth: '140px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: '6px',
            whiteSpace: 'nowrap',
          }}
        >
          <MapPin size={16} strokeWidth={2} />
          <span>Use My Location</span>
        </button>
        <button
          className="chatbot-btn-secondary"
          onClick={() => onChoice('deny')}
          style={{
            flex: '1 1 auto',
            minWidth: '120px',
            whiteSpace: 'nowrap',
          }}
        >
          Select City
        </button>
      </div>
    </div>
  );
}

// City Picker Card
function CityPickerCard({ onSelect, consumed }) {
  if (consumed) return null;

  return (
    <div
      style={{
        background: 'var(--chatbot-bg-card)',
        border: '1px solid var(--chatbot-border)',
        borderRadius: 'var(--chatbot-radius-lg)',
        padding: '20px',
        marginBottom: '12px',
      }}
    >
      <h4
        style={{
          fontFamily: 'var(--chatbot-font-heading)',
          fontSize: 'var(--chatbot-text-base)',
          fontWeight: 'var(--chatbot-weight-semibold)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '12px',
        }}
      >
        Select Your City
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {Object.keys(CITY_COORDS).map((city) => (
          <button
            key={city}
            onClick={() => onSelect(city)}
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
              e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)';
              e.currentTarget.style.background = 'rgba(13, 148, 136, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--chatbot-border)';
              e.currentTarget.style.background = 'var(--chatbot-bg-card)';
            }}
          >
            {city}
          </button>
        ))}
      </div>
    </div>
  );
}

// Specialization Selection Card
function SpecializationsCard({ onSelect, consumed }) {
  if (consumed) return null;

  return (
    <div
      style={{
        background: 'var(--chatbot-bg-card)',
        border: '1px solid var(--chatbot-border)',
        borderRadius: 'var(--chatbot-radius-lg)',
        padding: '20px',
        marginBottom: '12px',
      }}
    >
      <h4
        style={{
          fontFamily: 'var(--chatbot-font-heading)',
          fontSize: 'var(--chatbot-text-base)',
          fontWeight: 'var(--chatbot-weight-semibold)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '12px',
        }}
      >
        Choose Specialty
      </h4>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
        {DENTAL_SPECIALIZATIONS.map((spec) => (
          <button
            key={spec}
            onClick={() => onSelect(spec)}
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
              e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)';
              e.currentTarget.style.background = 'rgba(13, 148, 136, 0.05)';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.borderColor = 'var(--chatbot-border)';
              e.currentTarget.style.background = 'var(--chatbot-bg-card)';
            }}
          >
            {spec}
          </button>
        ))}
      </div>
    </div>
  );
}

// Loading indicator
function LoadingMessage({ text }) {
  return (
    <div style={{ padding: '20px 0', textAlign: 'center' }}>
      <Loader2 size={24} strokeWidth={2} style={{ color: 'var(--chatbot-brand-green)' }} className="animate-spin" />
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-sm)',
          color: 'var(--chatbot-text-secondary)',
          marginTop: '8px',
        }}
      >
        {text}
      </p>
    </div>
  );
}

// Clinic Doctors Card - Shows doctors grouped by clinic
function ClinicDoctorsCard({ clinics, onBookDoctor }) {
  if (!clinics || clinics.length === 0) {
    return (
      <div style={{ padding: '40px 20px', textAlign: 'center' }}>
        <Stethoscope size={32} strokeWidth={2} style={{ color: 'var(--chatbot-text-tertiary)', margin: '0 auto 12px' }} />
        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          No dentists found. Try a different specialty or city.
        </p>
      </div>
    );
  }

  return (
    <div style={{ marginBottom: '12px' }}>
      <h4
        style={{
          fontFamily: 'var(--chatbot-font-heading)',
          fontSize: 'var(--chatbot-text-lg)',
          fontWeight: 'var(--chatbot-weight-semibold)',
          color: 'var(--chatbot-text-primary)',
          marginBottom: '16px',
        }}
      >
        Found {clinics.reduce((sum, c) => sum + (c.doctors?.length || 0), 0)} dentists
      </h4>

      {clinics.map((clinic, clinicIdx) => (
        <div
          key={clinicIdx}
          style={{
            background: 'var(--chatbot-bg-card)',
            border: '1px solid var(--chatbot-border)',
            borderRadius: 'var(--chatbot-radius-lg)',
            padding: '16px',
            marginBottom: '12px',
          }}
        >
          {/* Clinic header */}
          <div style={{ display: 'flex', alignItems: 'start', gap: '8px', marginBottom: '12px' }}>
            <Building2 size={18} strokeWidth={2} style={{ color: 'var(--chatbot-brand-green)', marginTop: '2px' }} />
            <div style={{ flex: 1 }}>
              <h5
                style={{
                  fontFamily: 'var(--chatbot-font-heading)',
                  fontSize: 'var(--chatbot-text-base)',
                  fontWeight: 'var(--chatbot-weight-semibold)',
                  color: 'var(--chatbot-text-primary)',
                  marginBottom: '2px',
                }}
              >
                {clinic.clinicName}
              </h5>
              {clinic.clinicCity && (
                <p
                  style={{
                    fontFamily: 'var(--chatbot-font-body)',
                    fontSize: 'var(--chatbot-text-xs)',
                    color: 'var(--chatbot-text-tertiary)',
                  }}
                >
                  {clinic.clinicCity}
                  {clinic.distanceKm && ` • ${clinic.distanceKm.toFixed(1)} km away`}
                </p>
              )}
            </div>
          </div>

          {/* Doctors list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {clinic.doctors?.map((doctor, docIdx) => (
              <div
                key={docIdx}
                onClick={() => onBookDoctor(clinic, doctor)}
                style={{
                  background: 'var(--chatbot-bg-primary)',
                  border: '1px solid var(--chatbot-border)',
                  borderRadius: 'var(--chatbot-radius-md)',
                  padding: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease',
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.borderColor = 'var(--chatbot-brand-green)';
                  e.currentTarget.style.boxShadow = 'var(--chatbot-shadow-sm)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.borderColor = 'var(--chatbot-border)';
                  e.currentTarget.style.boxShadow = 'none';
                }}
              >
                <div style={{ display: 'flex', alignItems: 'start', gap: '10px' }}>
                  {/* Avatar */}
                  <div
                    style={{
                      width: '40px',
                      height: '40px',
                      borderRadius: '50%',
                      background: 'var(--chatbot-bg-card)',
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
                      <Stethoscope size={18} strokeWidth={2} style={{ color: 'var(--chatbot-text-tertiary)' }} />
                    )}
                  </div>

                  {/* Info */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h6
                      style={{
                        fontFamily: 'var(--chatbot-font-heading)',
                        fontSize: 'var(--chatbot-text-sm)',
                        fontWeight: 'var(--chatbot-weight-semibold)',
                        color: 'var(--chatbot-text-primary)',
                        marginBottom: '3px',
                      }}
                    >
                      {doctor.name}
                    </h6>

                    {doctor.specialization && (
                      <p
                        style={{
                          fontFamily: 'var(--chatbot-font-body)',
                          fontSize: 'var(--chatbot-text-xs)',
                          color: 'var(--chatbot-text-secondary)',
                          marginBottom: '4px',
                        }}
                      >
                        {doctor.specialization}
                      </p>
                    )}

                    {/* Rating */}
                    {doctor.rating && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                        <Star
                          size={12}
                          fill="var(--chatbot-warning)"
                          stroke="var(--chatbot-warning)"
                          strokeWidth={2}
                        />
                        <span
                          style={{
                            fontFamily: 'var(--chatbot-font-body)',
                            fontSize: 'var(--chatbot-text-xs)',
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
                  <ChevronRight size={18} strokeWidth={2} style={{ color: 'var(--chatbot-text-tertiary)' }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// Text message bubble
function TextMessage({ text, sender }) {
  const isBot = sender === 'bot';

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isBot ? 'flex-start' : 'flex-end',
        marginBottom: '12px',
      }}
    >
      <div
        style={{
          maxWidth: '80%',
          padding: '10px 14px',
          borderRadius: 'var(--chatbot-radius-md)',
          background: isBot ? 'var(--chatbot-bg-card)' : 'var(--chatbot-brand-green)',
          border: isBot ? '1px solid var(--chatbot-border)' : 'none',
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-sm)',
          color: isBot ? 'var(--chatbot-text-primary)' : '#fff',
          lineHeight: 'var(--chatbot-leading-relaxed)',
        }}
      >
        {text}
      </div>
    </div>
  );
}

// Main component
export default function DoctorDiscoveryFlow({ onClose }) {
  const {
    messages,
    startDiscovery,
    handleLocationPermission,
    handleCitySelect,
    selectSpecialization,
    bookDoctor,
  } = useDoctorDiscovery();

  // Start discovery flow on mount
  useEffect(() => {
    startDiscovery();
  }, []);

  return (
    <div style={{ padding: '24px', maxHeight: '600px', overflowY: 'auto' }}>
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
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
            marginBottom: '12px',
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
            marginBottom: '6px',
          }}
        >
          Find Dentists
        </h2>

        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          Let's find the perfect dentist for you
        </p>
      </div>

      {/* Messages */}
      <div>
        {messages.map((msg) => {
          switch (msg.type) {
            case 'bot_location_card':
              return (
                <LocationCard
                  key={msg.id}
                  onChoice={handleLocationPermission}
                  consumed={msg.consumed}
                />
              );

            case 'bot_city_picker':
              return (
                <CityPickerCard
                  key={msg.id}
                  onSelect={handleCitySelect}
                  consumed={msg.consumed}
                />
              );

            case 'bot_specializations':
              return (
                <SpecializationsCard
                  key={msg.id}
                  onSelect={selectSpecialization}
                  consumed={msg.consumed}
                />
              );

            case 'bot_doctors_loading':
              return <LoadingMessage key={msg.id} text={msg.text} />;

            case 'bot_clinic_doctors':
              return (
                <ClinicDoctorsCard
                  key={msg.id}
                  clinics={msg.clinics}
                  onBookDoctor={bookDoctor}
                />
              );

            case 'bot_location_checking':
            case 'bot_location_detected':
            case 'bot_location_failed':
            case 'bot_error':
              return (
                <TextMessage
                  key={msg.id}
                  text={msg.text}
                  sender={msg.sender}
                />
              );

            default:
              if (msg.text) {
                return (
                  <TextMessage
                    key={msg.id}
                    text={msg.text}
                    sender={msg.sender}
                  />
                );
              }
              return null;
          }
        })}
      </div>
    </div>
  );
}
