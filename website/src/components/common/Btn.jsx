import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionLink = motion.create(Link);

const variantStyles = {
  primary:
    'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-md shadow-primary-600/20 hover:shadow-lg hover:shadow-primary-600/25',
  white: 'bg-white text-neutral-900 hover:bg-neutral-100 shadow-md shadow-black/10',
  outline: 'bg-transparent border border-primary-300 text-primary-600 hover:bg-primary-50/60',
  ghost: 'text-primary-600 hover:bg-primary-50/60',
  heroOutline: 'bg-transparent border border-white/30 text-white hover:bg-white/10',
  ctaWhite: 'bg-white text-primary-700 hover:bg-neutral-100 shadow-lg shadow-black/10',
};

const sizes = {
  sm: 'px-5 py-2.5 text-sm',
  md: 'px-7 py-3.5 text-base',
  lg: 'px-9 py-4 text-lg',
};

const hoverMotion = {
  whileHover: { scale: 1.02 },
  whileTap: { scale: 0.98 },
  transition: { type: 'spring', stiffness: 400, damping: 17 },
};

export default function Btn({ children, to, variant = 'primary', size = 'md', className = '', ...props }) {
  const base = `inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-300 cursor-pointer ${variantStyles[variant] || ''} ${sizes[size] || ''} ${className}`;

  if (to) {
    return (
      <MotionLink to={to} className={base} {...hoverMotion} {...props}>
        {children}
      </MotionLink>
    );
  }

  return (
    <motion.button className={base} {...hoverMotion} {...props}>
      {children}
    </motion.button>
  );
}
