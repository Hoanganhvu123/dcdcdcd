import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Download,
  Layers,
  Maximize2,
  Minimize2,
  PanelLeft,
  PanelLeftClose,
  Pause,
  Play,
  Presentation,
  CheckCircle2,
} from 'lucide-react';
import { toast } from 'sonner';
import { SlideCanvas } from './SlideCanvas';
import { SlideRenderer } from './SlideRenderer';
import { SlideSkeleton } from '../skeletons/SlideSkeleton';
import { deckTitleOf, normalizeDeck } from '@/lib/slides/normalizeDeck';
import type { SlideData, SlideDeckPayload } from './types';

const LAYOUT_LABEL: Record<string, string> = {
  hero: 'Mở đầu',
  colophon: 'Chương',
  section: 'Chương',
  two_col: '2 cột',
  comparison: 'So sánh',
  chart: 'Biểu đồ',
  stat_grid: 'Chỉ số',
  closing: 'Kết',
  quote: 'Trích dẫn',
  timeline: 'Dòng thời gian',
  bento_grid: 'Bento',
  bullets: 'Gạch đầu dòng',
};

export interface SlideArtifactViewerProps {
  artifact?: {
    id?: string;
    name?: string;
    title?: string;
    type?: string;
    content?: any;
    url?: string;
    file_path?: string;
    pptx_url?: string;
    slides?: any[];
    themeVars?: Record<string, string>;
    status?: 'generating' | 'ready' | 'idle' | string;
    toolName?: string;
    [key: string]: any;
  } | null;
  spotlightActive?: boolean;
  onDownload?: () => void;
  className?: string;
}

export const SlideArtifactViewer: React.FC<SlideArtifactViewerProps> = React.memo(({
  artifact,
  spotlightActive = false,
  onDownload,
  className = '',
}) => {
  const [currentSlideIndex, setCurrentSlideIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [showThumbnails, setShowThumbnails] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const autoplayTimerRef = useRef<NodeJS.Timeout | null>(null);

  const slides: SlideData[] = useMemo(() => {
    return normalizeDeck(artifact);
  }, [artifact]);

  const deckTitle = useMemo(() => deckTitleOf(artifact, slides), [artifact, slides]);

  const totalSlides = slides.length;

  useEffect(() => {
    setCurrentSlideIndex(0);
    setIsPlaying(false);
  }, [artifact?.id, artifact?.title]);

  const goToPrev = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev > 0 ? prev - 1 : totalSlides - 1));
  }, [totalSlides]);

  const goToNext = useCallback(() => {
    setCurrentSlideIndex((prev) => (prev < totalSlides - 1 ? prev + 1 : 0));
  }, [totalSlides]);

  // Autoplay Timer (4s interval)
  useEffect(() => {
    if (isPlaying && totalSlides > 1) {
      autoplayTimerRef.current = setInterval(() => {
        setCurrentSlideIndex((prev) => {
          if (prev >= totalSlides - 1) {
            setIsPlaying(false);
            return 0;
          }
          return prev + 1;
        });
      }, 4000);
    } else {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
        autoplayTimerRef.current = null;
      }
    }
    return () => {
      if (autoplayTimerRef.current) {
        clearInterval(autoplayTimerRef.current);
      }
    };
  }, [isPlaying, totalSlides]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return;

      if (e.key === 'ArrowRight' || e.key === ' ') {
        e.preventDefault();
        goToNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrev();
      } else if (e.key === 'f' || e.key === 'F') {
        setIsFullscreen((prev) => !prev);
      } else if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goToNext, goToPrev, isFullscreen]);

  const handleDownload = useCallback(async () => {
    if (onDownload) {
      onDownload();
      return;
    }

    const pptxUrl =
      artifact?.pptx_url ||
      artifact?.url ||
      artifact?.content?.pptx_url ||
      artifact?.content?.url;

    if (pptxUrl && typeof pptxUrl === 'string' && pptxUrl.endsWith('.pptx')) {
      const link = document.createElement('a');
      link.href = pptxUrl;
      link.download = artifact?.name || 'presentation.pptx';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      toast.success('Đang tải tệp PPTX');
      return;
    }

    // No backend-generated file: build the .pptx in the browser.
    try {
      const { exportDeckToPptx } = await import('@/lib/slides/exportPptx');
      await exportDeckToPptx(deckTitle, slides);
      toast.success('Đã tải tệp PPTX');
    } catch (err) {
      console.error('[SlideArtifactViewer] PPTX export failed', err);
      toast.error('Không tạo được tệp PPTX');
    }
  }, [onDownload, artifact, deckTitle, slides]);

  const isGenerating =
    artifact?.status === 'generating' ||
    (spotlightActive && (!artifact || slides.length === 0));

  if (isGenerating) {
    return (
      <SlideSkeleton
        toolName={artifact?.toolName || 'presentation_builder'}
        title={deckTitle}
        className={className}
      />
    );
  }

  // Guard on slides only: everything below renders from `slides`, so a
  // present-but-unparseable `artifact.content` must still hit the empty state.
  if (slides.length === 0) {
    return (
      <div className={`ow-sl-empty ${className}`}>
        <Presentation className="w-9 h-9 text-[var(--color-clay,#8c6239)] opacity-60" />
        <h3>
          Chưa có bài thuyết trình 16:9
        </h3>
        <p>
          Slide thuyết trình 16:9 sẽ tự động hiển thị tại đây khi agent hoàn tất phân tích.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`ow-sl ${isFullscreen ? 'fixed inset-0 z-50' : className}`}
    >
      {/* ── Stage: thumbnail rail + 16:9 canvas ── */}
      <div className="ow-sl-stage">
        {/* Left thumbnail rail */}
        {showThumbnails && (
          <div className="ow-sl-rail custom-scrollbar">
            {slides.map((s, idx) => {
              const isActive = idx === currentSlideIndex;
              return (
                <div
                  key={idx}
                  onClick={() => {
                    setCurrentSlideIndex(idx);
                    setIsPlaying(false);
                  }}
                  className={`ow-sl-thumb ${isActive ? 'is-active' : ''}`}
                >
                  <div className="ow-sl-thumb-head">
                    <span className="ow-sl-thumb-num">#{idx + 1}</span>
                    <span className="ow-sl-thumb-layout">
                      {LAYOUT_LABEL[(s.layout || 'bullets').toLowerCase()] || s.layout}
                    </span>
                  </div>

                  {/* Thumbnail scaled stage preview */}
                  <div className="ow-sl-thumb-frame">
                    <SlideCanvas scale={180 / 1920} flat freezeMotion>
                      <SlideRenderer slide={s} wrapInCanvas={false} />
                    </SlideCanvas>
                  </div>

                  <p className="ow-sl-thumb-title">
                    {s.title || `Slide ${idx + 1}`}
                  </p>
                </div>
              );
            })}
          </div>
        )}

        {/* Center Main Slide Viewport */}
        <div className="ow-sl-viewport">
          <div className="w-full h-full max-w-6xl flex items-center justify-center relative">
            <SlideCanvas center className="h-full w-full">
              <SlideRenderer
                slide={slides[currentSlideIndex]}
                wrapInCanvas={false}
              />
            </SlideCanvas>
          </div>
        </div>
      </div>

      {/* ── Bottom Floating Player Controls Bar ── */}
      <div className="ow-sl-player">
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={goToPrev}
            aria-label="Slide trước (Mũi tên trái)"
            className="ow-sl-btn"
          >
            <ChevronLeft size={16} />
          </button>

          <button
            type="button"
            onClick={() => setIsPlaying((prev) => !prev)}
            aria-label={isPlaying ? 'Tạm dừng phát tự động' : 'Phát tự động (4s/slide)'}
            className="ow-sl-btn ow-sl-play"
          >
            {isPlaying ? (
              <Pause size={12} className="ow-sl-play-icon" />
            ) : (
              <Play size={12} className="ow-sl-play-icon" />
            )}
            <span>{isPlaying ? 'Tạm dừng' : 'Tự động phát'}</span>
          </button>

          <button
            type="button"
            onClick={goToNext}
            aria-label="Slide sau (Mũi tên phải)"
            className="ow-sl-btn"
          >
            <ChevronRight size={16} />
          </button>
        </div>

        {/* Middle Slide Dots */}
        <div className="ow-sl-dots hidden sm:flex">
          {slides.map((_, i) => (
            <button
              key={i}
              onClick={() => {
                setCurrentSlideIndex(i);
                setIsPlaying(false);
              }}
              title={`Slide ${i + 1}`}
              className={`ow-sl-dot ${i === currentSlideIndex ? 'is-active' : ''}`}
            />
          ))}
        </div>

        {/* Counter */}
        <div className="ow-sl-count">
          <strong>{currentSlideIndex + 1}</strong>
          <span className="mx-1">/</span>
          <span>{totalSlides}</span>
        </div>
      </div>
    </div>
  );
});

export default SlideArtifactViewer;
