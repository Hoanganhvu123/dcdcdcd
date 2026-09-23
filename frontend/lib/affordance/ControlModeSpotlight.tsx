// Adapted from OpenWork (MIT) — Copyright (c) 2026 Different AI
import React from 'react';
import { useAffordanceRegistry } from './registry-provider';
import { motion, AnimatePresence } from 'framer-motion';

export const ControlModeSpotlight: React.FC = () => {
  const { busyActionId } = useAffordanceRegistry();

  return (
    <AnimatePresence>
      {busyActionId && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 10 }}
          className='fixed bottom-4 right-4 z-50 flex items-center gap-2 rounded-full border border-primary/30 bg-zinc-900/90 dark:bg-zinc-100/90 text-zinc-100 dark:text-zinc-900 px-4 py-2 text-xs font-mono shadow-lg backdrop-blur-md'
        >
          <span className='size-2 rounded-full bg-primary animate-ping' />
          <span>Remote Agent Executing: <strong>{busyActionId}</strong></span>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
