/**
 * useDoctorDiscovery - Message-based reducer for doctor discovery flow
 * Replicates architecture from old chatbot with location detection, city picker, specialty selection
 */

import { useReducer, useRef } from 'react';
import { fetchFeaturedDoctors } from '../../../api/publicApi';

// City coordinates for fallback selection
export const CITY_COORDS = {
  'Mumbai': { lat: 19.0760, lon: 72.8777 },
  'Pune': { lat: 18.5204, lon: 73.8567 },
  'Bangalore': { lat: 12.9716, lon: 77.5946 },
  'Delhi': { lat: 28.7041, lon: 77.1025 },
  'Hyderabad': { lat: 17.3850, lon: 78.4867 },
  'Chennai': { lat: 13.0827, lon: 80.2707 },
  'Kolkata': { lat: 22.5726, lon: 88.3639 },
  'Ahmedabad': { lat: 23.0225, lon: 72.5714 },
  'Jaipur': { lat: 26.9124, lon: 75.7873 },
  'Lucknow': { lat: 26.8467, lon: 80.9462 },
};

// Dental specializations
export const DENTAL_SPECIALIZATIONS = [
  'General Dentistry',
  'Periodontics',
  'Orthodontics',
  'Endodontics',
  'Oral Surgery',
  'Pediatric Dentistry',
  'Prosthodontics',
  'Cosmetic Dentistry',
];

// Initial state
const initialState = {
  messages: [],
  locationDetected: false,
  cityName: null,
  selectedSpecialty: null,
};

// Reducer
function doctorDiscoveryReducer(state, action) {
  switch (action.type) {
    case 'SHOW_LOCATION_CARD':
      return {
        ...state,
        messages: [
          ...state.messages,
          {
            id: Date.now(),
            sender: 'bot',
            type: 'bot_location_card',
            timestamp: new Date(),
          },
        ],
      };

    case 'LOCATION_CHECKING':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.type === 'bot_location_card' ? { ...msg, consumed: true } : msg
        ).concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_location_checking',
          text: 'Detecting your location...',
          timestamp: new Date(),
        }),
      };

    case 'LOCATION_DETECTED':
      return {
        ...state,
        locationDetected: true,
        cityName: action.cityName,
        messages: state.messages.filter((m) => m.type !== 'bot_location_checking').concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_location_detected',
          // Phrased as "nearest" — this is the closest metro we know about, not
          // a claim about the user's actual town.
          text: `Great! Showing dentists near ${action.cityName}. What type of dentist are you looking for?`,
          timestamp: new Date(),
        }, {
          id: Date.now() + 1,
          sender: 'bot',
          type: 'bot_specializations',
          timestamp: new Date(),
        }),
      };

    case 'LOCATION_FAILED':
      return {
        ...state,
        messages: state.messages.filter((m) => m.type !== 'bot_location_checking').concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_location_failed',
          text: 'Unable to detect location. No worries, you can select your city manually.',
          timestamp: new Date(),
        }),
      };

    case 'CHOOSE_CITY':
      return {
        ...state,
        messages: state.messages.map((msg) =>
          msg.type === 'bot_location_card' ? { ...msg, consumed: true } : msg
        ).concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_city_picker',
          text: 'Please select your city:',
          timestamp: new Date(),
        }),
      };

    case 'CITY_SELECTED':
      return {
        ...state,
        cityName: action.cityName,
        messages: state.messages.map((msg) =>
          msg.type === 'bot_city_picker' ? { ...msg, consumed: true } : msg
        ).concat({
          id: Date.now(),
          sender: 'user',
          text: action.cityName,
          timestamp: new Date(),
        }, {
          id: Date.now() + 1,
          sender: 'bot',
          type: 'bot_specializations',
          text: `Great! What type of dentist are you looking for in ${action.cityName}?`,
          timestamp: new Date(),
        }),
      };

    case 'SPEC_CLICKED':
      return {
        ...state,
        selectedSpecialty: action.spec,
        messages: state.messages.map((msg) =>
          msg.type === 'bot_specializations' ? { ...msg, consumed: true } : msg
        ).concat({
          id: Date.now(),
          sender: 'user',
          text: action.spec,
          timestamp: new Date(),
        }, {
          id: Date.now() + 1,
          sender: 'bot',
          type: 'bot_doctors_loading',
          text: `Searching for ${action.spec} specialists near ${action.cityName || 'you'}...`,
          timestamp: new Date(),
        }),
      };

    case 'DOCTORS_LOADED':
      return {
        ...state,
        messages: state.messages.filter((m) => m.type !== 'bot_doctors_loading').concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_clinic_doctors',
          clinics: action.clinics,
          specialty: action.spec,
          timestamp: new Date(),
        }),
      };

    case 'DOCTORS_LOAD_FAILED':
      return {
        ...state,
        messages: state.messages.filter((m) => m.type !== 'bot_doctors_loading').concat({
          id: Date.now(),
          sender: 'bot',
          type: 'bot_error',
          text: 'Sorry, unable to load doctors at the moment. Please try again.',
          timestamp: new Date(),
        }),
      };

    default:
      return state;
  }
}

// Get user location via browser geolocation API
async function getUserLocation() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) {
      reject(new Error('Geolocation not supported'));
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          lat: position.coords.latitude,
          lon: position.coords.longitude,
        });
      },
      (error) => {
        reject(error);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  });
}

/**
 * Beyond this, "nearest city" stops being a useful description of where the
 * user is. CITY_COORDS only holds 10 metros, so someone in a smaller town was
 * previously snapped to whichever metro happened to be closest — which is why
 * users well outside Pune were told "You're in Pune".
 */
const MAX_CITY_SNAP_KM = 100;

/** Great-circle distance in km. Euclidean maths on raw lat/lon degrees is wrong
 *  because a degree of longitude shrinks as you move away from the equator. */
function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2
    + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * Nearest known city to the given coordinates.
 * @returns {{ city: string|null, distanceKm: number }} city is null when the
 *          closest metro is too far away to describe the user's location.
 */
function findNearestCity(lat, lon) {
  let nearestCity = null;
  let minDistance = Infinity;

  Object.entries(CITY_COORDS).forEach(([city, coords]) => {
    const distance = haversineKm(lat, lon, coords.lat, coords.lon);
    if (distance < minDistance) {
      minDistance = distance;
      nearestCity = city;
    }
  });

  return {
    city: minDistance <= MAX_CITY_SNAP_KM ? nearestCity : null,
    distanceKm: minDistance,
  };
}

export default function useDoctorDiscovery() {
  const [state, dispatch] = useReducer(doctorDiscoveryReducer, initialState);
  const locationRef = useRef(null);
  const detectedCityRef = useRef(null);
  const initializedRef = useRef(false);

  // Initialize flow - show location card (only once)
  const startDiscovery = () => {
    if (initializedRef.current) return;
    initializedRef.current = true;
    dispatch({ type: 'SHOW_LOCATION_CARD' });
  };

  // Handle location permission response
  const handleLocationPermission = async (choice) => {
    if (choice === 'allow') {
      dispatch({ type: 'LOCATION_CHECKING' });

      try {
        const loc = await getUserLocation();
        locationRef.current = loc;

        const { city } = findNearestCity(loc.lat, loc.lon);
        if (!city) {
          // Too far from any city we know about — ask rather than guess wrong.
          dispatch({ type: 'LOCATION_FAILED' });
          setTimeout(() => dispatch({ type: 'CHOOSE_CITY' }), 1200);
          return;
        }
        detectedCityRef.current = city;

        dispatch({ type: 'LOCATION_DETECTED', cityName: city });
      } catch (error) {
        console.error('Location detection failed:', error);
        dispatch({ type: 'LOCATION_FAILED' });
        // Auto-show city picker after failure
        setTimeout(() => {
          dispatch({ type: 'CHOOSE_CITY' });
        }, 1500);
      }
    } else {
      // User denied location - show city picker
      dispatch({ type: 'CHOOSE_CITY' });
    }
  };

  // Handle manual city selection
  const handleCitySelect = (cityName) => {
    detectedCityRef.current = cityName;
    locationRef.current = CITY_COORDS[cityName];
    dispatch({ type: 'CITY_SELECTED', cityName });
  };

  // Handle specialty selection
  const selectSpecialization = async (spec) => {
    dispatch({ type: 'SPEC_CLICKED', spec, cityName: detectedCityRef.current });

    try {
      const params = { specialization: spec, limit: 20 };

      // Add location params if available
      if (locationRef.current) {
        params.lat = locationRef.current.lat;
        params.lon = locationRef.current.lon;
      }

      const res = await fetchFeaturedDoctors(params);
      const clinics = res.data || [];

      dispatch({ type: 'DOCTORS_LOADED', clinics, spec });
    } catch (error) {
      console.error('Doctor search failed:', error);
      dispatch({ type: 'DOCTORS_LOAD_FAILED' });
    }
  };

  // Handle doctor selection - navigate to doctor profile page
  const bookDoctor = (clinic, doctor) => {
    const url = clinic.clinicSlug
      ? `/clinic/${clinic.clinicSlug}/doctor/${doctor._id}`
      : `/browse?tab=doctors&q=${encodeURIComponent(doctor.name)}`;
    window.open(url, '_blank');
  };

  return {
    messages: state.messages,
    cityName: state.cityName,
    selectedSpecialty: state.selectedSpecialty,
    startDiscovery,
    handleLocationPermission,
    handleCitySelect,
    selectSpecialization,
    bookDoctor,
  };
}
