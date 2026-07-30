import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Search, X, Upload, Loader2,
  Calendar, Users, Stethoscope, IndianRupee,
  Clock, FileText, MoreHorizontal,
} from 'lucide-react';

// ═══════════════════════════════════════════════════════════════════════════════
//  DESIGN TOKENS (shared across all components)
// ═══════════════════════════════════════════════════════════════════════════════

const COLOR_MAP = {
  primary: {
    bg:      'bg-primary-50',
    bgGradient: 'bg-gradient-to-br from-primary-400/20 to-primary-600/20',
    text:    'text-primary-700',
    icon:    'text-primary-600',
    border:  'border-primary-200',
    dot:     'bg-primary-500',
  },
  green: {
    bg:      'bg-emerald-50',
    bgGradient: 'bg-gradient-to-br from-emerald-400/20 to-emerald-600/20',
    text:    'text-emerald-700',
    icon:    'text-emerald-600',
    border:  'border-emerald-200',
    dot:     'bg-emerald-500',
  },
  yellow: {
    bg:      'bg-amber-50',
    bgGradient: 'bg-gradient-to-br from-amber-400/20 to-amber-600/20',
    text:    'text-amber-700',
    icon:    'text-amber-600',
    border:  'border-amber-200',
    dot:     'bg-amber-500',
  },
  red: {
    bg:      'bg-red-50',
    bgGradient: 'bg-gradient-to-br from-red-400/20 to-red-600/20',
    text:    'text-red-700',
    icon:    'text-red-600',
    border:  'border-red-200',
    dot:     'bg-red-500',
  },
  purple: {
    bg:      'bg-purple-50',
    bgGradient: 'bg-gradient-to-br from-purple-400/20 to-purple-600/20',
    text:    'text-purple-700',
    icon:    'text-purple-600',
    border:  'border-purple-200',
    dot:     'bg-purple-500',
  },
  blue: {
    bg:      'bg-blue-50',
    bgGradient: 'bg-gradient-to-br from-blue-400/20 to-blue-600/20',
    text:    'text-blue-700',
    icon:    'text-blue-600',
    border:  'border-blue-200',
    dot:     'bg-blue-500',
  },
  gray: {
    bg:      'bg-neutral-200/60',
    bgGradient: 'bg-gradient-to-br from-neutral-300/40 to-neutral-400/40',
    text:    'text-neutral-900/60',
    icon:    'text-neutral-900/40',
    border:  'border-neutral-300',
    dot:     'bg-neutral-900/30',
  },
};

const SPRING = { type: 'spring', stiffness: 300, damping: 20 };


// ═══════════════════════════════════════════════════════════════════════════════
//  1. SkeletonLoader
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Animated pulse skeleton placeholder.
 *
 * @param {Object} props
 * @param {'card'|'row'|'text'|'stat'} props.variant - Shape variant
 * @param {number}  [props.count=1]    - Number of skeleton items to render
 * @param {string}  [props.className]  - Additional Tailwind classes
 */
export function SkeletonLoader({ variant = 'text', count = 1, className = '' }) {
  const variants = {
    card: 'h-32 w-full rounded-2xl',
    row:  'h-14 w-full rounded-xl',
    text: 'h-4 w-full rounded-lg',
    stat: 'h-28 w-full rounded-2xl',
  };

  const shape = variants[variant] || variants.text;

  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      {Array.from({ length: count }, (_, i) => (
        <div
          key={i}
          className={`animate-pulse bg-neutral-200/60 ${shape}`}
        >
          {variant === 'stat' && (
            <div className="p-5 space-y-3">
              <div className="h-10 w-10 rounded-xl bg-neutral-300/40 animate-pulse" />
              <div className="h-5 w-20 rounded-lg bg-neutral-300/40 animate-pulse" />
              <div className="h-3 w-28 rounded bg-neutral-300/30 animate-pulse" />
            </div>
          )}
          {variant === 'card' && (
            <div className="p-5 space-y-3">
              <div className="h-4 w-3/4 rounded bg-neutral-300/40 animate-pulse" />
              <div className="h-3 w-1/2 rounded bg-neutral-300/30 animate-pulse" />
              <div className="h-3 w-2/3 rounded bg-neutral-300/30 animate-pulse" />
            </div>
          )}
          {variant === 'row' && (
            <div className="flex items-center gap-4 px-4 h-full">
              <div className="h-8 w-8 rounded-full bg-neutral-300/40 animate-pulse shrink-0" />
              <div className="flex-1 space-y-2">
                <div className="h-3 w-1/3 rounded bg-neutral-300/40 animate-pulse" />
                <div className="h-2.5 w-1/4 rounded bg-neutral-300/30 animate-pulse" />
              </div>
              <div className="h-6 w-16 rounded-full bg-neutral-300/30 animate-pulse" />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  2. MetricCard
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Enhanced stat card for doctor dashboard with hover animation and loading state.
 *
 * @param {Object}  props
 * @param {string}  props.title                    - Card title label
 * @param {string|number} props.value              - Primary metric value
 * @param {string}  [props.subtitle]               - Secondary description
 * @param {import('lucide-react').LucideIcon} [props.icon] - Lucide icon component
 * @param {'primary'|'green'|'yellow'|'red'|'purple'} [props.color='primary'] - Color theme
 * @param {number}  [props.trend]                  - Trend percentage (positive = up, negative = down)
 * @param {boolean} [props.loading=false]          - Show skeleton when true
 * @param {string}  [props.className]              - Additional Tailwind classes
 */
export function MetricCard({
  title,
  value,
  subtitle,
  icon: Icon,
  color = 'primary',
  trend,
  loading = false,
  className = '',
}) {
  if (loading) {
    return <SkeletonLoader variant="stat" />;
  }

  const c = COLOR_MAP[color] || COLOR_MAP.primary;

  return (
    <motion.div
      whileHover={{ y: -2 }}
      transition={SPRING}
      className={`
        bg-white rounded-2xl border border-neutral-300/60
        p-5 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]
        transition-shadow duration-300 cursor-default ${className}
      `}
    >
      {/* Header row: icon + trend badge */}
      <div className="flex items-start justify-between mb-4">
        {Icon && (
          <div className={`p-2.5 rounded-xl ${c.bgGradient}`}>
            <Icon className={`h-5 w-5 ${c.icon}`} />
          </div>
        )}
        {trend !== undefined && trend !== null && (
          <div
            className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-semibold ${
              trend >= 0
                ? 'bg-emerald-50 text-emerald-700'
                : 'bg-red-50 text-red-700'
            }`}
          >
            <svg
              className="h-3 w-3"
              viewBox="0 0 12 12"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {trend >= 0 ? (
                <path d="M1 8L6 3L11 8" />
              ) : (
                <path d="M1 4L6 9L11 4" />
              )}
            </svg>
            {Math.abs(trend)}%
          </div>
        )}
      </div>

      {/* Value */}
      <p className="text-2xl font-bold text-neutral-900 font-display">
        {value}
      </p>

      {/* Title */}
      <p className="text-xs text-neutral-900/40 mt-1">{title}</p>

      {/* Subtitle */}
      {subtitle && (
        <p className="text-[11px] text-neutral-900/30 mt-0.5">
          {subtitle}
        </p>
      )}
    </motion.div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  3. TimelineCard
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Schedule item with a time gutter and vertical connector line.
 *
 * @param {Object}  props
 * @param {string}  props.time                     - Time string displayed in the gutter
 * @param {string}  props.title                    - Main title of the schedule item
 * @param {string}  [props.subtitle]               - Secondary description
 * @param {string}  [props.status]                 - Status text label
 * @param {'primary'|'green'|'yellow'|'red'|'purple'|'blue'|'gray'} [props.statusColor='gray']
 * @param {string}  [props.action]                 - Action button label
 * @param {Function} [props.onAction]              - Action button click handler
 * @param {import('lucide-react').LucideIcon} [props.icon] - Lucide icon component
 * @param {boolean} [props.isLast=false]           - Hides the connector line when true
 */
export function TimelineCard({
  time,
  title,
  subtitle,
  status,
  statusColor = 'gray',
  action,
  onAction,
  icon: Icon = Clock,
  isLast = false,
}) {
  const sc = COLOR_MAP[statusColor] || COLOR_MAP.gray;

  return (
    <div className="flex gap-4">
      {/* ── Time gutter ── */}
      <div className="flex flex-col items-center w-16 shrink-0 pt-1">
        <span className="text-xs font-mono font-semibold text-neutral-900/50 whitespace-nowrap">
          {time}
        </span>
        {/* Dot */}
        <div className={`w-2.5 h-2.5 rounded-full mt-2 shrink-0 ${sc.dot}`} />
        {/* Connector line */}
        {!isLast && (
          <div className="flex-1 w-px border-l-2 border-dotted border-neutral-300 mt-1" />
        )}
      </div>

      {/* ── Card content ── */}
      <div
        className={`
          flex-1 mb-4 bg-white rounded-xl
          border border-neutral-300/60
          p-4 shadow-[var(--shadow-xs)] hover:shadow-[var(--shadow-sm)]
          transition-shadow duration-200
        `}
      >
        <div className="flex items-start justify-between gap-3">
          {/* Left: icon + text */}
          <div className="flex items-start gap-3 min-w-0">
            <div className={`p-2 rounded-lg shrink-0 ${sc.bg}`}>
              <Icon className={`h-4 w-4 ${sc.icon}`} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-neutral-900 truncate">
                {title}
              </p>
              {subtitle && (
                <p className="text-xs text-neutral-900/40 mt-0.5 truncate">
                  {subtitle}
                </p>
              )}
              {status && (
                <span
                  className={`
                    inline-flex items-center gap-1.5 text-[11px] font-medium
                    px-2 py-0.5 rounded-full mt-2 ${sc.bg} ${sc.text}
                  `}
                >
                  <span className={`w-1 h-1 rounded-full ${sc.dot}`} />
                  {status}
                </span>
              )}
            </div>
          </div>

          {/* Right: action */}
          {action && onAction && (
            <button
              onClick={onAction}
              className="
                shrink-0 px-3 py-1.5 text-xs font-medium rounded-lg
                text-primary-600 hover:bg-primary-50
                transition-colors
              "
            >
              {action}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  4. SearchInput
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Debounced search input with clear button and loading indicator.
 *
 * @param {Object}   props
 * @param {string}   props.value                   - Controlled search value
 * @param {Function} props.onChange                 - Called with debounced value
 * @param {string}   [props.placeholder='Search...'] - Placeholder text
 * @param {boolean}  [props.loading=false]          - Shows spinner when true
 * @param {number}   [props.debounceMs=300]         - Debounce delay in milliseconds
 * @param {string}   [props.className]              - Additional Tailwind classes
 */
export function SearchInput({
  value,
  onChange,
  placeholder = 'Search...',
  loading = false,
  debounceMs = 300,
  className = '',
}) {
  const [localValue, setLocalValue] = useState(value || '');
  const timerRef = useRef(null);

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value || '');
  }, [value]);

  const handleChange = useCallback(
    (e) => {
      const next = e.target.value;
      setLocalValue(next);

      if (timerRef.current) clearTimeout(timerRef.current);
      timerRef.current = setTimeout(() => {
        onChange?.(next);
      }, debounceMs);
    },
    [onChange, debounceMs],
  );

  const handleClear = useCallback(() => {
    setLocalValue('');
    if (timerRef.current) clearTimeout(timerRef.current);
    onChange?.('');
  }, [onChange]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  return (
    <div className={`relative ${className}`}>
      {/* Search icon */}
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-900/25 pointer-events-none" />

      <input
        type="text"
        value={localValue}
        onChange={handleChange}
        placeholder={placeholder}
        className="
          w-full px-3 py-2.5 pl-10 border border-neutral-300/60 rounded-xl text-sm
          bg-neutral-50/50 text-neutral-900 placeholder:text-neutral-900/25
          focus:bg-white focus:border-primary-300 focus:ring-2 focus:ring-primary-400/20
          outline-none transition-all
         
         
         
        "
      />

      {/* Right side: loading spinner or clear button */}
      <div className="absolute right-3 top-1/2 -translate-y-1/2 flex items-center gap-1">
        {loading && (
          <Loader2 className="h-4 w-4 text-primary-500 animate-spin" />
        )}
        {localValue && !loading && (
          <button
            onClick={handleClear}
            className="p-0.5 rounded-md hover:bg-neutral-200/60 text-neutral-900/30 hover:text-neutral-900/60 transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  5. FileDropzone
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Drag-and-drop file upload area with base64 reading.
 *
 * @param {Object}   props
 * @param {Function} props.onFileSelect            - Called with { file, name, size, base64 }
 * @param {string}   [props.accept]                - Accepted MIME types (e.g. 'image/*,.pdf')
 * @param {number}   [props.maxSizeMB=10]          - Maximum file size in megabytes
 * @param {string}   [props.label='Drop file here or click to upload']
 * @param {boolean}  [props.uploading=false]        - Shows upload progress state
 * @param {string}   [props.className]              - Additional Tailwind classes
 */
export function FileDropzone({
  onFileSelect,
  accept,
  maxSizeMB = 10,
  label = 'Drop file here or click to upload',
  uploading = false,
  className = '',
}) {
  const [dragging, setDragging] = useState(false);
  const [selectedFile, setSelectedFile] = useState(null);
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const processFile = useCallback(
    (file) => {
      setError('');

      if (file.size > maxSizeMB * 1024 * 1024) {
        setError(`File exceeds ${maxSizeMB} MB limit`);
        return;
      }

      setSelectedFile({ name: file.name, size: file.size });

      const reader = new FileReader();
      reader.onload = () => {
        onFileSelect?.({
          file,
          name: file.name,
          size: file.size,
          base64: reader.result,
        });
      };
      reader.onerror = () => {
        setError('Failed to read file');
        setSelectedFile(null);
      };
      reader.readAsDataURL(file);
    },
    [onFileSelect, maxSizeMB],
  );

  const handleDrop = useCallback(
    (e) => {
      e.preventDefault();
      setDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const handleDragOver = useCallback((e) => {
    e.preventDefault();
    setDragging(true);
  }, []);

  const handleDragLeave = useCallback((e) => {
    e.preventDefault();
    setDragging(false);
  }, []);

  const handleInputChange = useCallback(
    (e) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
    },
    [processFile],
  );

  const formatSize = (bytes) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className={className}>
      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click(); }}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        className={`
          relative flex flex-col items-center justify-center gap-3 p-8
          border-2 border-dashed rounded-2xl cursor-pointer
          transition-all duration-200
          ${
            dragging
              ? 'border-primary-400 bg-primary-50/50'
              : 'border-neutral-300 bg-neutral-50/30 hover:border-neutral-400 hover:bg-neutral-50/60'
          }
          ${uploading ? 'pointer-events-none opacity-60' : ''}
        `}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          onChange={handleInputChange}
          className="hidden"
        />

        {uploading ? (
          <>
            <Loader2 className="h-8 w-8 text-primary-500 animate-spin" />
            <p className="text-sm font-medium text-neutral-900/50">
              Uploading...
            </p>
          </>
        ) : selectedFile ? (
          <>
            <div className="p-3 rounded-xl bg-primary-50">
              <FileText className="h-6 w-6 text-primary-600" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-900 truncate max-w-[240px]">
                {selectedFile.name}
              </p>
              <p className="text-xs text-neutral-900/40 mt-0.5">
                {formatSize(selectedFile.size)}
              </p>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                setSelectedFile(null);
                if (inputRef.current) inputRef.current.value = '';
              }}
              className="text-xs text-red-500 hover:text-red-700 font-medium transition-colors"
            >
              Remove
            </button>
          </>
        ) : (
          <>
            <div className="p-3 rounded-xl bg-neutral-200/60">
              <Upload className="h-6 w-6 text-neutral-900/30" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-neutral-900/60">
                {label}
              </p>
              <p className="text-xs text-neutral-900/30 mt-1">
                Max {maxSizeMB} MB {accept ? `\u00B7 ${accept}` : ''}
              </p>
            </div>
          </>
        )}
      </div>

      {/* Error message */}
      {error && (
        <p className="text-xs text-red-600 mt-2 px-1">{error}</p>
      )}
    </div>
  );
}




// ═══════════════════════════════════════════════════════════════════════════════
//  7. Badge
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Minimal pill badge with a dot indicator.
 * Intentionally simpler and more compact than StatusBadge in shared.jsx.
 *
 * @param {Object} props
 * @param {string} props.label                     - Badge text
 * @param {'primary'|'green'|'yellow'|'red'|'gray'|'blue'|'purple'} [props.color='gray']
 * @param {string} [props.className]               - Additional Tailwind classes
 */
export function Badge({ label, color = 'gray', className = '' }) {
  const c = COLOR_MAP[color] || COLOR_MAP.gray;

  return (
    <span
      className={`
        inline-flex items-center gap-1.5
        text-xs font-medium px-2.5 py-0.5 rounded-full
        ${c.bg} ${c.text}
        ${className}
      `}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${c.dot}`} />
      {label}
    </span>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  8. IconButton
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Circular icon-only button with hover scale and variant styles.
 *
 * @param {Object}  props
 * @param {import('lucide-react').LucideIcon} props.icon - Lucide icon component
 * @param {Function} [props.onClick]               - Click handler
 * @param {'sm'|'md'} [props.size='md']            - Button size
 * @param {'ghost'|'outline'} [props.variant='ghost'] - Visual style variant
 * @param {string}  [props.tooltip]                - Tooltip text (rendered as title attribute)
 * @param {boolean} [props.disabled=false]         - Disabled state
 * @param {string}  [props.className]              - Additional Tailwind classes
 */
export function IconButton({
  icon: Icon,
  onClick,
  size = 'md',
  variant = 'ghost',
  tooltip,
  disabled = false,
  className = '',
}) {
  const sizes = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
  };

  const iconSizes = {
    sm: 'h-4 w-4',
    md: 'h-5 w-5',
  };

  const variants = {
    ghost: `
      text-neutral-900/40 hover:text-neutral-900/70 hover:bg-neutral-200/60
     
    `,
    outline: `
      text-neutral-900/40 hover:text-neutral-900/70
      border border-neutral-300/60 hover:border-neutral-400 hover:bg-neutral-50
     
     
    `,
  };

  return (
    <motion.button
      whileHover={disabled ? {} : { scale: 1.08 }}
      whileTap={disabled ? {} : { scale: 0.95 }}
      transition={SPRING}
      onClick={onClick}
      disabled={disabled}
      title={tooltip}
      className={`
        inline-flex items-center justify-center rounded-xl
        transition-colors duration-150
        ${sizes[size]} ${variants[variant]}
        ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}
        ${className}
      `}
    >
      <Icon className={iconSizes[size]} />
    </motion.button>
  );
}


// ═══════════════════════════════════════════════════════════════════════════════
//  9. EmptyStateIllustration
// ═══════════════════════════════════════════════════════════════════════════════

const EMPTY_STATE_CONFIG = {
  schedule: {
    icon: Calendar,
    defaultMessage: 'No appointments scheduled',
  },
  patients: {
    icon: Users,
    defaultMessage: 'No patients found',
  },
  consultation: {
    icon: Stethoscope,
    defaultMessage: 'No consultations yet',
  },
  revenue: {
    icon: IndianRupee,
    defaultMessage: 'No revenue data available',
  },
};

/**
 * Doctor-themed empty state with large muted icon, message, and optional CTA.
 *
 * @param {Object}   props
 * @param {'schedule'|'patients'|'consultation'|'revenue'} props.type - Context type
 * @param {string}   [props.message]               - Override default message
 * @param {string}   [props.action]                - CTA button label
 * @param {Function} [props.onAction]              - CTA button click handler
 * @param {string}   [props.className]             - Additional Tailwind classes
 */
export function EmptyStateIllustration({
  type = 'schedule',
  message,
  action,
  onAction,
  className = '',
}) {
  const config = EMPTY_STATE_CONFIG[type] || EMPTY_STATE_CONFIG.schedule;
  const Icon = config.icon;
  const displayMessage = message || config.defaultMessage;

  return (
    <div className={`flex flex-col items-center justify-center py-16 px-4 ${className}`}>
      {/* Large muted icon with decorative ring */}
      <div className="relative mb-6">
        <div className="w-20 h-20 rounded-2xl bg-neutral-200/60 flex items-center justify-center">
          <Icon className="h-9 w-9 text-neutral-900/20" />
        </div>
        {/* Subtle decorative dots */}
        <div className="absolute -top-1 -right-1 w-3 h-3 rounded-full bg-primary-200/60" />
        <div className="absolute -bottom-1.5 -left-1.5 w-2 h-2 rounded-full bg-primary-300/40" />
      </div>

      {/* Message */}
      <p className="text-sm font-medium text-neutral-900/50 text-center max-w-xs">
        {displayMessage}
      </p>

      {/* CTA button */}
      {action && onAction && (
        <motion.button
          whileHover={{ scale: 1.02 }}
          whileTap={{ scale: 0.98 }}
          transition={SPRING}
          onClick={onAction}
          className="
            mt-5 px-5 py-2.5 text-sm font-semibold text-white rounded-xl
            bg-gradient-to-r from-primary-500 to-primary-600
            hover:from-primary-600 hover:to-primary-700
            shadow-sm shadow-primary-600/20
            transition-all duration-300
          "
        >
          {action}
        </motion.button>
      )}
    </div>
  );
}
