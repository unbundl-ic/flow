'use client';

import { motion, useScroll, useTransform } from 'framer-motion';
import { useEffect, useState } from 'react';

export default function SubtleBackground() {
  const { scrollY } = useScroll();
  const y1 = useTransform(scrollY, [0, 1000], [0, 200]);
  const y2 = useTransform(scrollY, [0, 1000], [0, -200]);
  const [isMounted, setIsMounted] = useState(false);

  useEffect(() => {
    // Wrap in requestAnimationFrame to avoid synchronous state update in effect
    requestAnimationFrame(() => {
      setIsMounted(true);
    });
  }, []);

  if (!isMounted) return null;

  return (
    <div className="fixed inset-0 -z-10 overflow-hidden pointer-events-none bg-[#f8f9fc]">
      {/* Primary Glow */}
      <motion.div
        style={{ y: y1 }}
        animate={{
          scale: [1, 1.1, 1],
          rotate: [0, 10, 0],
        }}
        transition={{
          duration: 15,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute top-[-20%] right-[-10%] w-[800px] h-[800px] rounded-full bg-gradient-to-br from-indigo-500/10 to-purple-500/5 blur-[120px]"
      />

      {/* Secondary Glow */}
      <motion.div
        style={{ y: y2 }}
        animate={{
          scale: [1, 1.2, 1],
          x: [0, -50, 0],
        }}
        transition={{
          duration: 20,
          repeat: Infinity,
          ease: "easeInOut"
        }}
        className="absolute bottom-[-10%] left-[-10%] w-[900px] h-[900px] rounded-full bg-gradient-to-tr from-emerald-500/10 to-cyan-500/5 blur-[150px]"
      />

      {/* Interactive Floating Particles */}
      <div className="absolute inset-0 opacity-30">
        {[...Array(6)].map((_, i) => (
          <motion.div
            key={i}
            animate={{
              y: [0, -100, 0],
              x: [0, i % 2 === 0 ? 50 : -50, 0],
              opacity: [0.2, 0.5, 0.2],
            }}
            transition={{
              duration: 10 + i * 2,
              repeat: Infinity,
              delay: i * 1,
            }}
            className="absolute rounded-full bg-indigo-400/20 blur-xl"
            style={{
              width: 100 + i * 20,
              height: 100 + i * 20,
              left: `${15 + i * 15}%`,
              top: `${20 + i * 10}%`,
            }}
          />
        ))}
      </div>

      {/* Grid Overlay */}
      <div className="absolute inset-0 bg-[url('https://grainy-gradients.vercel.app/noise.svg')] opacity-20 brightness-100 contrast-150 pointer-events-none" />
    </div>
  );
}
