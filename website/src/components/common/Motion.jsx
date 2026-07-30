import { motion } from 'framer-motion';

// Canonical easing used across the codebase
export const EASE = [0.25, 0.46, 0.45, 0.94];

// Default viewport options for scroll-triggered animations
const VIEWPORT = { once: true, margin: '-60px' };

// ─── FadeIn ──────────────────────────────────
// Scroll-triggered fade with Y offset
export function FadeIn({ children, className, y = 24, duration = 0.5, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── FadeInStagger ───────────────────────────
// Container that staggers children animations
export function FadeInStagger({ children, className, stagger = 0.1, ...props }) {
  return (
    <motion.div
      initial="hidden"
      whileInView="visible"
      viewport={VIEWPORT}
      variants={{ visible: { transition: { staggerChildren: stagger } } }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── FadeInStaggerItem ───────────────────────
// Child of FadeInStagger — inherits hidden/visible state
export function FadeInStaggerItem({ children, className, y = 24, duration = 0.5, ...props }) {
  return (
    <motion.div
      variants={{
        hidden: { opacity: 0, y },
        visible: { opacity: 1, y: 0, transition: { duration, ease: EASE } },
      }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── ScaleIn ─────────────────────────────────
// Scroll-triggered scale + opacity
export function ScaleIn({ children, className, scale = 0.92, duration = 0.6, delay = 0, ...props }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale }}
      whileInView={{ opacity: 1, scale: 1 }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── SlideIn ─────────────────────────────────
// Directional slide from left/right/up/down
const directionMap = {
  left:  { x: -40, y: 0 },
  right: { x: 40, y: 0 },
  up:    { x: 0, y: -30 },
  down:  { x: 0, y: 30 },
};

export function SlideIn({ children, className, direction = 'left', duration = 0.6, delay = 0, ...props }) {
  const offset = directionMap[direction] || directionMap.left;
  return (
    <motion.div
      initial={{ opacity: 0, ...offset }}
      whileInView={{ opacity: 1, x: 0, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── HoverCard ───────────────────────────────
// Card with hover lift + spring physics
export function HoverCard({ children, className, y = -4, ...props }) {
  return (
    <motion.div
      whileHover={{ y }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={className}
      {...props}
    >
      {children}
    </motion.div>
  );
}

// ─── AnimatedSection ─────────────────────────
// Full section wrapper (renders <section>) with viewport detection
export function AnimatedSection({ children, className, y = 30, duration = 0.6, delay = 0, ...props }) {
  return (
    <motion.section
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={VIEWPORT}
      transition={{ duration, delay, ease: EASE }}
      className={className}
      {...props}
    >
      {children}
    </motion.section>
  );
}

// ─── PageTransition ──────────────────────────
// Page-level enter animation (enter-only, no exit)
export function PageTransition({ children, className }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}
