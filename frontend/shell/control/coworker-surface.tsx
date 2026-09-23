import classNames from 'classnames';
import { AnimatePresence, motion } from 'framer-motion';
import {
  Activity,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Cpu,
  Layers,
  Power,
  Sparkles,
  Zap,
} from 'lucide-react';
import React, { useMemo, useState } from 'react';
import { useOpenworkControl } from './control-provider';

export interface CoworkerSurfaceProps {
  className?: string;
  defaultExpanded?: boolean;
}

export function CoworkerSurface({ className, defaultExpanded = false }: CoworkerSurfaceProps) {
  const control = useOpenworkControl();
  const [expanded, setExpanded] = useState(defaultExpanded);

  const enabled = control?.enabled ?? false;
  const setEnabled = control?.setEnabled;
  const narration = control?.narration ?? 'Control mode is off.';
  const busyActionId = control?.busyActionId ?? null;
  const actions = control?.actions ?? [];
  const route = control?.route ?? '/';

  const status = useMemo(() => {
    if (!enabled) return 'off';
    if (busyActionId) return 'acting';
    return 'ready';
  }, [enabled, busyActionId]);

  const activeActor = useMemo(() => {
    if (busyActionId) {
      if (busyActionId.includes('analyst') || busyActionId.includes('sql')) return 'Analyst Agent';
      if (busyActionId.includes('sheet') || busyActionId.includes('excel')) return 'Sheets Agent';
      if (busyActionId.includes('slide') || busyActionId.includes('deck')) return 'Slides Agent';
      if (busyActionId.includes('research')) return 'Research Agent';
      return 'Autonomous Controller';
    }
    return null;
  }, [busyActionId]);

  const statusConfig = {
    off: {
      label: 'Control Off',
      color: 'text-muted-foreground',
      bg: 'bg-muted/40',
      border: 'border-border/40',
      dot: 'bg-zinc-400',
    },
    ready: {
      label: 'Ready',
      color: 'text-foreground',
      bg: 'bg-muted',
      border: 'border-border',
      dot: 'bg-primary animate-pulse',
    },
    acting: {
      label: 'Acting',
      color: 'text-foreground',
      bg: 'bg-muted',
      border: 'border-border',
      dot: 'bg-primary animate-ping',
    },
  }[status];

  return (
    <div
      role="region"
      aria-label="AI Coworker Control Surface"
      className={classNames(
        'fixed bottom-5 right-5 z-[9990] flex flex-col items-end gap-2 pointer-events-none select-none font-sans',
        className,
      )}
    >
      {/* Expanded Details Drawer */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, y: 12, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.96 }}
            transition={{ type: 'spring', stiffness: 420, damping: 30 }}
            className="w-80 md:w-96 rounded-2xl border border-border/60 bg-background/90 backdrop-blur-xl shadow-2xl p-4 pointer-events-auto flex flex-col gap-3 custom-scrollbar text-foreground"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/40 pb-2.5">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-primary/10 text-primary">
                  <Bot className="w-4 h-4" />
                </div>
                <div>
                  <h4 className="text-sm font-semibold leading-none">AI Coworker Surface</h4>
                  <p className="text-xs text-muted-foreground mt-0.5">UI Control & MCP Layer</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEnabled?.(!enabled)}
                className={classNames(
                  'flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 border',
                  enabled
                    ? 'bg-primary/15 text-primary border-primary/30 hover:bg-primary/25'
                    : 'bg-muted text-muted-foreground border-border hover:bg-muted/80',
                )}
              >
                <Power className="w-3 h-3" />
                <span>{enabled ? 'Active' : 'Enable'}</span>
              </button>
            </div>

            {/* Current State Info */}
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="flex flex-col p-2 rounded-xl bg-muted/40 border border-border/30">
                <span className="text-muted-foreground text-[0.7rem] uppercase tracking-wider font-medium flex items-center gap-1">
                  <Activity className="w-3 h-3 text-primary" /> Active Route
                </span>
                <span className="font-mono text-xs font-semibold truncate mt-0.5 text-foreground" title={route}>
                  {route}
                </span>
              </div>
              <div className="flex flex-col p-2 rounded-xl bg-muted/40 border border-border/30">
                <span className="text-muted-foreground text-[0.7rem] uppercase tracking-wider font-medium flex items-center gap-1">
                  <Layers className="w-3 h-3 text-primary" /> Registered
                </span>
                <span className="text-xs font-semibold mt-0.5 text-foreground">
                  {actions.length} {actions.length === 1 ? 'Action' : 'Actions'}
                </span>
              </div>
            </div>

            {/* Active Actor Card */}
            {activeActor && (
              <div className="flex items-center gap-2.5 p-2.5 rounded-xl bg-muted border border-border text-foreground">
                <Cpu className="w-4 h-4 shrink-0 animate-pulse" />
                <div className="flex flex-col min-w-0">
                  <span className="text-[0.7rem] font-bold uppercase tracking-wider">Active Controller</span>
                  <span className="text-xs font-semibold truncate">{activeActor}</span>
                </div>
              </div>
            )}

            {/* Actions List Preview */}
            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground flex items-center gap-1">
                <Zap className="w-3 h-3 text-foreground" /> Available Affordances
              </span>
              <div className="max-h-36 overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                {actions.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-1">No actions registered on this screen.</p>
                ) : (
                  actions.map((act) => (
                    <div
                      key={act.id}
                      className={classNames(
                        'flex items-center justify-between px-2 py-1.5 rounded-lg text-xs border transition-colors',
                        act.busy
                          ? 'bg-muted border-border text-foreground font-medium'
                          : 'bg-muted/30 border-border/30 text-foreground hover:bg-muted/60',
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className="truncate font-medium">{act.label || act.id}</span>
                        <span className="text-[0.65rem] text-muted-foreground font-mono truncate">{act.id}</span>
                      </div>
                      <span
                        className={classNames(
                          'px-1.5 py-0.5 rounded text-[0.65rem] uppercase font-bold shrink-0',
                          act.kind === 'query'
                            ? 'bg-muted text-foreground'
                            : 'bg-primary/15 text-primary',
                        )}
                      >
                        {act.kind}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Main Floating Status Bar / Chip */}
      <motion.div
        layout
        transition={{ type: 'spring', stiffness: 450, damping: 32 }}
        className="flex items-center gap-2.5 px-3.5 py-2 rounded-full border border-border/60 bg-background/85 backdrop-blur-xl shadow-lg hover:shadow-xl transition-all duration-200 pointer-events-auto group cursor-pointer hover:-translate-y-0.5"
        onClick={() => setExpanded((prev) => !prev)}
      >
        {/* Pulsing Status Dot */}
        <div className="relative flex items-center justify-center">
          <span className={classNames('w-2.5 h-2.5 rounded-full', statusConfig.dot)} />
        </div>

        {/* Status Chip */}
        <span
          className={classNames(
            'px-2 py-0.5 rounded-full text-xs font-semibold border flex items-center gap-1',
            statusConfig.bg,
            statusConfig.border,
            statusConfig.color,
          )}
        >
          {status === 'acting' && <Sparkles className="w-3 h-3 animate-spin" />}
          {status === 'ready' && <CheckCircle2 className="w-3 h-3" />}
          <span>{statusConfig.label}</span>
        </span>

        {/* Active Actor Badge */}
        {activeActor && (
          <span className="hidden sm:inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary border border-primary/20">
            {activeActor}
          </span>
        )}

        {/* Live Narration */}
        <span
          className="text-xs font-medium text-foreground/90 max-w-[14rem] sm:max-w-[20rem] truncate"
          title={narration}
        >
          {narration}
        </span>

        {/* Expand / Collapse Icon */}
        <div className="text-muted-foreground group-hover:text-foreground transition-colors p-0.5">
          {expanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
        </div>
      </motion.div>
    </div>
  );
}

export default CoworkerSurface;
