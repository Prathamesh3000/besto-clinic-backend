import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';

const MotionLink = motion.create(Link);

const variantStyles = {
  primary: 'bg-gradient-to-r from-primary-500 to-primary-600 text-white hover:from-primary-600 hover:to-primary-700 shadow-md shadow-primary-600/20 hover:shadow-lg hover:shadow-primary-600/25',
  secondary: 'bg-white text-primary-700 border border-primary-200/60 hover:border-primary-300 hover:bg-neutral-100 shadow-sm',
  ghost: 'text-primary-600 hover:bg-primary-50/60',
  dark: 'bg-neutral-900 text-white hover:bg-neutral-950',
  white: 'bg-white text-neutral-900 hover:bg-neutral-100 shadow-md shadow-black/10',
  outline: 'bg-transparent text-primary-600 border border-primary-300 hover:bg-primary-50/60',
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

export default function Button({
  children,
  variant = 'primary',
  size = 'md',
  to,
  href,
  className = '',
  ...props
}) {
  const baseClasses = `inline-flex items-center justify-center font-semibold rounded-2xl transition-all duration-300 cursor-pointer ${variantStyles[variant]} ${sizes[size]} ${className}`;

  if (to) {
    return (
      <MotionLink to={to} className={baseClasses} {...hoverMotion} {...props}>
        {children}
      </MotionLink>
    );
  }

  if (href) {
    return (
      <motion.a href={href} className={baseClasses} target="_blank" rel="noopener noreferrer" {...hoverMotion} {...props}>
        {children}
      </motion.a>
    );
  }

  return (
    <motion.button className={baseClasses} {...hoverMotion} {...props}>
      {children}
    </motion.button>
  );
}
