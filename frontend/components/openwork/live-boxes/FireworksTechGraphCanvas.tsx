/**
 * Fireworks Knowledge Tech Graph Canvas
 * In-bubble force-directed glowing spiderweb graph with particle burst fireworks
 * OpenWork Coworker Platform - Milestone 2
 */

import React, { useRef, useEffect, useState, useCallback, useMemo } from 'react';
import {
  Maximize2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Sparkles,
  Database,
  Table,
  TrendingUp,
  Brain,
  Globe,
  FileText,
} from 'lucide-react';
import type {
  FireworksGraphData,
  GraphEntityNode,
  GraphEntityLink,
  GraphNodeCategory,
} from './types';
import { CATEGORY_COLORS } from './entity-extractor';
import './styles/live-boxes.css';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  radius: number;
  alpha: number;
  decay: number;
  trail: Array<{ x: number; y: number; alpha: number }>;
}

export interface FireworksTechGraphCanvasProps {
  data: FireworksGraphData;
  height?: number | string;
  onSelectNode?: (node: GraphEntityNode) => void;
  className?: string;
}

export const FireworksTechGraphCanvas: React.FC<FireworksTechGraphCanvasProps> = ({
  data,
  height = '16rem',
  onSelectNode,
  className = '',
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Simulation State Refs (to avoid re-render overhead in 60fps canvas loop)
  const nodesRef = useRef<GraphEntityNode[]>([]);
  const linksRef = useRef<GraphEntityLink[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const animFrameIdRef = useRef<number | null>(null);

  // Viewport Transform State
  const transformRef = useRef({ x: 0, y: 0, scale: 1 });
  const [zoomLevel, setZoomLevel] = useState<number>(1);
  const [hoveredNode, setHoveredNode] = useState<GraphEntityNode | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ x: number; y: number } | null>(null);

  // Dragging & Panning State Refs
  const isDraggingNodeRef = useRef<GraphEntityNode | null>(null);
  const isPanningRef = useRef<boolean>(false);
  const panStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const pulsePhaseRef = useRef<number>(0);

  // Spawns particle burst "fireworks"
  const spawnFireworks = useCallback((x: number, y: number, color: string) => {
    const particleCount = 20;
    const newParticles: Particle[] = [];

    for (let i = 0; i < particleCount; i++) {
      const angle = (Math.PI * 2 * i) / particleCount + (Math.random() - 0.5) * 0.5;
      const speed = 1.2 + Math.random() * 2.8;
      newParticles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        color,
        radius: 1.5 + Math.random() * 1.5,
        alpha: 1,
        decay: 0.02 + Math.random() * 0.02,
        trail: [],
      });
    }
    particlesRef.current.push(...newParticles);
  }, []);

  // Synchronize incoming data with simulation nodes & trigger fireworks on new arrivals
  useEffect(() => {
    const existingMap = new Map<string, GraphEntityNode>();
    for (const n of nodesRef.current) {
      existingMap.set(n.id, n);
    }

    const initialWidth = containerRef.current?.clientWidth || 500;
    const initialHeight = containerRef.current?.clientHeight || 250;
    const centerX = initialWidth / 2;
    const centerY = initialHeight / 2;

    const mergedNodes: GraphEntityNode[] = data.nodes.map((node, idx) => {
      if (existingMap.has(node.id)) {
        const existing = existingMap.get(node.id)!;
        return {
          ...node,
          x: existing.x ?? centerX,
          y: existing.y ?? centerY,
          vx: existing.vx ?? 0,
          vy: existing.vy ?? 0,
          fx: existing.fx,
          fy: existing.fy,
          isNew: false,
        };
      }

      // New node placement in a radial distribution
      const angle = (idx / Math.max(data.nodes.length, 1)) * Math.PI * 2;
      const radius = 60 + Math.random() * 50;
      const spawnX = centerX + Math.cos(angle) * radius;
      const spawnY = centerY + Math.sin(angle) * radius;

      // Trigger spark burst for new discoveries
      spawnFireworks(spawnX, spawnY, node.color || CATEGORY_COLORS[node.category] || '#10b981');

      return {
        ...node,
        x: spawnX,
        y: spawnY,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
        isNew: true,
      };
    });

    nodesRef.current = mergedNodes;
    linksRef.current = data.links;
  }, [data, spawnFireworks]);

  // Viewport centering & fit to screen
  const handleRecenter = useCallback(() => {
    if (!containerRef.current) return;
    const width = containerRef.current.clientWidth;
    const height = containerRef.current.clientHeight;

    transformRef.current = {
      x: 0,
      y: 0,
      scale: 1,
    };
    setZoomLevel(1);
  }, []);

  const handleZoom = useCallback((delta: number) => {
    transformRef.current.scale = Math.min(
      Math.max(transformRef.current.scale + delta, 0.4),
      2.5
    );
    setZoomLevel(transformRef.current.scale);
  }, []);

  // Main 60fps Canvas Loop: Physics + Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isRunning = true;

    const renderLoop = () => {
      if (!isRunning) return;

      const container = containerRef.current;
      if (!container) return;

      const width = container.clientWidth || 500;
      const height = container.clientHeight || 250;
      const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;

      // Resize canvas to container with High-DPI scaling
      if (canvas.width !== width * dpr || canvas.height !== height * dpr) {
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = `${width}px`;
        canvas.style.height = `${height}px`;
      }

      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      ctx.save();
      ctx.scale(dpr, dpr);
      ctx.clearRect(0, 0, width, height);

      // Apply viewport transform (pan & zoom)
      ctx.translate(width / 2 + transformRef.current.x, height / 2 + transformRef.current.y);
      ctx.scale(transformRef.current.scale, transformRef.current.scale);
      ctx.translate(-width / 2, -height / 2);

      const nodes = nodesRef.current;
      const links = linksRef.current;
      const centerX = width / 2;
      const centerY = height / 2;

      // ── 1. Physics Simulation Step ──
      const kRep = 850;
      const epsSoft = 100;
      const kSpring = 0.045;
      const kCenter = 0.012;
      const damping = 0.88;

      // Coulomb Repulsion between all node pairs
      for (let i = 0; i < nodes.length; i++) {
        const n1 = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const n2 = nodes[j];
          const dx = (n1.x ?? centerX) - (n2.x ?? centerX);
          const dy = (n1.y ?? centerY) - (n2.y ?? centerY);
          const distSq = dx * dx + dy * dy + epsSoft;
          const dist = Math.sqrt(distSq);
          const force = kRep / distSq;
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;

          if (n1.fx == null) {
            n1.vx = (n1.vx ?? 0) + fx;
            n1.vy = (n1.vy ?? 0) + fy;
          }
          if (n2.fx == null) {
            n2.vx = (n2.vx ?? 0) - fx;
            n2.vy = (n2.vy ?? 0) - fy;
          }
        }
      }

      // Hooke Spring Attraction along links
      const nodeIndexMap = new Map<string, GraphEntityNode>();
      for (const n of nodes) nodeIndexMap.set(n.id, n);

      for (const link of links) {
        const src = nodeIndexMap.get(link.source);
        const tgt = nodeIndexMap.get(link.target);
        if (!src || !tgt) continue;

        const dx = (tgt.x ?? centerX) - (src.x ?? centerX);
        const dy = (tgt.y ?? centerY) - (src.y ?? centerY);
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        const restLength = 65 + (src.val + tgt.val) * 2.2;
        const displacement = dist - restLength;
        const force = displacement * kSpring;
        const fx = (dx / dist) * force;
        const fy = (dy / dist) * force;

        if (src.fx == null) {
          src.vx = (src.vx ?? 0) + fx;
          src.vy = (src.vy ?? 0) + fy;
        }
        if (tgt.fx == null) {
          tgt.vx = (tgt.vx ?? 0) - fx;
          tgt.vy = (tgt.vy ?? 0) - fy;
        }
      }

      // Center Gravity & Integration
      for (const n of nodes) {
        if (n.fx != null && n.fy != null) {
          n.x = n.fx;
          n.y = n.fy;
          n.vx = 0;
          n.vy = 0;
          continue;
        }

        const dxCenter = centerX - (n.x ?? centerX);
        const dyCenter = centerY - (n.y ?? centerY);
        n.vx = ((n.vx ?? 0) + dxCenter * kCenter) * damping;
        n.vy = ((n.vy ?? 0) + dyCenter * kCenter) * damping;

        n.x = (n.x ?? centerX) + (n.vx ?? 0);
        n.y = (n.y ?? centerY) + (n.vy ?? 0);
      }

      // ── 2. Render Links (Spiderweb Edges + Pulse Dots) ──
      pulsePhaseRef.current = (pulsePhaseRef.current + 0.012) % 1;

      for (const link of links) {
        const src = nodeIndexMap.get(link.source);
        const tgt = nodeIndexMap.get(link.target);
        if (!src || !tgt || src.x == null || src.y == null || tgt.x == null || tgt.y == null) continue;

        // Draw Edge Line
        ctx.beginPath();
        ctx.moveTo(src.x, src.y);
        ctx.lineTo(tgt.x, tgt.y);
        ctx.strokeStyle = link.color || 'rgba(113, 113, 122, 0.35)';
        ctx.lineWidth = 1.2;
        ctx.stroke();

        // Draw Travelling Signal Pulse Dot
        const pulseX = src.x + (tgt.x - src.x) * pulsePhaseRef.current;
        const pulseY = src.y + (tgt.y - src.y) * pulsePhaseRef.current;

        ctx.beginPath();
        ctx.arc(pulseX, pulseY, 2, 0, Math.PI * 2);
        ctx.fillStyle = link.color || '#10b981';
        ctx.shadowColor = link.color || '#10b981';
        ctx.shadowBlur = 6;
        ctx.fill();
        ctx.shadowBlur = 0; // Reset blur
      }

      // ── 3. Render Nodes (Glow halo, Circle, Label) ──
      for (const node of nodes) {
        if (node.x == null || node.y == null) continue;

        const baseRadius = 5 + Math.min(Math.max(node.val, 3), 12) * 1.1;
        const color = node.color || CATEGORY_COLORS[node.category] || '#3b82f6';
        const isHovered = hoveredNode?.id === node.id;
        const radius = isHovered ? baseRadius * 1.25 : baseRadius;

        // Outer Glow Halo
        const glow = ctx.createRadialGradient(node.x, node.y, radius * 0.2, node.x, node.y, radius * 2.5);
        glow.addColorStop(0, color);
        glow.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.arc(node.x, node.y, radius * 2.5, 0, Math.PI * 2);
        ctx.fillStyle = glow;
        ctx.globalAlpha = isHovered ? 0.6 : 0.3;
        ctx.fill();
        ctx.globalAlpha = 1.0;

        // Solid Node Circle
        ctx.beginPath();
        ctx.arc(node.x, node.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = isHovered ? '#ffffff' : 'rgba(255, 255, 255, 0.4)';
        ctx.lineWidth = isHovered ? 2 : 1;
        ctx.stroke();

        // Node Label Pill
        ctx.font = '10px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const labelText = node.name.length > 18 ? node.name.slice(0, 16) + '…' : node.name;
        const textMetrics = ctx.measureText(labelText);
        const pillWidth = textMetrics.width + 10;
        const pillHeight = 15;
        const pillY = node.y + radius + 10;

        // Label Pill Background
        ctx.fillStyle = 'rgba(24, 24, 27, 0.85)';
        ctx.beginPath();
        ctx.roundRect(node.x - pillWidth / 2, pillY - pillHeight / 2, pillWidth, pillHeight, 4);
        ctx.fill();
        ctx.strokeStyle = 'rgba(63, 63, 70, 0.6)';
        ctx.lineWidth = 0.8;
        ctx.stroke();

        // Label Text
        ctx.fillStyle = '#f4f4f5';
        ctx.fillText(labelText, node.x, pillY);
      }

      // ── 4. Render Particle Fireworks Sparks ──
      const activeParticles: Particle[] = [];
      for (const p of particlesRef.current) {
        p.trail.push({ x: p.x, y: p.y, alpha: p.alpha });
        if (p.trail.length > 4) p.trail.shift();

        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.96;
        p.vy *= 0.96;
        p.alpha -= p.decay;

        if (p.alpha > 0) {
          activeParticles.push(p);

          // Draw spark trail
          for (let t = 0; t < p.trail.length; t++) {
            const tr = p.trail[t];
            ctx.beginPath();
            ctx.arc(tr.x, tr.y, p.radius * 0.7, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.globalAlpha = tr.alpha * 0.4;
            ctx.fill();
          }

          // Draw spark head
          ctx.beginPath();
          ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
          ctx.fillStyle = p.color;
          ctx.globalAlpha = p.alpha;
          ctx.fill();
          ctx.globalAlpha = 1.0;
        }
      }
      particlesRef.current = activeParticles;

      ctx.restore();

      animFrameIdRef.current = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      isRunning = false;
      if (animFrameIdRef.current) {
        cancelAnimationFrame(animFrameIdRef.current);
      }
    };
  }, [hoveredNode]);

  // Coordinate Conversion Helper: Screen to World
  const screenToWorld = useCallback((screenX: number, screenY: number) => {
    const container = containerRef.current;
    if (!container) return { x: screenX, y: screenY };

    const rect = container.getBoundingClientRect();
    const width = container.clientWidth;
    const height = container.clientHeight;

    const relX = screenX - rect.left;
    const relY = screenY - rect.top;

    const centeredX = relX - (width / 2 + transformRef.current.x);
    const centeredY = relY - (height / 2 + transformRef.current.y);

    const worldX = centeredX / transformRef.current.scale + width / 2;
    const worldY = centeredY / transformRef.current.scale + height / 2;

    return { x: worldX, y: worldY };
  }, []);

  // Hit-testing for Node Hover & Selection
  const findNodeAtScreen = useCallback(
    (screenX: number, screenY: number): GraphEntityNode | null => {
      const { x: worldX, y: worldY } = screenToWorld(screenX, screenY);

      for (const node of nodesRef.current) {
        if (node.x == null || node.y == null) continue;
        const dx = node.x - worldX;
        const dy = node.y - worldY;
        const hitRadius = (5 + Math.min(Math.max(node.val, 3), 12) * 1.1) * 1.5 + 8;
        if (dx * dx + dy * dy <= hitRadius * hitRadius) {
          return node;
        }
      }
      return null;
    },
    [screenToWorld]
  );

  // Mouse & Touch Interaction Handlers
  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      const node = findNodeAtScreen(e.clientX, e.clientY);
      if (node) {
        isDraggingNodeRef.current = node;
        const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY);
        node.fx = worldX;
        node.fy = worldY;
        onSelectNode?.(node);
      } else {
        isPanningRef.current = true;
        panStartRef.current = {
          x: e.clientX - transformRef.current.x,
          y: e.clientY - transformRef.current.y,
        };
      }
    },
    [findNodeAtScreen, screenToWorld, onSelectNode]
  );

  const handleMouseMove = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingNodeRef.current) {
        const { x: worldX, y: worldY } = screenToWorld(e.clientX, e.clientY);
        isDraggingNodeRef.current.fx = worldX;
        isDraggingNodeRef.current.fy = worldY;
      } else if (isPanningRef.current) {
        transformRef.current.x = e.clientX - panStartRef.current.x;
        transformRef.current.y = e.clientY - panStartRef.current.y;
      } else {
        // Hover Detection
        const node = findNodeAtScreen(e.clientX, e.clientY);
        if (node !== hoveredNode) {
          setHoveredNode(node);
          if (node && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setTooltipPos({
              x: e.clientX - rect.left + 12,
              y: e.clientY - rect.top + 12,
            });
          } else {
            setTooltipPos(null);
          }
        }
      }
    },
    [findNodeAtScreen, hoveredNode, screenToWorld]
  );

  const handleMouseUp = useCallback(() => {
    if (isDraggingNodeRef.current) {
      isDraggingNodeRef.current.fx = null;
      isDraggingNodeRef.current.fy = null;
      isDraggingNodeRef.current = null;
    }
    isPanningRef.current = false;
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    const zoomFactor = e.deltaY < 0 ? 0.08 : -0.08;
    transformRef.current.scale = Math.min(
      Math.max(transformRef.current.scale + zoomFactor, 0.4),
      2.5
    );
    setZoomLevel(transformRef.current.scale);
  }, []);

  const CategoryIcon = useMemo(() => {
    if (!hoveredNode) return Sparkles;
    switch (hoveredNode.category) {
      case 'database':
        return Database;
      case 'table':
        return Table;
      case 'metric':
        return TrendingUp;
      case 'concept':
        return Brain;
      case 'source':
        return Globe;
      case 'artifact':
        return FileText;
      default:
        return Sparkles;
    }
  }, [hoveredNode]);

  return (
    <div
      ref={containerRef}
      data-testid="fireworks-tech-graph-canvas"
      style={{ height }}
      className={`tech-graph-canvas-container relative rounded-xl border border-border/80 bg-zinc-950/95 overflow-hidden select-none ${className}`}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      onMouseLeave={handleMouseUp}
      onWheel={handleWheel}
      onDoubleClick={handleRecenter}
    >
      {/* HTML5 Canvas */}
      <canvas ref={canvasRef} className="absolute inset-0 w-full h-full block cursor-grab active:cursor-grabbing" />

      {/* Floating Toolbar Controls */}
      <div className="absolute top-2.5 right-2.5 flex items-center gap-1 bg-zinc-900/80 backdrop-blur-md p-1 rounded-lg border border-zinc-800 text-xs shadow-md z-10">
        <button
          type="button"
          onClick={() => handleZoom(0.15)}
          title="Phóng to"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <ZoomIn size={13} />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.15)}
          title="Thu nhỏ"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <ZoomOut size={13} />
        </button>
        <button
          type="button"
          onClick={handleRecenter}
          title="Căn giữa đồ thị"
          className="p-1 rounded hover:bg-zinc-800 text-zinc-300 hover:text-white transition-colors"
        >
          <RotateCcw size={13} />
        </button>
        <span className="px-1.5 text-[0.625rem] text-zinc-400 font-mono">
          {Math.round(zoomLevel * 100)}%
        </span>
      </div>

      {/* Entity Count Badge */}
      <div className="absolute bottom-2.5 left-2.5 flex items-center gap-2 bg-zinc-900/80 backdrop-blur-md px-2.5 py-1 rounded-lg border border-zinc-800 text-xs text-zinc-300 shadow-md z-10">
        <Sparkles size={12} className="text-emerald-400" />
        <span className="font-mono text-[0.6875rem]">
          {data.nodes.length} thực thể • {data.links.length} liên kết
        </span>
      </div>

      {/* Hover Glassmorphic Tooltip */}
      {hoveredNode && tooltipPos && (
        <div
          style={{
            left: `${tooltipPos.x}px`,
            top: `${tooltipPos.y}px`,
            pointerEvents: 'none',
          }}
          className="absolute z-20 max-w-xs bg-zinc-900/95 backdrop-blur-md border border-zinc-700/80 rounded-lg p-2.5 shadow-xl text-zinc-100 space-y-1.5 animate-in fade-in zoom-in-95 duration-100"
        >
          <div className="flex items-center gap-1.5">
            <span
              style={{ backgroundColor: hoveredNode.color || CATEGORY_COLORS[hoveredNode.category] }}
              className="p-1 rounded text-white inline-flex items-center justify-center shrink-0"
            >
              <CategoryIcon size={11} />
            </span>
            <span className="text-[0.625rem] uppercase font-bold text-zinc-400 tracking-wider">
              {hoveredNode.category}
            </span>
          </div>

          <h5 className="font-semibold text-xs text-zinc-100 break-words">
            {hoveredNode.name}
          </h5>

          {hoveredNode.details && Object.keys(hoveredNode.details).length > 0 && (
            <div className="text-[0.625rem] text-zinc-400 space-y-0.5 pt-1 border-t border-zinc-800 font-mono">
              {Object.entries(hoveredNode.details).slice(0, 3).map(([k, v]) => (
                <div key={k} className="flex items-center justify-between gap-2">
                  <span className="text-zinc-500">{k}:</span>
                  <span className="text-zinc-300 truncate max-w-[8rem]">{String(v)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
