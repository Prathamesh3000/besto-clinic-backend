/**
 * DoctorRecommendations Screen
 * Vertical list of recommended doctors based on scan findings
 * Professional cards with rating, specialty, distance
 */

import React from 'react';
import { Star, MapPin, Lock } from 'lucide-react';
import '../../../styles/chatbotDesignSystem.css';

// Mock doctor data - replace with real API
const MOCK_DOCTORS = [
  {
    id: 1,
    name: 'Dr. Sarah Johnson',
    specialty: 'General Dentistry',
    rating: 4.9,
    reviewCount: 245,
    distance: 2.3,
    photo: null,
    available: true,
  },
  {
    id: 2,
    name: 'Dr. Michael Chen',
    specialty: 'Endodontist',
    rating: 4.8,
    reviewCount: 189,
    distance: 3.7,
    photo: null,
    available: true,
  },
  {
    id: 3,
    name: 'Dr. Emily Rodriguez',
    specialty: 'Periodontist',
    rating: 4.9,
    reviewCount: 312,
    distance: 4.2,
    photo: null,
    available: false,
  },
];

function DoctorCard({ doctor }) {
  const handleViewProfile = () => {
    // Analytics
    if (window.gtag) {
      window.gtag('event', 'doctor_clicked', {
        event_category: 'Chatbot',
        event_label: doctor.id,
      });
    }

    // TODO: Navigate to doctor profile
    alert(`View profile for ${doctor.name} - Coming soon!`);
  };

  return (
    <div
      style={{
        background: 'var(--chatbot-bg-card)',
        border: '1px solid var(--chatbot-border)',
        borderRadius: 'var(--chatbot-radius-lg)',
        padding: '16px',
        transition: 'all 0.2s ease',
        cursor: 'pointer',
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
      <div style={{ display: 'flex', gap: '16px' }}>
        {/* Photo */}
        <div
          style={{
            width: '64px',
            height: '64px',
            borderRadius: '50%',
            background: 'var(--chatbot-bg-primary)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            overflow: 'hidden',
          }}
        >
          {doctor.photo ? (
            <img src={doctor.photo} alt={doctor.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
          ) : (
            // Default avatar icon
            <svg
              width="32"
              height="32"
              viewBox="0 0 24 24"
              fill="none"
              stroke="var(--chatbot-text-tertiary)"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
          )}
        </div>

        {/* Info */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Name */}
          <h3
            style={{
              fontFamily: 'var(--chatbot-font-heading)',
              fontSize: 'var(--chatbot-text-lg)',
              fontWeight: 'var(--chatbot-weight-semibold)',
              color: 'var(--chatbot-text-primary)',
              marginBottom: '4px',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {doctor.name}
          </h3>

          {/* Specialty */}
          <p
            style={{
              fontFamily: 'var(--chatbot-font-body)',
              fontSize: 'var(--chatbot-text-sm)',
              color: 'var(--chatbot-text-secondary)',
              marginBottom: '8px',
            }}
          >
            {doctor.specialty}
          </p>

          {/* Rating & Distance */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* Rating */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <Star size={14} fill="var(--chatbot-warning)" stroke="var(--chatbot-warning)" strokeWidth={2} />
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
              <span
                style={{
                  fontFamily: 'var(--chatbot-font-body)',
                  fontSize: 'var(--chatbot-text-xs)',
                  color: 'var(--chatbot-text-tertiary)',
                }}
              >
                ({doctor.reviewCount})
              </span>
            </div>

            {/* Distance */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <MapPin size={14} strokeWidth={2} style={{ color: 'var(--chatbot-text-secondary)' }} />
              <span
                style={{
                  fontFamily: 'var(--chatbot-font-body)',
                  fontSize: 'var(--chatbot-text-sm)',
                  color: 'var(--chatbot-text-secondary)',
                }}
              >
                {doctor.distance} km away
              </span>
            </div>

            {/* Availability badge */}
            {doctor.available && (
              <span
                style={{
                  fontFamily: 'var(--chatbot-font-body)',
                  fontSize: 'var(--chatbot-text-xs)',
                  fontWeight: 'var(--chatbot-weight-medium)',
                  color: 'var(--chatbot-brand-green)',
                  background: 'rgba(76, 166, 38, 0.1)',
                  padding: '2px 8px',
                  borderRadius: 'var(--chatbot-radius-sm)',
                }}
              >
                Available
              </span>
            )}
          </div>
        </div>
      </div>

      {/* View Profile button */}
      <button
        className="chatbot-btn-primary"
        onClick={handleViewProfile}
        style={{ width: '100%', marginTop: '12px' }}
      >
        View Profile →
      </button>
    </div>
  );
}

export default function DoctorRecommendations({ doctors = MOCK_DOCTORS, onClose }) {
  return (
    <div style={{ padding: '24px' }}>
      {/* Header */}
      <div style={{ marginBottom: '24px' }}>
        <h2
          style={{
            fontFamily: 'var(--chatbot-font-heading)',
            fontSize: 'var(--chatbot-text-2xl)',
            fontWeight: 'var(--chatbot-weight-bold)',
            color: 'var(--chatbot-text-primary)',
            marginBottom: '8px',
          }}
        >
          Recommended Dentists
        </h2>

        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-base)',
            color: 'var(--chatbot-text-secondary)',
          }}
        >
          Based on your scan results, these dentists can help address your dental needs
        </p>
      </div>

      {/* Doctor list */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', marginBottom: '24px' }}>
        {doctors.map((doctor) => (
          <DoctorCard key={doctor.id} doctor={doctor} />
        ))}
      </div>

      {/* CTA */}
      <div
        style={{
          background: 'var(--chatbot-bg-card)',
          border: '1px solid var(--chatbot-border)',
          borderRadius: 'var(--chatbot-radius-lg)',
          padding: '16px',
          textAlign: 'center',
        }}
      >
        <p
          style={{
            fontFamily: 'var(--chatbot-font-body)',
            fontSize: 'var(--chatbot-text-sm)',
            color: 'var(--chatbot-text-secondary)',
            marginBottom: '12px',
          }}
        >
          Can't find what you're looking for?
        </p>

        <button className="chatbot-btn-secondary" style={{ width: '100%' }}>
          Search All Dentists
        </button>
      </div>

      {/* Footer note */}
      <p
        style={{
          fontFamily: 'var(--chatbot-font-body)',
          fontSize: 'var(--chatbot-text-xs)',
          color: 'var(--chatbot-text-tertiary)',
          textAlign: 'center',
          marginTop: '16px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          gap: '6px',
        }}
      >
        <Lock size={14} strokeWidth={2} />
        Your scan results are private and secure
      </p>
    </div>
  );
}
