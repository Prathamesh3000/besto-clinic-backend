/**
 * Professional Medical-Grade Design System
 * BestoClinic Dental AI Scanner
 *
 * Dark mode, premium aesthetic, conversion-optimized
 */

export const colors = {
  // Background layers
  background: {
    primary: '#0A0E13',      // Deep dark - main background
    secondary: '#0F1419',    // Slightly lighter - cards
    tertiary: '#1C2128',     // Surface - elevated elements
    overlay: 'rgba(10, 14, 19, 0.95)', // Modal overlay
  },

  // Brand colors
  brand: {
    green: '#4ca626',        // BestoClinic primary green
    greenLight: '#5bc72e',   // Hover state
    greenDark: '#3d8520',    // Active state
    blue: '#2e5fa2',         // BestoClinic secondary blue
    blueLight: '#3d75c4',    // Hover state
    blueDark: '#234b82',     // Active state
  },

  // Accent colors (for real-time feedback)
  accent: {
    cyan: '#00E5FF',         // AI active, scanning
    cyanGlow: 'rgba(0, 229, 255, 0.4)', // Glow effect
    purple: '#9333EA',       // Premium features
    amber: '#F59E0B',        // Warning, attention
  },

  // Semantic colors
  status: {
    success: '#10B981',      // Validation passed
    error: '#EF4444',        // Validation failed
    warning: '#F59E0B',      // Needs attention
    info: '#3B82F6',         // Information
  },

  // Text colors
  text: {
    primary: '#FFFFFF',      // Main text
    secondary: '#94A3B8',    // Secondary text
    tertiary: '#64748B',     // Disabled/subtle text
    inverse: '#0A0E13',      // Text on light backgrounds
  },

  // Border & dividers
  border: {
    subtle: 'rgba(148, 163, 184, 0.1)',
    default: 'rgba(148, 163, 184, 0.2)',
    strong: 'rgba(148, 163, 184, 0.3)',
  },
};

export const gradients = {
  // Brand gradients
  brandPrimary: 'linear-gradient(135deg, #4ca626 0%, #5bc72e 100%)',
  brandSecondary: 'linear-gradient(135deg, #2e5fa2 0%, #3d75c4 100%)',
  brandMixed: 'linear-gradient(135deg, #4ca626 0%, #2e5fa2 100%)',

  // AI scanning gradients
  aiActive: 'linear-gradient(135deg, #00E5FF 0%, #9333EA 100%)',
  aiProcessing: 'linear-gradient(45deg, #00E5FF 0%, #4ca626 50%, #00E5FF 100%)',

  // Glass morphism overlays
  glassLight: 'linear-gradient(135deg, rgba(255, 255, 255, 0.1) 0%, rgba(255, 255, 255, 0.05) 100%)',
  glassDark: 'linear-gradient(135deg, rgba(0, 0, 0, 0.3) 0%, rgba(0, 0, 0, 0.1) 100%)',

  // Radial glows
  greenGlow: 'radial-gradient(circle at center, rgba(76, 166, 38, 0.3) 0%, transparent 70%)',
  cyanGlow: 'radial-gradient(circle at center, rgba(0, 229, 255, 0.3) 0%, transparent 70%)',
};

export const shadows = {
  // Subtle elevation
  sm: '0 1px 2px rgba(0, 0, 0, 0.5)',
  md: '0 4px 6px rgba(0, 0, 0, 0.5), 0 2px 4px rgba(0, 0, 0, 0.3)',
  lg: '0 10px 15px rgba(0, 0, 0, 0.5), 0 4px 6px rgba(0, 0, 0, 0.3)',
  xl: '0 20px 25px rgba(0, 0, 0, 0.5), 0 8px 10px rgba(0, 0, 0, 0.3)',

  // Colored glows
  greenGlow: '0 0 20px rgba(76, 166, 38, 0.5), 0 0 40px rgba(76, 166, 38, 0.3)',
  blueGlow: '0 0 20px rgba(46, 95, 162, 0.5), 0 0 40px rgba(46, 95, 162, 0.3)',
  cyanGlow: '0 0 30px rgba(0, 229, 255, 0.6), 0 0 60px rgba(0, 229, 255, 0.4)',

  // Inner shadows (for depth)
  inset: 'inset 0 2px 4px rgba(0, 0, 0, 0.3)',
};

export const blur = {
  none: '0px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  xxl: '24px',
};

export const spacing = {
  xs: '4px',
  sm: '8px',
  md: '16px',
  lg: '24px',
  xl: '32px',
  xxl: '48px',
  xxxl: '64px',
};

export const borderRadius = {
  sm: '8px',
  md: '12px',
  lg: '16px',
  xl: '24px',
  xxl: '32px',
  full: '9999px',
};

export const typography = {
  fontFamily: {
    heading: "'Plus Jakarta Sans', sans-serif",
    body: "'Inter', sans-serif",
    mono: "'JetBrains Mono', monospace",
  },
  fontSize: {
    xs: '12px',
    sm: '14px',
    base: '16px',
    lg: '18px',
    xl: '20px',
    '2xl': '24px',
    '3xl': '30px',
    '4xl': '36px',
    '5xl': '48px',
    '6xl': '60px',
  },
  fontWeight: {
    normal: 400,
    medium: 500,
    semibold: 600,
    bold: 700,
    extrabold: 800,
  },
  lineHeight: {
    tight: 1.2,
    normal: 1.5,
    relaxed: 1.75,
  },
};

export const animation = {
  duration: {
    fast: '150ms',
    normal: '300ms',
    slow: '500ms',
    verySlow: '1000ms',
  },
  easing: {
    default: 'cubic-bezier(0.4, 0, 0.2, 1)',
    smooth: 'cubic-bezier(0.4, 0, 0.1, 1)',
    bounce: 'cubic-bezier(0.68, -0.55, 0.265, 1.55)',
  },
};

export const zIndex = {
  base: 0,
  dropdown: 1000,
  modal: 2000,
  overlay: 3000,
  tooltip: 4000,
  notification: 5000,
};

// Glass morphism utility
export const glassMorphism = {
  light: {
    background: 'rgba(255, 255, 255, 0.1)',
    backdropFilter: `blur(${blur.lg})`,
    border: `1px solid ${colors.border.subtle}`,
    boxShadow: shadows.lg,
  },
  medium: {
    background: 'rgba(255, 255, 255, 0.15)',
    backdropFilter: `blur(${blur.xl})`,
    border: `1px solid ${colors.border.default}`,
    boxShadow: shadows.xl,
  },
  strong: {
    background: 'rgba(255, 255, 255, 0.2)',
    backdropFilter: `blur(${blur.xxl})`,
    border: `1px solid ${colors.border.strong}`,
    boxShadow: shadows.xl,
  },
};

// Medical device UI patterns
export const medicalUI = {
  // Circular progress (like medical devices)
  circularProgress: {
    size: {
      sm: '80px',
      md: '120px',
      lg: '180px',
      xl: '240px',
    },
    strokeWidth: {
      sm: '4px',
      md: '6px',
      lg: '8px',
      xl: '12px',
    },
  },

  // Status indicators
  statusIndicator: {
    size: '12px',
    animation: 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
  },

  // AI confidence meter
  confidenceMeter: {
    height: '6px',
    borderRadius: borderRadius.full,
    animationDuration: animation.duration.normal,
  },
};

// Particle effects config
export const particles = {
  scanning: {
    count: 30,
    colors: [colors.accent.cyan, colors.brand.green, colors.brand.blue],
    sizeRange: [2, 6],
    speedRange: [0.5, 2],
    opacity: 0.6,
  },
  success: {
    count: 50,
    colors: [colors.status.success, colors.brand.green],
    sizeRange: [3, 8],
    speedRange: [1, 3],
    opacity: 0.8,
  },
};

export default {
  colors,
  gradients,
  shadows,
  blur,
  spacing,
  borderRadius,
  typography,
  animation,
  zIndex,
  glassMorphism,
  medicalUI,
  particles,
};
