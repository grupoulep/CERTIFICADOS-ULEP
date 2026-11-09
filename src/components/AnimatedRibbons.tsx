import React from 'react';
import { motion } from 'motion/react';

interface AnimatedRibbonsProps {
  className?: string;
}

export const AnimatedRibbons: React.FC<AnimatedRibbonsProps> = ({ className = '' }) => {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none z-0 ${className}`}
    >
      {/* Listón 1: Diagonal amplio superior con flujo ondulado suave */}
      <motion.div
        animate={{
          x: [-40, 50, -40],
          y: [-25, 35, -25],
          rotate: [-18, -12, -18],
          scale: [1, 1.06, 1],
        }}
        transition={{
          duration: 18,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -top-36 -left-36 w-[125vw] h-44 rounded-[100px] bg-gradient-to-r from-blue-600/15 via-[#B4D9FF]/35 to-blue-500/20 blur-2xl transform origin-top-left"
      />

      {/* Listón 2: Listón estético de acento celeste y azul vibrante cruzando el centro */}
      <motion.div
        animate={{
          x: [35, -45, 35],
          y: [20, -30, 20],
          rotate: [24, 29, 24],
          scale: [0.95, 1.05, 0.95],
        }}
        transition={{
          duration: 22,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/4 -right-48 w-[130vw] h-32 rounded-[90px] bg-gradient-to-r from-blue-700/10 via-[#3B82F6]/25 to-[#B4D9FF]/30 blur-2xl transform origin-center"
      />

      {/* Listón 3: Listón inferior ondulado */}
      <motion.div
        animate={{
          x: [-30, 40, -30],
          y: [30, -25, 30],
          rotate: [-14, -8, -14],
          scale: [1.02, 0.96, 1.02],
        }}
        transition={{
          duration: 16,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute -bottom-28 -left-20 w-[120vw] h-40 rounded-[110px] bg-gradient-to-r from-[#2563EB]/15 via-[#B4D9FF]/30 to-blue-400/20 blur-2xl transform origin-bottom-left"
      />

      {/* Listón 4: Listón sutil estriado más nítido con brillo celeste ULEP */}
      <motion.div
        animate={{
          x: [20, -30, 20],
          y: [-15, 25, -15],
          rotate: [12, 16, 12],
          opacity: [0.55, 0.85, 0.55],
        }}
        transition={{
          duration: 14,
          repeat: Infinity,
          ease: 'easeInOut',
        }}
        className="absolute top-1/2 -left-40 w-[110vw] h-16 rounded-full bg-gradient-to-r from-transparent via-[#B4D9FF]/45 to-transparent blur-lg"
      />
    </div>
  );
};
