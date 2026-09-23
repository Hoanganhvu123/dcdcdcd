import React, { useMemo, CSSProperties } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { SlideCanvas } from './SlideCanvas';
import type { SlideData, SlideArchetype } from './types';

export interface SlideProps {
  slide: SlideData;
  themeVars?: Record<string, string>;
}

// ── SHARED CLEAN CARD ──────────────────────────────────────────────────
const CleanCard: React.FC<{
  children: React.ReactNode;
  className?: string;
  innerClassName?: string;
}> = ({ children, className = '', innerClassName = '' }) => (
  <div
    className={`rounded-[1.25rem] border border-white/10 dark:border-white/10 bg-white/5 dark:bg-zinc-900/60 shadow-lg backdrop-blur-md ${className}`}
  >
    <div className={`w-full h-full p-[3.5rem] ${innerClassName}`}>{children}</div>
  </div>
);

// ── ANIMATION PRESETS (Framer Motion Spring Physics: stiffness 300, damping 28) ──
export const springSlideTransition = {
  type: 'spring',
  stiffness: 300,
  damping: 28,
};

const easeCustom = [0.16, 1, 0.3, 1];

export const fadeUp = {
  hidden: { opacity: 0, y: 30 },
  visible: { opacity: 1, y: 0, transition: springSlideTransition },
};

export const fadeRight = {
  hidden: { opacity: 0, x: -30 },
  visible: { opacity: 1, x: 0, transition: springSlideTransition },
};

export const containerStagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.08, delayChildren: 0.05 },
  },
};

// ── 1. HERO SLIDE (Cover Slide) ──────────────────────────────────────────
export const HeroSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center h-full w-full p-[7.5rem] text-center bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)] relative overflow-hidden"
    >
      {slide.date && (
        <motion.div
          variants={fadeUp}
          className="mb-[2.5rem] px-[1.75rem] py-[0.75rem] rounded-[0.75rem] text-[1.5rem] font-semibold text-[var(--osd-accent,#fafafa)] uppercase tracking-[0.2em] border border-white/10 backdrop-blur-sm"
        >
          {slide.date}
        </motion.div>
      )}

      <motion.h1
        variants={fadeUp}
        className="text-[7.5rem] font-extrabold mb-[2.5rem] tracking-tight leading-[1.08] max-w-[90rem]"
      >
        {slide.title || 'Executive Presentation'}
      </motion.h1>

      {slide.subtitle && (
        <motion.p
          variants={fadeUp}
          className="text-[3rem] font-normal text-zinc-400 max-w-[75rem] leading-relaxed"
        >
          {slide.subtitle}
        </motion.p>
      )}

      {slide.impact_stat && (
        <motion.div
          variants={fadeUp}
          className="mt-[4.5rem] pt-[2rem] border-t border-white/10 w-[30rem] mx-auto text-center"
        >
          <span className="text-[5.5rem] font-heading font-bold text-[var(--osd-accent,#fafafa)] block tracking-tight">
            {slide.impact_stat}
          </span>
        </motion.div>
      )}
    </motion.div>
  );
};

// ── 2. BULLETS SLIDE (Executive Summary Bullets) ─────────────────────────
export const BulletsSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)] relative">
      <motion.div
        initial={{ scaleX: 0 }}
        animate={{ scaleX: 1 }}
        transition={springSlideTransition}
        className="w-[4.5rem] h-[0.35rem] bg-[var(--osd-accent,#fafafa)] rounded-full mb-[2.5rem] origin-left"
      />

      <motion.h2
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[4rem] tracking-tight"
      >
        {slide.title || 'Key Insights & Hypotheses'}
      </motion.h2>

      <motion.ul
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center gap-[2.25rem] max-w-[85rem]"
      >
        {slide.bullets?.map((bullet, i) => (
          <motion.li
            key={i}
            variants={fadeRight}
            className="flex items-start gap-[2rem] p-[1.75rem] rounded-[1.25rem] bg-white/5 border border-white/10 backdrop-blur-sm"
          >
            <div className="mt-[1rem] w-[1rem] h-[1rem] rounded-full bg-[var(--osd-accent,#fafafa)] shrink-0" />
            <span className="text-[2.5rem] text-zinc-200 leading-relaxed font-normal">{bullet}</span>
          </motion.li>
        ))}
      </motion.ul>

      {slide.takeaway && (
        <div className="mt-[2.5rem] pt-[2rem] border-t border-white/10 flex items-center justify-between text-[1.75rem] text-zinc-400">
          <div>
            <span className="text-[var(--osd-accent,#fafafa)] font-bold uppercase tracking-wider mr-[1rem]">
              Takeaway:
            </span>
            <span>{slide.takeaway}</span>
          </div>
        </div>
      )}
    </div>
  );
};

// ── 2b. TWO COLUMN SLIDE (Executive Summary 2-Col) ───────────────────────
export const TwoColSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
      <motion.h2
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[4.5rem] tracking-tight text-center"
      >
        {slide.title || 'Comparative Overview'}
      </motion.h2>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="flex-1 grid grid-cols-2 gap-[5rem] relative"
      >
        <div className="absolute top-0 bottom-0 left-1/2 -translate-x-1/2 w-[0.125rem] bg-white/10" />

        {/* Left Column */}
        <div className="h-full flex flex-col justify-center px-[2.5rem]">
          {slide.left_heading && (
            <motion.h3
              variants={fadeUp}
              className="text-[3.25rem] font-bold mb-[2.5rem] text-[var(--osd-accent,#fafafa)] tracking-tight"
            >
              {slide.left_heading}
            </motion.h3>
          )}
          <ul className="flex flex-col gap-[2rem]">
            {slide.left_bullets?.map((b, i) => (
              <motion.li
                variants={fadeUp}
                key={i}
                className="flex items-start gap-[1.5rem] text-[2.25rem] text-zinc-300 leading-relaxed"
              >
                <span className="text-zinc-500 font-mono text-[1.75rem] mt-[0.25rem]">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <span>{b}</span>
              </motion.li>
            ))}
          </ul>
        </div>

        {/* Right Column */}
        <div className="h-full flex flex-col justify-center px-[2.5rem]">
          {slide.right_heading && (
            <motion.h3
              variants={fadeUp}
              className="text-[3.25rem] font-bold mb-[2.5rem] text-[var(--osd-accent,#fafafa)] tracking-tight"
            >
              {slide.right_heading}
            </motion.h3>
          )}
          <ul className="flex flex-col gap-[2rem]">
            {slide.right_bullets?.map((b, i) => (
              <motion.li
                variants={fadeUp}
                key={i}
                className="flex items-start gap-[1.5rem] text-[2.25rem] text-zinc-300 leading-relaxed"
              >
                <span className="text-zinc-500 font-mono text-[1.75rem] mt-[0.25rem]">
                  {(i + 1).toString().padStart(2, '0')}
                </span>
                <span>{b}</span>
              </motion.li>
            ))}
          </ul>
        </div>
      </motion.div>
    </div>
  );
};

// ── 3. STAT GRID SLIDE (2-Column / 3-Column KPI Matrix) ──────────────────
export const StatGridSlide: React.FC<SlideProps> = ({ slide }) => {
  const stats = slide.stats || [];
  const colClass = stats.length <= 2 ? 'grid-cols-2' : stats.length === 4 ? 'grid-cols-2' : 'grid-cols-3';

  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
      <motion.h2
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[4.5rem] tracking-tight text-center"
      >
        {slide.title || 'Key Performance Indicators'}
      </motion.h2>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className={`flex-1 grid ${colClass} gap-[3rem]`}
      >
        {stats.map((stat, i) => (
          <motion.div key={i} variants={fadeUp} className="h-full">
            <div className="h-full p-[3rem] rounded-[1.5rem] bg-white/5 border border-white/10 flex flex-col items-center justify-center text-center shadow-lg hover:border-white/20 transition-colors">
              <span className="text-[1.75rem] font-semibold text-zinc-400 tracking-wider uppercase mb-[1.5rem]">
                {stat.label}
              </span>
              <span className="text-[6rem] font-heading font-bold text-[var(--osd-accent,#fafafa)] tracking-tight mb-[1rem]">
                {stat.value}
              </span>
              {stat.trend && (
                <span
                  className={`text-[1.5rem] font-mono px-[1.25rem] py-[0.5rem] rounded-full border ${
                    stat.trend.startsWith('+')
                      ? 'border-emerald-500/30 text-emerald-400 bg-emerald-500/10'
                      : 'border-rose-500/30 text-rose-400 bg-rose-500/10'
                  }`}
                >
                  {stat.trend}
                </span>
              )}
            </div>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

// ── 4. BENTO GRID SLIDE (Framework Bento Grid) ───────────────────────────
export const BentoGridSlide: React.FC<SlideProps> = ({ slide }) => {
  const items = slide.items || [];
  const getGridClass = () => {
    if (items.length <= 2) return 'grid-cols-2';
    if (items.length === 4) return 'grid-cols-2';
    return 'grid-cols-3';
  };

  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
      <motion.h2
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[3.5rem] tracking-tight"
      >
        {slide.title || 'Platform Architecture & Pillars'}
      </motion.h2>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className={`flex-1 grid ${getGridClass()} gap-[2rem] auto-rows-fr`}
      >
        {items.map((item, i) => (
          <motion.div key={i} variants={fadeUp}>
            <CleanCard className="h-full hover:border-white/20 transition-colors" innerClassName="p-[2.5rem] flex flex-col justify-center">
              {item.tag && (
                <span className="text-[1.25rem] font-mono uppercase px-[1rem] py-[0.25rem] rounded bg-white/10 text-zinc-300 w-fit mb-[1rem]">
                  {item.tag}
                </span>
              )}
              <h4 className="text-[2.5rem] font-bold text-zinc-100 tracking-tight mb-[1rem]">
                {item.heading}
              </h4>
              <p className="text-[1.75rem] text-zinc-400 leading-relaxed">{item.body}</p>
            </CleanCard>
          </motion.div>
        ))}
      </motion.div>
    </div>
  );
};

// ── 5. TIMELINE SLIDE (Strategic Roadmap) ────────────────────────────────
export const TimelineSlide: React.FC<SlideProps> = ({ slide }) => {
  const steps = slide.steps || [];
  const colCount = Math.max(steps.length, 1);

  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
      <motion.h2
        initial={{ opacity: 0, y: 25 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[7rem] tracking-tight"
      >
        {slide.title || 'Project Milestones & Strategic Roadmap'}
      </motion.h2>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="flex-1 flex flex-col justify-center"
      >
        {/* Connector Line */}
        <div className="relative w-full mb-[3.5rem]">
          <motion.div
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ duration: 1, ease: easeCustom }}
            className="h-[0.25rem] bg-white/20 w-full origin-left"
          />
          {/* Step markers */}
          <div
            className="absolute top-0 left-0 right-0 -translate-y-1/2"
            style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          >
            {steps.map((_, i) => (
              <motion.div key={i} variants={fadeUp} className="flex justify-center">
                <div className="w-[1.5rem] h-[1.5rem] rounded-full bg-[var(--osd-bg,#09090b)] border-[0.35rem] border-[var(--osd-accent,#fafafa)]" />
              </motion.div>
            ))}
          </div>
        </div>

        {/* Labels Grid */}
        <div
          style={{ display: 'grid', gridTemplateColumns: `repeat(${colCount}, 1fr)` }}
          className="gap-[2.5rem]"
        >
          {steps.map((step, i) => (
            <motion.div key={i} variants={fadeUp} className="text-center flex flex-col items-center">
              <h4 className="text-[2.25rem] font-bold text-zinc-100 tracking-tight mb-[1rem]">
                {step.label}
              </h4>
              <p className="text-[1.75rem] text-zinc-400 leading-relaxed max-w-[22rem]">
                {step.description}
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>
    </div>
  );
};

// ── EXTRA CANONICAL ARCHETYPES (Comparison, Chart, Quote, Closing) ───────
export const ComparisonSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)] relative overflow-hidden">
      <motion.h2
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={springSlideTransition}
        className="text-[5.5rem] font-bold mb-[4.5rem] tracking-tight text-center relative z-10"
      >
        {slide.title || 'Before vs After Comparison'}
      </motion.h2>

      <motion.div
        variants={containerStagger}
        initial="hidden"
        animate="visible"
        className="flex-1 grid grid-cols-2 gap-[3.5rem] relative z-10"
      >
        <CleanCard className="border-zinc-800 bg-zinc-950/40" innerClassName="flex flex-col">
          <motion.h3
            variants={fadeUp}
            className="text-[3rem] font-bold mb-[2.5rem] text-zinc-300 text-center tracking-tight border-b border-zinc-800 pb-[1.5rem]"
          >
            {slide.left_heading || 'Current State'}
          </motion.h3>
          <ul className="flex flex-col gap-[2rem]">
            {slide.left_bullets?.map((b, i) => (
              <motion.li
                variants={fadeUp}
                key={i}
                className="flex items-start gap-[1.5rem] text-[2.25rem] text-zinc-300 leading-relaxed"
              >
                <span className="text-zinc-400 font-mono">✕</span>
                <span>{b}</span>
              </motion.li>
            ))}
          </ul>
        </CleanCard>

        <CleanCard className="border-zinc-700 bg-zinc-900/60" innerClassName="flex flex-col">
          <motion.h3
            variants={fadeUp}
            className="text-[3rem] font-bold mb-[2.5rem] text-zinc-200 text-center tracking-tight border-b border-zinc-700 pb-[1.5rem]"
          >
            {slide.right_heading || 'Target State with AI'}
          </motion.h3>
          <ul className="flex flex-col gap-[2rem]">
            {slide.right_bullets?.map((b, i) => (
              <motion.li
                variants={fadeUp}
                key={i}
                className="flex items-start gap-[1.5rem] text-[2.25rem] text-zinc-200 leading-relaxed font-medium"
              >
                <span className="text-zinc-200 font-mono">✓</span>
                <span>{b}</span>
              </motion.li>
            ))}
          </ul>
        </CleanCard>
      </motion.div>
    </div>
  );
};

export const ChartSlide: React.FC<SlideProps> = ({ slide }) => {
  const insight = slide.insight_text || slide.insight || slide.takeaway;

  // Extract or normalize chart series and categories
  const chartModel = useMemo(() => {
    let categories: string[] = [];
    let series: Array<{ name: string; values: number[]; color?: string }> = [];

    if (Array.isArray(slide.categories) && Array.isArray(slide.series) && slide.categories.length > 0) {
      categories = slide.categories;
      series = slide.series;
    } else if (slide.chart && Array.isArray(slide.chart.categories) && Array.isArray(slide.chart.series)) {
      categories = slide.chart.categories;
      series = slide.chart.series;
    } else if (Array.isArray(slide.data) && slide.data.length > 0) {
      const keys = Object.keys(slide.data[0] || {});
      const xKey = keys.find((k) => ['period', 'month', 'quarter', 'name', 'category', 'label'].includes(k.toLowerCase())) || keys[0] || 'label';
      const numKeys = keys.filter((k) => k !== xKey && slide.data.some((r: any) => !isNaN(Number(r[k]))));
      categories = slide.data.map((r: any) => String(r[xKey] || ''));
      series = numKeys.map((k) => ({
        name: k,
        values: slide.data.map((r: any) => Number(r[k]) || 0),
      }));
    } else if (Array.isArray(slide.stats) && slide.stats.length > 0) {
      categories = slide.stats.map((s) => s.label);
      const values = slide.stats.map((s) => {
        const num = parseFloat(String(s.value).replace(/[^0-9.-]+/g, ''));
        return isNaN(num) ? 50 : num;
      });
      series = [{ name: 'Chỉ số', values }];
    } else {
      // Default Executive Revenue & Profit breakdown if no explicit data
      categories = ['Q1/2026', 'Q2/2026', 'Q3/2026', 'Q4/2026 (Est)'];
      series = [
        { name: 'Doanh Thu Thuần ($M)', values: [2.10, 2.28, 2.45, 2.60], color: '#3b82f6' },
        { name: 'Lợi Nhuận Gộp ($M)', values: [0.65, 0.76, 0.83, 0.90], color: '#10b981' },
      ];
    }

    const flatValues = series.flatMap((s) => s.values);
    const maxVal = Math.max(1, ...flatValues);

    return { categories, series, maxVal };
  }, [slide]);

  const palette = ['#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'];

  return (
    <div className="flex flex-col h-full w-full p-[7.5rem] bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
      <div className="flex items-end justify-between mb-[2.5rem]">
        <motion.h2
          initial={{ opacity: 0, x: -30 }}
          animate={{ opacity: 1, x: 0 }}
          transition={springSlideTransition}
          className="text-[5.5rem] font-bold tracking-tight max-w-[75rem]"
        >
          {slide.title || 'Data Analysis & Revenue Breakdown'}
        </motion.h2>

        {slide.subtitle && (
          <span className="text-[2.25rem] text-zinc-400 font-medium">
            {slide.subtitle}
          </span>
        )}
      </div>

      {insight && (
        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.15, duration: 0.7 }}
          className="text-[2.5rem] text-zinc-400 mb-[2.5rem] max-w-[85rem] leading-relaxed"
        >
          {insight}
        </motion.p>
      )}

      {/* Top Stat Pills if stats present */}
      {Array.isArray(slide.stats) && slide.stats.length > 0 && (
        <div className="grid grid-cols-3 gap-[2rem] mb-[2.5rem]">
          {slide.stats.slice(0, 3).map((st, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-[1rem] border border-white/10 bg-white/5 px-[2.5rem] py-[1.5rem]"
            >
              <span className="text-[2rem] text-zinc-400">{st.label}</span>
              <span className="text-[2.5rem] font-bold text-white font-mono">{st.value}</span>
            </div>
          ))}
        </div>
      )}

      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={springSlideTransition}
        className="flex-1 w-full"
      >
        <CleanCard
          className="h-full border-white/10"
          innerClassName="flex flex-col justify-between relative overflow-hidden bg-white/5 p-[3rem]"
        >
          {/* Legend Header */}
          <div className="flex items-center justify-between mb-[2rem]">
            <div className="flex items-center gap-[2.5rem]">
              {chartModel.series.map((s, idx) => {
                const color = s.color || palette[idx % palette.length];
                return (
                  <div key={s.name} className="flex items-center gap-[1rem]">
                    <span
                      className="w-[1.5rem] h-[1.5rem] rounded-full shadow-xs"
                      style={{ backgroundColor: color }}
                    />
                    <span className="text-[2rem] font-medium text-zinc-300 font-mono">{s.name}</span>
                  </div>
                );
              })}
            </div>
            <span className="text-[1.75rem] font-mono text-zinc-500 uppercase tracking-wider">
              {slide.chart?.type ? `Type: ${slide.chart.type}` : 'Visual Model'}
            </span>
          </div>

          {/* SVG Grouped Bar / Trend Chart Canvas */}
          <div className="flex-1 w-full flex items-end justify-around gap-[2rem] pt-[2rem] pb-[1rem] border-b border-white/10 relative">
            {/* Background horizontal grid lines */}
            <div className="absolute inset-0 flex flex-col justify-between pointer-events-none opacity-20">
              <div className="w-full border-b border-white/40" />
              <div className="w-full border-b border-white/30" />
              <div className="w-full border-b border-white/30" />
              <div className="w-full border-b border-white/40" />
            </div>

            {chartModel.categories.map((cat, cIdx) => (
              <div key={cat} className="flex-1 flex flex-col items-center h-full justify-end relative z-10">
                <div className="w-full flex items-end justify-center gap-[1rem] h-[80%]">
                  {chartModel.series.map((s, sIdx) => {
                    const val = s.values[cIdx] ?? 0;
                    const heightPct = Math.max(8, Math.min(100, (val / chartModel.maxVal) * 100));
                    const color = s.color || palette[sIdx % palette.length];

                    return (
                      <div
                        key={s.name}
                        className="flex flex-col items-center justify-end h-full flex-1 max-w-[5rem]"
                      >
                        <span className="text-[1.5rem] font-mono text-zinc-300 font-semibold mb-[0.5rem]">
                          {typeof val === 'number' && val >= 1000 ? val.toLocaleString() : val}
                        </span>
                        <motion.div
                          initial={{ height: 0 }}
                          animate={{ height: `${heightPct}%` }}
                          transition={{ delay: 0.2 + cIdx * 0.1 + sIdx * 0.05, duration: 0.6, ease: 'easeOut' }}
                          className="w-full rounded-t-[0.75rem] shadow-lg"
                          style={{
                            backgroundColor: color,
                            backgroundImage: `linear-gradient(to top, ${color}cc, ${color})`,
                          }}
                        />
                      </div>
                    );
                  })}
                </div>
                <span className="text-[2rem] font-medium text-zinc-300 font-mono mt-[1.5rem] tracking-wide text-center">
                  {cat}
                </span>
              </div>
            ))}
          </div>
        </CleanCard>
      </motion.div>
    </div>
  );
};

export const QuoteSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center h-full w-full p-[7.5rem] text-center bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]"
    >
      {slide.title && (
        <motion.h2
          variants={fadeUp}
          className="text-[3.25rem] font-semibold mb-[5rem] text-zinc-400 tracking-tight"
        >
          {slide.title}
        </motion.h2>
      )}

      <motion.div variants={fadeUp} className="w-full max-w-[85rem] relative">
        <blockquote className="text-[4.5rem] italic font-medium text-zinc-100 leading-relaxed max-w-[75rem] mx-auto">
          {slide.quote || 'Transforming complex data into decisive business execution.'}
        </blockquote>
        {slide.attribution && (
          <p className="mt-[3rem] text-[2rem] font-semibold text-[var(--osd-accent,#fafafa)] uppercase tracking-[0.1em]">
            — {slide.attribution}
          </p>
        )}
      </motion.div>
    </motion.div>
  );
};

export const ClosingSlide: React.FC<SlideProps> = ({ slide }) => {
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center h-full w-full p-[7.5rem] text-center bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]"
    >
      <motion.h2
        variants={fadeUp}
        className="text-[8.5rem] font-extrabold mb-[3rem] tracking-tight leading-tight max-w-[90rem]"
      >
        {slide.title || 'Thank You'}
      </motion.h2>
      {slide.cta && (
        <motion.p
          variants={fadeUp}
          className="text-[3.25rem] font-normal text-zinc-400 max-w-[80rem] leading-relaxed mb-[4.5rem]"
        >
          {slide.cta}
        </motion.p>
      )}
    </motion.div>
  );
};

// ── 6. COLOPHON DIVISION SLIDE (Dark Ground + Gold Ghost Numerals) ───────
export const ColophonSlide: React.FC<SlideProps> = ({ slide }) => {
  const numeral = (slide as any).numeral || slide.impact_stat || '01';
  return (
    <motion.div
      variants={containerStagger}
      initial="hidden"
      animate="visible"
      className="flex flex-col items-center justify-center h-full w-full p-[7.5rem] text-center bg-[#011627] text-white relative overflow-hidden font-serif select-none"
    >
      {/* Background Gold Ghost Numeral in Cormorant Garamond */}
      <div className="absolute right-12 bottom-0 text-[18rem] font-heading font-bold text-[var(--color-accent,#b68235)] opacity-10 pointer-events-none select-none leading-none">
        {numeral}
      </div>

      <motion.div
        variants={fadeUp}
        className="mb-[2.5rem] px-[2rem] py-[0.75rem] rounded-full text-[1.5rem] font-medium text-[var(--color-accent-200,#ffe3bf)] border border-[var(--color-accent,#b68235)]/40 tracking-[0.2em] uppercase"
      >
        {slide.subtitle || 'Phân Mục Báo Cáo'}
      </motion.div>

      <motion.h1
        variants={fadeUp}
        className="text-[7rem] font-heading font-bold mb-[2.5rem] text-white tracking-tight leading-[1.1] max-w-[90rem]"
      >
        {slide.title || 'Mục Lục & Tổng Quan Chiến Lược'}
      </motion.h1>

      {slide.takeaway && (
        <motion.p
          variants={fadeUp}
          className="text-[2.75rem] font-serif italic text-zinc-300 max-w-[75rem] leading-relaxed"
        >
          {slide.takeaway}
        </motion.p>
      )}
    </motion.div>
  );
};

// ── SLIDE RENDERER MAIN COMPONENT ──────────────────────────────────────
export interface SlideRendererProps {
  slide?: SlideData;
  slides?: SlideData[];
  currentIndex?: number;
  themeVars?: Record<string, string>;
  wrapInCanvas?: boolean;
  className?: string;
}

export const SlideRenderer: React.FC<SlideRendererProps> = React.memo(({
  slide: directSlide,
  slides,
  currentIndex = 0,
  themeVars,
  wrapInCanvas = true,
  className = '',
}) => {
  const currentSlide: SlideData | undefined = useMemo(() => {
    if (directSlide) return directSlide;
    if (slides && Array.isArray(slides) && slides.length > 0) {
      return slides[currentIndex] || slides[0];
    }
    return undefined;
  }, [directSlide, slides, currentIndex]);

  const defaultVars: Record<string, string> = useMemo(
    () => ({
      '--osd-bg': '#17161a',
      '--osd-text': '#f2f0ee',
      '--osd-accent': 'var(--color-accent, #b68235)',
      '--osd-muted': '#a09b98',
      '--osd-border': '#322f38',
      ...(themeVars || {}),
    }),
    [themeVars]
  );

  const renderLayout = (s: SlideData) => {
    const layout = (s.layout || 'bullets').toLowerCase();
    switch (layout) {
      case 'colophon':
      case 'section':
        return <ColophonSlide slide={s} themeVars={defaultVars} key="colophon" />;
      case 'hero':
        return <HeroSlide slide={s} themeVars={defaultVars} key="hero" />;
      case 'two_col':
        return <TwoColSlide slide={s} themeVars={defaultVars} key="two_col" />;
      case 'comparison':
        return <ComparisonSlide slide={s} themeVars={defaultVars} key="comparison" />;
      case 'chart':
        return <ChartSlide slide={s} themeVars={defaultVars} key="chart" />;
      case 'stat_grid':
        return <StatGridSlide slide={s} themeVars={defaultVars} key="stat_grid" />;
      case 'closing':
        return <ClosingSlide slide={s} themeVars={defaultVars} key="closing" />;
      case 'quote':
        return <QuoteSlide slide={s} themeVars={defaultVars} key="quote" />;
      case 'timeline':
        return <TimelineSlide slide={s} themeVars={defaultVars} key="timeline" />;
      case 'bento_grid':
        return <BentoGridSlide slide={s} themeVars={defaultVars} key="bento_grid" />;
      case 'bullets':
      default:
        return <BulletsSlide slide={s} themeVars={defaultVars} key="bullets" />;
    }
  };

  if (!currentSlide) {
    const emptyContent = (
      <div className="w-full h-full flex items-center justify-center bg-[var(--osd-bg,#09090b)] text-[var(--osd-text,#f8fafc)]">
        <span className="text-[2rem] font-mono tracking-[0.2em] text-zinc-500 uppercase">
          Chưa có dữ liệu Slide
        </span>
      </div>
    );

    return wrapInCanvas ? (
      <SlideCanvas flat themeVars={defaultVars} className={className}>
        {emptyContent}
      </SlideCanvas>
    ) : (
      <div className={`w-full h-full relative overflow-hidden ${className}`} style={defaultVars as CSSProperties}>
        {emptyContent}
      </div>
    );
  }

  const slideContent = (
    <AnimatePresence mode="wait">
      <motion.div
        key={`slide-${currentIndex}-${currentSlide.layout || 'default'}-${currentSlide.title || ''}`}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={springSlideTransition}
        className="absolute inset-0 w-full h-full"
      >
        {renderLayout(currentSlide)}
      </motion.div>
    </AnimatePresence>
  );

  return (
    <div className={`w-full h-full relative overflow-hidden ${className}`} style={defaultVars as CSSProperties}>
      {wrapInCanvas ? (
        <SlideCanvas flat themeVars={defaultVars}>
          {slideContent}
        </SlideCanvas>
      ) : (
        slideContent
      )}
    </div>
  );
});

export default SlideRenderer;
