import type { SlideData } from '@/components/ai-data-analytic/office-slides/types';

export interface DeckSource {
  name?: string;
  title?: string;
  content?: any;
  slides?: any[];
  [key: string]: any;
}

/**
 * Coerce whatever the agent attached to a slide artifact into `SlideData[]`.
 * The payload arrives in half a dozen shapes (top-level `slides`, a bare
 * array, `content.deck_data.slides`, a JSON string, a single slide object),
 * so every consumer has to go through here. Returns `[]` when nothing usable
 * is present — callers render an empty state on that.
 */
export function normalizeDeck(artifact?: DeckSource | null): SlideData[] {
  if (!artifact) return [];

  let rawList: any[] | null = null;

  if (Array.isArray(artifact.slides) && artifact.slides.length > 0) {
    rawList = artifact.slides;
  } else if (Array.isArray(artifact.content) && artifact.content.length > 0) {
    rawList = artifact.content;
  } else if (artifact.content && typeof artifact.content === 'object') {
    const c = artifact.content;
    if (Array.isArray(c.slides) && c.slides.length > 0) {
      rawList = c.slides;
    } else if (Array.isArray(c.deckData) && c.deckData.length > 0) {
      rawList = c.deckData;
    } else if (Array.isArray(c.deck_data?.slides) && c.deck_data.slides.length > 0) {
      rawList = c.deck_data.slides;
    } else if (c.title || c.layout) {
      rawList = [c];
    }
  } else if (typeof artifact.content === 'string') {
    try {
      const parsed = JSON.parse(artifact.content);
      if (Array.isArray(parsed) && parsed.length > 0) {
        rawList = parsed;
      } else if (parsed && typeof parsed === 'object') {
        if (Array.isArray(parsed.slides) && parsed.slides.length > 0) {
          rawList = parsed.slides;
        } else if (Array.isArray(parsed.deckData) && parsed.deckData.length > 0) {
          rawList = parsed.deckData;
        } else if (parsed.title || parsed.layout) {
          rawList = [parsed];
        }
      }
    } catch {
      // Not a JSON string — no slides to recover.
    }
  }

  if (!rawList || rawList.length === 0) return [];

  return rawList.map((item, idx) => {
    if (typeof item !== 'object' || !item) {
      return {
        layout: 'bullets',
        title: `Slide ${idx + 1}`,
        bullets: [String(item)],
      } as SlideData;
    }
    return {
      ...item,
      layout: item.layout || 'bullets',
      title: item.title || `Slide ${idx + 1}`,
    } as SlideData;
  });
}

/** Best-effort human title for a deck, used for the window head and file name. */
export function deckTitleOf(artifact?: DeckSource | null, slides: SlideData[] = []): string {
  return (
    artifact?.title ||
    artifact?.name ||
    artifact?.content?.title ||
    (slides[0]?.title ? `${slides[0].title} (Slide Deck)` : 'Bài Thuyết Trình Slide (16:9)')
  );
}
