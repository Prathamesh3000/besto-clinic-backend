/**
 * Scanner Animation Library - Framer Motion variants for immersive medical scanner
 * Provides GPU-accelerated animations for all scanner states and transitions
 */

// ──────────────────────────────────────────────────────────────────────────────
// SHELL & CONTAINER ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const shellVariants = {
  hidden: {
    opacity: 0,
    scale: 0.95,
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1], // Apple easing
    }
  },
  exit: {
    opacity: 0,
    scale: 1.05,
    filter: 'blur(8px)',
    transition: { duration: 0.4 }
  }
};

export const viewportVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.8, ease: 'easeOut' }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// VOICE COACH OVERLAY ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const voiceWaveformVariants = {
  idle: {
    scaleY: 0.3,
    opacity: 0.3,
  },
  speaking: {
    scaleY: [0.3, 1, 0.6, 1, 0.4, 0.8, 0.5],
    opacity: [0.5, 1, 0.7, 1, 0.6, 0.9, 0.7],
    transition: {
      duration: 1.2,
      repeat: Infinity,
      ease: "easeInOut",
    }
  }
};

export const voiceTextVariants = {
  hidden: { opacity: 0, y: -10 },
  visible: {
    opacity: [0, 1, 1, 0],
    y: [10, 0, 0, -10],
    transition: {
      duration: 4,
      times: [0, 0.1, 0.9, 1],
      ease: 'easeInOut'
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POSITION GUIDE OVERLAY ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const silhouetteVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    rotateY: -45,
  },
  visible: {
    opacity: 1,
    scale: 1,
    rotateY: 0,
    transition: {
      type: 'spring',
      stiffness: 100,
      damping: 15,
    }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    rotateY: 45,
    transition: { duration: 0.3 }
  }
};

export const angleMeterVariants = {
  pulse: {
    scale: [1, 1.1, 1],
    opacity: [0.6, 1, 0.6],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// COUNTDOWN OVERLAY ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const countdownRingVariants = {
  hidden: { scale: 0, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    }
  },
  exit: {
    scale: 1.2,
    opacity: 0,
    transition: { duration: 0.3 }
  }
};

export const countdownNumberVariants = {
  enter: {
    scale: [0.5, 1.2, 1],
    opacity: [0, 1, 1],
    transition: { duration: 0.4, ease: 'easeOut' }
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    y: -20,
    transition: { duration: 0.2 }
  }
};

// Alias for components using hidden/visible/exit pattern
export const countdownVariants = {
  hidden: { scale: 0.5, opacity: 0 },
  visible: {
    scale: [0.5, 1.2, 1],
    opacity: [0, 1, 1],
    transition: { duration: 0.4, ease: 'easeOut' }
  },
  exit: {
    scale: 0.8,
    opacity: 0,
    y: -20,
    transition: { duration: 0.2 }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// CAPTURE EFFECTS ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const captureFlashVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: [0, 1, 0],
    scale: [0.95, 1.05, 1],
    transition: {
      duration: 0.6,
      ease: [0.25, 0.1, 0.25, 1],
      times: [0, 0.3, 1]
    }
  }
};

export const successCheckmarkVariants = {
  hidden: {
    scale: 0,
    rotate: -180,
    opacity: 0
  },
  visible: {
    scale: [0, 1.2, 1],
    rotate: [180, 0, 0],
    opacity: [0, 1, 1],
    transition: {
      type: 'spring',
      stiffness: 300,
      damping: 15,
    }
  }
};

export const toothCountBadgeVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.8
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      delay: 0.3,
      type: 'spring',
      stiffness: 200,
      damping: 20,
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// VALIDATION FEEDBACK ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const validationSuccessVariants = {
  idle: {
    boxShadow: '0 0 0 0 rgba(16, 185, 129, 0)',
  },
  pulse: {
    boxShadow: [
      '0 0 0 0 rgba(16, 185, 129, 0.4)',
      '0 0 0 20px rgba(16, 185, 129, 0)',
      '0 0 0 0 rgba(16, 185, 129, 0)',
    ],
    transition: {
      duration: 1.5,
      repeat: Infinity,
      ease: 'easeOut'
    }
  }
};

export const validationWarningVariants = {
  shake: {
    x: [-10, 10, -10, 10, 0],
    transition: { duration: 0.4 }
  }
};

export const feedbackPillVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 150,
      damping: 20,
    }
  },
  exit: {
    opacity: 0,
    y: 10,
    transition: { duration: 0.2 }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// POSITION TRANSITION ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const transitionWipeVariants = {
  enter: {
    scaleX: [0, 1],
    originX: 0,
    transition: { duration: 0.4, ease: 'easeInOut' }
  },
  exit: {
    scaleX: [1, 0],
    originX: 1,
    transition: { duration: 0.4, ease: 'easeInOut' }
  }
};

export const transitionMessageVariants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    }
  },
  exit: {
    opacity: 0,
    scale: 0.8,
    transition: { duration: 0.2 }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// CELEBRATION ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const celebrationContainerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { duration: 0.3 }
  },
  exit: {
    opacity: 0,
    transition: { duration: 0.4, delay: 2 }
  }
};

export const confettiVariants = {
  initial: (i) => ({
    y: -100,
    x: (Math.random() - 0.5) * 200,
    opacity: 0,
    rotate: 0,
    scale: 0.5 + Math.random() * 0.5,
  }),
  animate: (i) => ({
    y: window.innerHeight + 100,
    x: (Math.random() - 0.5) * 400,
    opacity: [0, 1, 1, 0],
    rotate: 360 * (i % 2 ? 1 : -1) * (1 + Math.random()),
    transition: {
      duration: 2 + Math.random() * 1,
      delay: i * 0.05,
      ease: 'easeOut',
      times: [0, 0.1, 0.9, 1]
    }
  })
};

export const completionMessageVariants = {
  hidden: {
    opacity: 0,
    scale: 0.8,
    y: 20,
  },
  visible: {
    opacity: 1,
    scale: 1,
    y: 0,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
      delay: 0.3,
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// PROGRESS TRACKER ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

// Progress tracker container
export const progressTrackerVariants = {
  hidden: {
    opacity: 0,
    y: 20,
    scale: 0.95
  },
  visible: {
    opacity: 1,
    y: 0,
    scale: 1,
    transition: {
      duration: 0.4,
      ease: 'easeOut'
    }
  },
  exit: {
    opacity: 0,
    y: 20,
    scale: 0.95,
    transition: { duration: 0.3 }
  }
};

export const progressDotVariants = {
  pending: {
    scale: 1,
    opacity: 0.3,
  },
  active: {
    scale: [1, 1.3, 1],
    opacity: 1,
    transition: {
      scale: {
        duration: 0.6,
        repeat: Infinity,
        repeatType: 'reverse',
        ease: 'easeInOut'
      }
    }
  },
  complete: {
    scale: 1,
    opacity: 1,
  }
};

export const progressLineVariants = {
  incomplete: {
    scaleX: 0,
    opacity: 0.3,
  },
  filling: {
    scaleX: 1,
    opacity: 1,
    transition: {
      duration: 0.6,
      ease: 'easeInOut'
    }
  },
  complete: {
    scaleX: 1,
    opacity: 1,
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// SCANNING STATE OVERLAYS
// ──────────────────────────────────────────────────────────────────────────────

export const scanningPulseVariants = {
  pulse: {
    opacity: [0.2, 0.5, 0.2],
    scale: [1, 1.02, 1],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'easeInOut'
    }
  }
};

export const scanLineVariants = {
  animate: {
    y: ['-100%', '200%'],
    transition: {
      duration: 2,
      repeat: Infinity,
      ease: 'linear',
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// ONBOARDING SCREEN ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const splashVariants = {
  hidden: { opacity: 0, scale: 0.9 },
  visible: {
    opacity: 1,
    scale: 1,
    transition: { duration: 0.6, ease: 'easeOut' }
  },
  exit: {
    opacity: 0,
    scale: 1.1,
    transition: { duration: 0.4 }
  }
};

export const positionPreviewVariants = {
  initial: (i) => ({
    opacity: 0,
    x: i * 50,
    scale: 0.8,
  }),
  animate: (i) => ({
    opacity: [0, 1, 1, 0.3],
    x: [i * 50, 0, 0, 0],
    scale: [0.8, 1, 1, 0.9],
    transition: {
      duration: 1.2,
      delay: i * 0.3,
      times: [0, 0.2, 0.8, 1],
      ease: 'easeOut'
    }
  })
};

export const consentButtonVariants = {
  idle: {
    scale: 1,
    boxShadow: '0 4px 14px 0 rgba(0, 229, 255, 0.2)',
  },
  hover: {
    scale: 1.05,
    boxShadow: '0 6px 20px 0 rgba(0, 229, 255, 0.4)',
    transition: { duration: 0.2 }
  },
  tap: {
    scale: 0.95,
    transition: { duration: 0.1 }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// UTILITY ANIMATIONS
// ──────────────────────────────────────────────────────────────────────────────

export const fadeInOut = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { duration: 0.3 } },
  exit: { opacity: 0, transition: { duration: 0.2 } }
};

export const slideUp = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 150,
      damping: 20,
    }
  }
};

export const scaleIn = {
  hidden: { scale: 0.8, opacity: 0 },
  visible: {
    scale: 1,
    opacity: 1,
    transition: {
      type: 'spring',
      stiffness: 200,
      damping: 20,
    }
  }
};

// ──────────────────────────────────────────────────────────────────────────────
// CUSTOM SPRING CONFIGS
// ──────────────────────────────────────────────────────────────────────────────

export const springConfigs = {
  gentle: { stiffness: 100, damping: 15 },
  snappy: { stiffness: 200, damping: 20 },
  bouncy: { stiffness: 300, damping: 15 },
  smooth: { stiffness: 150, damping: 25 },
};

// ──────────────────────────────────────────────────────────────────────────────
// CUSTOM EASING CURVES
// ──────────────────────────────────────────────────────────────────────────────

export const easings = {
  apple: [0.25, 0.1, 0.25, 1],
  ios: [0.36, 0.66, 0.04, 1],
  material: [0.4, 0.0, 0.2, 1],
  smooth: [0.25, 0.46, 0.45, 0.94],
};
