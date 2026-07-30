import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, MapPin, Crosshair, Loader2, X, Stethoscope, User, Building2, TrendingUp } from 'lucide-react';
import { getUserLocation } from '../../lib/geolocation';
import { reverseGeocode, geocodeSearch, fetchSearchSuggestions } from '../../api/publicApi';
import { SPECIALTIES, POPULAR_SEARCHES } from '../../constants/specialties';

const variantStyles = {
  hero: {
    wrapper: 'max-w-2xl mx-auto',
    container: 'flex flex-col sm:flex-row items-stretch gap-3 p-3 bg-white rounded-2xl shadow-lg shadow-neutral-900/[0.08] border border-neutral-300/60',
    input: 'flex-1 min-w-0 px-4 py-3.5 text-base',
    locationInput: 'sm:w-52 px-4 py-3.5 text-base',
    button: 'px-8 py-3.5 text-base font-semibold',
  },
  page: {
    wrapper: 'w-full',
    container: 'flex flex-col sm:flex-row items-stretch gap-3 p-3 bg-white rounded-2xl shadow-sm border border-neutral-300/60',
    input: 'flex-1 min-w-0 px-4 py-3 text-sm',
    locationInput: 'sm:w-48 px-4 py-3 text-sm',
    button: 'px-6 py-3 text-sm font-semibold',
  },
  navbar: {
    wrapper: 'w-full',
    container: 'flex items-stretch gap-2 p-1.5 bg-neutral-50 rounded-xl border border-neutral-300/60',
    input: 'flex-1 min-w-0 px-3 py-2 text-sm',
    locationInput: 'w-36 px-3 py-2 text-sm',
    button: 'px-4 py-2 text-sm font-semibold',
  },
};

export default function SearchBar({
  defaultQuery = '',
  defaultLocation = '',
  defaultLat = null,
  defaultLon = null,
  onSearch,
  variant = 'hero',
  autoFocus = false,
}) {
  const navigate = useNavigate();
  const styles = variantStyles[variant];

  // ── Core state ──────────────────────────────────
  const [query, setQuery] = useState(defaultQuery);
  const [location, setLocation] = useState(defaultLocation);
  const [lat, setLat] = useState(defaultLat);
  const [lon, setLon] = useState(defaultLon);

  // ── Location autocomplete state ─────────────────
  const [locationLoading, setLocationLoading] = useState(false);
  const [locationSuggestions, setLocationSuggestions] = useState([]);
  const [showLocationSuggestions, setShowLocationSuggestions] = useState(false);

  // ── Query autocomplete state ────────────────────
  const [querySuggestions, setQuerySuggestions] = useState({ specialties: [], doctors: [], clinics: [] });
  const [showQuerySuggestions, setShowQuerySuggestions] = useState(false);
  const [queryLoading, setQueryLoading] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);

  // ── Refs ────────────────────────────────────────
  const locationDebounceRef = useRef(null);
  const queryDebounceRef = useRef(null);
  const abortRef = useRef(null);
  const locationDropdownRef = useRef(null);
  const queryDropdownRef = useRef(null);
  const searchInputRef = useRef(null);

  // ── Flat suggestions for keyboard nav ───────────
  const flatSuggestions = useMemo(() => {
    const items = [];
    querySuggestions.specialties.forEach((s) => items.push({ ...s, category: 'specialty' }));
    querySuggestions.doctors.forEach((d) => items.push({ ...d, category: 'doctor' }));
    querySuggestions.clinics.forEach((c) => items.push({ ...c, category: 'clinic' }));
    return items;
  }, [querySuggestions]);

  // ── Sync defaults from URL params ───────────────
  useEffect(() => { setQuery(defaultQuery); }, [defaultQuery]);
  useEffect(() => { setLocation(defaultLocation); }, [defaultLocation]);
  useEffect(() => { setLat(defaultLat); }, [defaultLat]);
  useEffect(() => { setLon(defaultLon); }, [defaultLon]);

  useEffect(() => {
    if (autoFocus && searchInputRef.current) searchInputRef.current.focus();
  }, [autoFocus]);

  // ── Click-outside for both dropdowns ────────────
  useEffect(() => {
    function handleClick(e) {
      if (locationDropdownRef.current && !locationDropdownRef.current.contains(e.target)) {
        setShowLocationSuggestions(false);
      }
      if (queryDropdownRef.current && !queryDropdownRef.current.contains(e.target)) {
        setShowQuerySuggestions(false);
        setActiveIndex(-1);
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  // ── Cleanup timers + abort on unmount ───────────
  useEffect(() => {
    return () => {
      if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);
      if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
      if (abortRef.current) abortRef.current.abort();
    };
  }, []);

  // ═════════════════════════════════════════════════
  // LOCATION HANDLERS (unchanged logic)
  // ═════════════════════════════════════════════════

  const handleAutoDetect = useCallback(async () => {
    setLocationLoading(true);
    try {
      const coords = await getUserLocation();
      const res = await reverseGeocode(coords.lat, coords.lon);
      const data = res.data || res;
      setLocation(data.displayName || `${data.locality || ''}, ${data.city || ''}`.replace(/^, |, $/g, ''));
      setLat(coords.lat);
      setLon(coords.lon);
    } catch {
      // Silently fail — user can type manually
    } finally {
      setLocationLoading(false);
    }
  }, []);

  const handleLocationChange = useCallback((value) => {
    setLocation(value);
    setLat(null);
    setLon(null);

    if (locationDebounceRef.current) clearTimeout(locationDebounceRef.current);

    if (value.trim().length < 2) {
      setLocationSuggestions([]);
      setShowLocationSuggestions(false);
      return;
    }

    locationDebounceRef.current = setTimeout(async () => {
      try {
        const res = await geocodeSearch(value.trim());
        const data = res.data || res;
        setLocationSuggestions(Array.isArray(data) ? data : []);
        setShowLocationSuggestions(true);
      } catch {
        setLocationSuggestions([]);
      }
    }, 300);
  }, []);

  const handleSelectLocation = useCallback((suggestion) => {
    setLocation(suggestion.displayName || `${suggestion.locality || ''}, ${suggestion.city || ''}`.replace(/^, |, $/g, ''));
    setLat(suggestion.lat);
    setLon(suggestion.lon);
    setLocationSuggestions([]);
    setShowLocationSuggestions(false);
  }, []);

  const handleClearLocation = useCallback(() => {
    setLocation('');
    setLat(null);
    setLon(null);
    setLocationSuggestions([]);
  }, []);

  // ═════════════════════════════════════════════════
  // QUERY AUTOCOMPLETE HANDLERS
  // ═════════════════════════════════════════════════

  const handleQueryChange = useCallback((value) => {
    setQuery(value);
    setActiveIndex(-1);

    if (queryDebounceRef.current) clearTimeout(queryDebounceRef.current);
    if (abortRef.current) abortRef.current.abort();

    // Empty → show popular searches
    if (!value.trim()) {
      setQuerySuggestions({
        specialties: POPULAR_SEARCHES.map((name) => ({ name })),
        doctors: [],
        clinics: [],
      });
      setShowQuerySuggestions(true);
      setQueryLoading(false);
      return;
    }

    // Too short → hide
    if (value.trim().length < 2) {
      setQuerySuggestions({ specialties: [], doctors: [], clinics: [] });
      setShowQuerySuggestions(false);
      return;
    }

    // Instant client-side specialty match
    const lower = value.trim().toLowerCase();
    const matchedSpecialties = SPECIALTIES
      .filter((s) => s.toLowerCase().includes(lower))
      .slice(0, 3)
      .map((name) => ({ name }));

    setQuerySuggestions((prev) => ({ ...prev, specialties: matchedSpecialties }));
    setShowQuerySuggestions(true);
    setQueryLoading(true);

    // Debounced API call for doctors + clinics
    queryDebounceRef.current = setTimeout(async () => {
      const controller = new AbortController();
      abortRef.current = controller;
      try {
        const res = await fetchSearchSuggestions(value.trim(), controller.signal);
        const data = res.data || res;
        setQuerySuggestions({
          specialties: matchedSpecialties,
          doctors: (data.doctors || []).slice(0, 3),
          clinics: (data.clinics || []).slice(0, 3),
        });
      } catch (err) {
        if (err.name !== 'AbortError') {
          setQuerySuggestions((prev) => ({ ...prev, doctors: [], clinics: [] }));
        }
      } finally {
        setQueryLoading(false);
      }
    }, 300);
  }, []);

  const handleQueryFocus = useCallback(() => {
    if (!query.trim()) {
      setQuerySuggestions({
        specialties: POPULAR_SEARCHES.map((name) => ({ name })),
        doctors: [],
        clinics: [],
      });
      setShowQuerySuggestions(true);
    } else if (flatSuggestions.length > 0) {
      setShowQuerySuggestions(true);
    }
  }, [query, flatSuggestions.length]);

  const handleSelectQuerySuggestion = useCallback((item) => {
    setShowQuerySuggestions(false);
    setActiveIndex(-1);

    if (item.category === 'specialty') {
      navigate(`/browse?specialty=${encodeURIComponent(item.name)}&tab=doctors`);
    } else if (item.category === 'doctor') {
      navigate(`/clinics/${item.clinicSlug}/doctors/${item._id}`);
    } else if (item.category === 'clinic') {
      navigate(`/clinics/${item.slug}`);
    }
  }, [navigate]);

  // ═════════════════════════════════════════════════
  // FORM SUBMIT
  // ═════════════════════════════════════════════════

  const handleSubmit = useCallback((e) => {
    e?.preventDefault();
    setShowQuerySuggestions(false);
    setActiveIndex(-1);
    onSearch?.({ query: query.trim(), location: location.trim(), lat, lon });
  }, [query, location, lat, lon, onSearch]);

  // ═════════════════════════════════════════════════
  // KEYBOARD NAVIGATION
  // ═════════════════════════════════════════════════

  const handleQueryKeyDown = useCallback((e) => {
    if (!showQuerySuggestions || flatSuggestions.length === 0) {
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => (prev < flatSuggestions.length - 1 ? prev + 1 : 0));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => (prev > 0 ? prev - 1 : flatSuggestions.length - 1));
        break;
      case 'Enter':
        if (activeIndex >= 0 && activeIndex < flatSuggestions.length) {
          e.preventDefault();
          handleSelectQuerySuggestion(flatSuggestions[activeIndex]);
        }
        // If no item highlighted, let the form submit naturally
        break;
      case 'Escape':
        setShowQuerySuggestions(false);
        setActiveIndex(-1);
        break;
      default:
        break;
    }
  }, [showQuerySuggestions, flatSuggestions, activeIndex, handleSelectQuerySuggestion]);

  // ═════════════════════════════════════════════════
  // RENDER HELPERS
  // ═════════════════════════════════════════════════

  const isPopularMode = !query.trim() && showQuerySuggestions;

  function renderQueryDropdown() {
    if (!showQuerySuggestions) return null;
    if (flatSuggestions.length === 0 && !queryLoading) return null;

    let globalIdx = -1;

    return (
      <div
        className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-300/60 py-1 z-50 max-h-80 overflow-y-auto"
        role="listbox"
      >
        {/* Popular searches header */}
        {isPopularMode && flatSuggestions.length > 0 && (
          <div className="px-4 py-2 text-[11px] font-semibold text-neutral-900/30 uppercase tracking-wide flex items-center gap-1.5">
            <TrendingUp className="w-3 h-3" />
            Popular Searches
          </div>
        )}

        {/* Popular mode — flat list with stethoscope icons */}
        {isPopularMode && querySuggestions.specialties.map((item) => {
          globalIdx++;
          const idx = globalIdx;
          return (
            <button
              key={`pop-${item.name}`}
              id={`suggestion-${idx}`}
              type="button"
              role="option"
              aria-selected={activeIndex === idx}
              onClick={() => handleSelectQuerySuggestion({ ...item, category: 'specialty' })}
              onMouseEnter={() => setActiveIndex(idx)}
              className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                activeIndex === idx ? 'bg-primary-50 text-neutral-900' : 'text-neutral-900/70 hover:bg-neutral-50'
              }`}
            >
              <Stethoscope className="w-4 h-4 text-primary-500 shrink-0" />
              <span className="truncate">{item.name}</span>
            </button>
          );
        })}

        {/* Typed mode — categorized sections */}
        {!isPopularMode && (
          <>
            {/* Specialties */}
            {querySuggestions.specialties.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-neutral-900/30 uppercase tracking-wide">
                  Specialties
                </div>
                {querySuggestions.specialties.map((item) => {
                  globalIdx++;
                  const idx = globalIdx;
                  return (
                    <button
                      key={`spec-${item.name}`}
                      id={`suggestion-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === idx}
                      onClick={() => handleSelectQuerySuggestion({ ...item, category: 'specialty' })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                        activeIndex === idx ? 'bg-primary-50 text-neutral-900' : 'text-neutral-900/70 hover:bg-neutral-50'
                      }`}
                    >
                      <Stethoscope className="w-4 h-4 text-primary-500 shrink-0" />
                      <span className="truncate">{item.name}</span>
                    </button>
                  );
                })}
              </>
            )}

            {/* Doctors */}
            {querySuggestions.doctors.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-neutral-900/30 uppercase tracking-wide">
                  Doctors
                </div>
                {querySuggestions.doctors.map((item) => {
                  globalIdx++;
                  const idx = globalIdx;
                  return (
                    <button
                      key={`doc-${item._id}`}
                      id={`suggestion-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === idx}
                      onClick={() => handleSelectQuerySuggestion({ ...item, category: 'doctor' })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                        activeIndex === idx ? 'bg-primary-50 text-neutral-900' : 'text-neutral-900/70 hover:bg-neutral-50'
                      }`}
                    >
                      <User className="w-4 h-4 text-emerald-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block truncate text-[11px] text-neutral-900/40">
                          {item.specializations?.[0]}{item.clinicName ? ` · ${item.clinicName}` : ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}

            {/* Clinics */}
            {querySuggestions.clinics.length > 0 && (
              <>
                <div className="px-4 py-1.5 text-[11px] font-semibold text-neutral-900/30 uppercase tracking-wide">
                  Clinics
                </div>
                {querySuggestions.clinics.map((item) => {
                  globalIdx++;
                  const idx = globalIdx;
                  return (
                    <button
                      key={`clinic-${item._id}`}
                      id={`suggestion-${idx}`}
                      type="button"
                      role="option"
                      aria-selected={activeIndex === idx}
                      onClick={() => handleSelectQuerySuggestion({ ...item, category: 'clinic' })}
                      onMouseEnter={() => setActiveIndex(idx)}
                      className={`w-full text-left px-4 py-2.5 text-sm transition-colors flex items-center gap-2.5 ${
                        activeIndex === idx ? 'bg-primary-50 text-neutral-900' : 'text-neutral-900/70 hover:bg-neutral-50'
                      }`}
                    >
                      <Building2 className="w-4 h-4 text-blue-500 shrink-0" />
                      <div className="min-w-0">
                        <span className="block truncate font-medium">{item.name}</span>
                        <span className="block truncate text-[11px] text-neutral-900/40">
                          {item.address?.city || ''}
                        </span>
                      </div>
                    </button>
                  );
                })}
              </>
            )}
          </>
        )}

        {/* Loading indicator */}
        {queryLoading && (
          <div className="px-4 py-3 flex items-center justify-center gap-2 text-sm text-neutral-900/30">
            <Loader2 className="w-3.5 h-3.5 animate-spin" />
            <span>Searching...</span>
          </div>
        )}
      </div>
    );
  }

  // ═════════════════════════════════════════════════
  // RENDER
  // ═════════════════════════════════════════════════

  return (
    <div className={styles.wrapper}>
      <form onSubmit={handleSubmit} className={styles.container}>
        {/* Search input with autocomplete */}
        <div className="relative flex-1 min-w-0" ref={queryDropdownRef}>
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4.5 h-4.5 text-neutral-900/30 pointer-events-none" />
          <input
            ref={searchInputRef}
            type="text"
            value={query}
            onChange={(e) => handleQueryChange(e.target.value)}
            onFocus={handleQueryFocus}
            onKeyDown={handleQueryKeyDown}
            placeholder="Search doctors, specialties, or clinics..."
            className={`${styles.input} pl-10 bg-transparent text-neutral-900 placeholder:text-neutral-900/30 outline-none w-full`}
            autoComplete="off"
            role="combobox"
            aria-expanded={showQuerySuggestions}
            aria-haspopup="listbox"
            aria-activedescendant={activeIndex >= 0 ? `suggestion-${activeIndex}` : undefined}
          />
          {renderQueryDropdown()}
        </div>

        {/* Divider */}
        <div className="hidden sm:block w-px bg-neutral-300/60 self-stretch my-1" />

        {/* Location input */}
        <div className="relative" ref={locationDropdownRef}>
          <MapPin className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-neutral-900/30 pointer-events-none" />
          <input
            type="text"
            value={location}
            onChange={(e) => handleLocationChange(e.target.value)}
            onFocus={() => locationSuggestions.length > 0 && setShowLocationSuggestions(true)}
            placeholder="Location"
            className={`${styles.locationInput} pl-9 pr-16 bg-transparent text-neutral-900 placeholder:text-neutral-900/30 outline-none w-full`}
          />
          <div className="absolute right-2 top-1/2 -translate-y-1/2 flex items-center gap-1">
            {location && (
              <button type="button" onClick={handleClearLocation} className="p-1 text-neutral-900/30 hover:text-neutral-900/50 transition-colors">
                <X className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={handleAutoDetect}
              disabled={locationLoading}
              className="p-1.5 text-primary-600 hover:text-primary-700 transition-colors disabled:opacity-50"
              title="Use my location"
            >
              {locationLoading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Crosshair className="w-4 h-4" />
              )}
            </button>
          </div>

          {/* Location suggestions dropdown */}
          {showLocationSuggestions && locationSuggestions.length > 0 && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl shadow-lg border border-neutral-300/60 py-1 z-50 max-h-48 overflow-y-auto">
              {locationSuggestions.map((s, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => handleSelectLocation(s)}
                  className="w-full text-left px-4 py-2.5 text-sm text-neutral-900/70 hover:bg-neutral-50 hover:text-neutral-900 transition-colors flex items-center gap-2"
                >
                  <MapPin className="w-3.5 h-3.5 text-neutral-900/30 shrink-0" />
                  <span className="truncate">{s.displayName || `${s.locality || ''}, ${s.city || ''}`.replace(/^, |, $/g, '')}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Search button */}
        <button
          type="submit"
          className={`${styles.button} bg-gradient-to-r from-primary-500 to-primary-600 text-white rounded-xl hover:from-primary-600 hover:to-primary-700 transition-all shadow-sm shadow-primary-600/20 cursor-pointer flex items-center justify-center gap-2 shrink-0`}
        >
          <Search className="w-4 h-4" />
          <span className="hidden sm:inline">Search</span>
        </button>
      </form>
    </div>
  );
}
