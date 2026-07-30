import { useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Loader2, Clock, X, ArrowRight,
  LayoutDashboard, Building2, Stethoscope, CalendarDays, Users, CreditCard,
  UserCog, FileText, Layers, Package, Briefcase, HeartPulse, Pill,
} from 'lucide-react';

const ICON_MAP = {
  LayoutDashboard, Building2, Stethoscope, CalendarDays, Users, CreditCard,
  UserCog, FileText, Layers, Package, Briefcase, HeartPulse, Pill,
};

function getIcon(name) {
  return ICON_MAP[name] || Search;
}

export default function GlobalSearchOverlay({
  open,
  setOpen,
  query,
  setQuery,
  loading,
  activeIndex,
  setActiveIndex,
  allResults,
  selectableItems,
  recentSearches,
  addRecentSearch,
  clearRecentSearches,
  placeholder = 'Search pages, patients, appointments...',
  categoryIcons = {},
}) {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Focus input on open
  useEffect(() => {
    if (open) {
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Body scroll lock
  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
      return () => { document.body.style.overflow = ''; };
    }
  }, [open]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const active = listRef.current.querySelector('[data-active="true"]');
    if (active) {
      active.scrollIntoView({ block: 'nearest' });
    }
  }, [activeIndex]);

  function handleSelect(item) {
    if (!item) return;

    // Save to recent searches — preserve originalType so re-selection triggers highlight
    addRecentSearch({
      id: item._id || item.id || item.to,
      label: item.name || item.label,
      originalType: item.type === 'recent' ? (item.originalType || 'nav') : item.type,
      url: item.type === 'nav' ? item.to : item.url,
      subtitle: item.subtitle || '',
      categoryLabel: item.categoryLabel || '',
      icon: item.categoryIcon || item.iconName || item.icon || '',
    });

    // Navigate
    if (item.type === 'nav') {
      navigate(item.to);
    } else if (item.type === 'entity') {
      if (item.url) {
        const searchName = item.name || item.label || '';
        const params = new URLSearchParams();
        params.set('highlight', item._id);
        if (searchName) params.set('hsearch', searchName);
        const sep = item.url.includes('?') ? '&' : '?';
        navigate(`${item.url}${sep}${params.toString()}`);
      }
    } else if (item.type === 'recent') {
      // Entity-origin recent items: re-navigate with highlight params
      if (item.originalType === 'entity' && item.id) {
        const params = new URLSearchParams();
        params.set('highlight', item.id);
        if (item.label) params.set('hsearch', item.label);
        const sep = item.url.includes('?') ? '&' : '?';
        navigate(`${item.url}${sep}${params.toString()}`);
      } else {
        navigate(item.url);
      }
    }

    setOpen(false);
  }

  function handleKeyDown(e) {
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) => Math.min(prev + 1, selectableItems.length - 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) => Math.max(prev - 1, 0));
        break;
      case 'Enter':
        e.preventDefault();
        if (selectableItems[activeIndex]) handleSelect(selectableItems[activeIndex]);
        break;
      case 'Escape':
        e.preventDefault();
        setOpen(false);
        break;
    }
  }

  if (!open) return null;

  const showRecent = !query.trim() && recentSearches.length > 0;
  const showEmpty = query.trim().length >= 2 && !loading && allResults.filter((r) => r.type !== 'header').length === 0;
  let selectableIdx = -1;

  return (
    <div className="fixed inset-0 z-[200] flex items-start justify-center pt-[12vh] sm:pt-[15vh]">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-neutral-950/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />

      {/* Dialog */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        className="relative w-full max-w-[640px] mx-3 sm:mx-4 bg-white rounded-2xl shadow-[0_25px_50px_-12px_rgba(0,0,0,0.25)] border border-neutral-200/60 overflow-hidden"
        style={{ animation: 'gsOverlayIn 0.15s ease-out' }}
        onKeyDown={handleKeyDown}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-neutral-200">
          <Search className="h-5 w-5 text-neutral-400 shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={placeholder}
            className="flex-1 text-sm text-neutral-900 placeholder:text-neutral-400 outline-none bg-transparent"
            autoComplete="off"
            spellCheck="false"
            role="combobox"
            aria-expanded={allResults.length > 0}
            aria-haspopup="listbox"
          />
          {loading && <Loader2 className="h-4 w-4 text-neutral-400 animate-spin shrink-0" />}
          <kbd className="hidden sm:inline-flex items-center px-1.5 py-0.5 text-[10px] font-mono text-neutral-400 bg-neutral-100 rounded border border-neutral-200 leading-none shrink-0">
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div ref={listRef} className="max-h-[400px] overflow-y-auto" role="listbox">
          {/* Recent searches (empty query state) */}
          {showRecent && (
            <div className="py-2">
              <div className="flex items-center justify-between px-4 py-1.5">
                <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">Recent</span>
                <button
                  onClick={(e) => { e.stopPropagation(); clearRecentSearches(); }}
                  className="text-[11px] text-neutral-400 hover:text-neutral-600 transition"
                >
                  Clear
                </button>
              </div>
              {recentSearches.map((item, i) => (
                <button
                  key={`recent-${item.id}-${i}`}
                  onClick={() => handleSelect({ ...item, type: 'recent' })}
                  className="w-full flex items-center gap-3 px-4 py-2.5 hover:bg-neutral-50 transition text-left"
                >
                  <Clock className="h-4 w-4 text-neutral-300 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-neutral-700 truncate">{item.label}</p>
                    {item.subtitle && (
                      <p className="text-[11px] text-neutral-400 truncate">{item.subtitle}</p>
                    )}
                  </div>
                  <ArrowRight className="h-3.5 w-3.5 text-neutral-300 shrink-0" />
                </button>
              ))}
            </div>
          )}

          {/* Grouped results */}
          {query.trim() && allResults.length > 0 && (
            <div className="py-2">
              {allResults.map((item, i) => {
                if (item.type === 'header') {
                  return (
                    <div key={`header-${item.label}-${i}`} className="px-4 py-1.5 mt-1 first:mt-0">
                      <span className="text-[11px] font-semibold text-neutral-400 uppercase tracking-wider">
                        {item.label}
                      </span>
                    </div>
                  );
                }

                selectableIdx++;
                const isActive = selectableIdx === activeIndex;
                const IconComponent = item.type === 'nav'
                  ? (item.icon || LayoutDashboard)
                  : (categoryIcons[item.category] || getIcon(item.categoryIcon));

                return (
                  <button
                    key={`${item.type}-${item._id || item.to}-${i}`}
                    role="option"
                    aria-selected={isActive}
                    data-active={isActive}
                    onClick={() => handleSelect(item)}
                    onMouseEnter={() => setActiveIndex(selectableIdx)}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 transition text-left ${
                      isActive ? 'bg-primary-50' : 'hover:bg-neutral-50'
                    }`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                      isActive ? 'bg-primary-100 text-primary-600' : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      <IconComponent className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${isActive ? 'text-primary-900 font-medium' : 'text-neutral-700'}`}>
                        {item.name || item.label}
                      </p>
                      {item.subtitle && (
                        <p className="text-[11px] text-neutral-400 truncate">{item.subtitle}</p>
                      )}
                    </div>
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-md shrink-0 ${
                      item.type === 'nav'
                        ? 'bg-blue-50 text-blue-500'
                        : 'bg-neutral-100 text-neutral-400'
                    }`}>
                      {item.type === 'nav' ? 'Page' : (item.categoryLabel || '')}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Empty state */}
          {showEmpty && (
            <div className="py-12 text-center">
              <Search className="h-8 w-8 text-neutral-200 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">
                No results for "<span className="font-medium text-neutral-500">{query.trim()}</span>"
              </p>
              <p className="text-[11px] text-neutral-300 mt-1">Try a different search term</p>
            </div>
          )}

          {/* Initial state — no query yet */}
          {!query.trim() && recentSearches.length === 0 && (
            <div className="py-10 text-center">
              <Search className="h-8 w-8 text-neutral-200 mx-auto mb-3" />
              <p className="text-sm text-neutral-400">Search for pages, patients, doctors, and more</p>
              <p className="text-[11px] text-neutral-300 mt-1">Start typing to see results</p>
            </div>
          )}
        </div>

        {/* Footer — keyboard hints */}
        <div className="hidden sm:flex items-center gap-4 px-4 py-2 border-t border-neutral-100 text-[11px] text-neutral-400">
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 rounded border border-neutral-200 text-[10px] font-mono leading-none">↑↓</kbd>
            navigate
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 rounded border border-neutral-200 text-[10px] font-mono leading-none">↵</kbd>
            select
          </span>
          <span className="flex items-center gap-1">
            <kbd className="px-1 py-0.5 bg-neutral-100 rounded border border-neutral-200 text-[10px] font-mono leading-none">esc</kbd>
            close
          </span>
        </div>
      </div>

      {/* Animation keyframe */}
      <style>{`
        @keyframes gsOverlayIn {
          from { opacity: 0; transform: scale(0.98) translateY(-8px); }
          to { opacity: 1; transform: scale(1) translateY(0); }
        }
      `}</style>
    </div>
  );
}
