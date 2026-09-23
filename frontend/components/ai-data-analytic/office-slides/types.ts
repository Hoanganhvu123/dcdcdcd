/**
 * Slide Deck PPTX 5-Archetypes Studio Types & Contracts
 */

export const CANVAS_WIDTH = 1920;
export const CANVAS_HEIGHT = 1080;

export const springSlideTransition = {
  type: 'spring' as const,
  stiffness: 300,
  damping: 28,
};

export type SlideArchetype =
  | 'hero'          // 1. Cover Slide
  | 'bullets'       // 2. Executive Summary (Bullets)
  | 'two_col'       // 2b. Executive Summary (2-Col)
  | 'stat_grid'     // 3. 2-Column KPI Matrix / Stat Grid
  | 'bento_grid'    // 4. Framework Bento Grid
  | 'timeline'      // 5. Strategic Roadmap / Timeline
  | 'comparison'
  | 'chart'
  | 'quote'
  | 'closing'
  | string;

export interface SlideData {
  layout: SlideArchetype;
  title: string;
  subtitle?: string;
  date?: string;
  impact_stat?: string;
  bullets?: string[];
  takeaway?: string;
  stats?: Array<{ label: string; value: string; trend?: string; subLabel?: string }>;
  items?: Array<{ heading: string; body: string; tag?: string }>;
  steps?: Array<{ label: string; description: string; status?: 'completed' | 'in_progress' | 'upcoming' }>;
  themeVars?: Record<string, string>;
  left_heading?: string;
  left_bullets?: string[];
  right_heading?: string;
  right_bullets?: string[];
  quote?: string;
  attribution?: string;
  [key: string]: any;
}

export interface SlideDeckPayload {
  title: string;
  slides: SlideData[];
  themeVars?: Record<string, string>;
}
