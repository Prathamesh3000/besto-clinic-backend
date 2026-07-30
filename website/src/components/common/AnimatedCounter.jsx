import { useRef, useEffect } from 'react';
import { motion, useInView, useMotionValue, useTransform, animate } from 'framer-motion';

export default function AnimatedCounter({ target, suffix = '', duration = 2, formatAs }) {
  const ref = useRef(null);
  const inView = useInView(ref, { once: true, margin: '-100px' });
  const count = useMotionValue(0);
  const display = useTransform(count, (v) => {
    if (formatAs === 'k') return `${Math.round(v)}K`;
    if (formatAs === 'decimal') return v.toFixed(2);
    return Math.round(v).toLocaleString('en-IN');
  });

  useEffect(() => {
    if (!inView) return;
    const controls = animate(count, target, { duration, ease: 'easeOut' });
    return controls.stop;
  }, [inView, target, duration, count]);

  return (
    <span ref={ref}>
      <motion.span>{display}</motion.span>
      {suffix}
    </span>
  );
}
