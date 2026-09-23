import React, { useMemo, useRef, useState } from 'react';
import { ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import type { FlowDAGGraph, FlowDAGNodeData, FlowDAGEdgeData } from './types';
import type { OpenWorkArtifactTab } from '../types';
import { FlowDAGNode } from './FlowDAGNode';
import { FlowDAGEdge } from './FlowDAGEdge';

export interface FlowDAGCanvasProps {
  graph: FlowDAGGraph;
  activeNodeId?: string | null;
  onSelectNode?: (node: FlowDAGNodeData) => void;
  onOpenArtifact?: (tab: OpenWorkArtifactTab, artifactId?: string) => void;
}

export const FlowDAGCanvas: React.FC<FlowDAGCanvasProps> = ({
  graph,
  activeNodeId,
  onSelectNode,
  onOpenArtifact,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoomLevel, setZoomLevel] = useState<number>(1);

  const NODE_WIDTH = 190;
  const NODE_HEIGHT = 68;
  const STAGE_GAP_X = 64;
  const NODE_GAP_Y = 20;
  const PADDING_X = 24;
  const PADDING_Y = 24;

  const { layoutNodes, layoutEdges, canvasWidth, canvasHeight } = useMemo(() => {
    if (!graph || !graph.nodes || graph.nodes.length === 0) {
      return { layoutNodes: [], layoutEdges: [], canvasWidth: 320, canvasHeight: 120 };
    }

    // Check if graph already has well-calculated x, y coords
    const hasCoordinates = graph.nodes.every((n) => typeof n.x === 'number' && typeof n.y === 'number' && (n.x > 0 || n.y > 0 || graph.nodes.length === 1));

    if (hasCoordinates && graph.bounds && graph.bounds.width > 0) {
      return {
        layoutNodes: graph.nodes,
        layoutEdges: graph.edges,
        canvasWidth: Math.max(graph.bounds.width, 360),
        canvasHeight: Math.max(graph.bounds.height, 130),
      };
    }

    // Dynamic Rank-based fallback layout
    const rankMap = new Map<string, number>();
    graph.nodes.forEach((node, index) => {
      if (node.type === 'query') rankMap.set(node.id, 0);
      else if (node.type === 'decompose') rankMap.set(node.id, 0);
      else if (['search', 'scrape', 'database', 'python', 'reasoning'].includes(node.type)) rankMap.set(node.id, 1);
      else if (node.type === 'synthesis') rankMap.set(node.id, 2);
      else if (node.type === 'artifact') rankMap.set(node.id, 3);
      else rankMap.set(node.id, Math.min(index, 3));
    });

    const ranks: Map<number, FlowDAGNodeData[]> = new Map();
    graph.nodes.forEach((node) => {
      const r = rankMap.get(node.id) ?? 0;
      if (!ranks.has(r)) ranks.set(r, []);
      ranks.get(r)!.push(node);
    });

    const sortedRankKeys = Array.from(ranks.keys()).sort((a, b) => a - b);
    const maxNodesInRank = Math.max(...Array.from(ranks.values()).map((list) => list.length), 1);
    const maxRankHeight = maxNodesInRank * NODE_HEIGHT + (maxNodesInRank - 1) * NODE_GAP_Y;
    const totalHeight = PADDING_Y * 2 + maxRankHeight;

    const computedNodes: FlowDAGNodeData[] = [];
    const nodeCoords = new Map<string, { x: number; y: number }>();

    sortedRankKeys.forEach((rankKey, rankIndex) => {
      const nodeList = ranks.get(rankKey)!;
      const rankHeight = nodeList.length * NODE_HEIGHT + (nodeList.length - 1) * NODE_GAP_Y;
      const startY = PADDING_Y + (maxRankHeight - rankHeight) / 2;
      const x = PADDING_X + rankIndex * (NODE_WIDTH + STAGE_GAP_X);

      nodeList.forEach((node, nodeIndex) => {
        const y = startY + nodeIndex * (NODE_HEIGHT + NODE_GAP_Y);
        const layoutedNode = {
          ...node,
          x,
          y,
          width: NODE_WIDTH,
          height: NODE_HEIGHT,
        };
        computedNodes.push(layoutedNode);
        nodeCoords.set(node.id, { x, y });
      });
    });

    const totalWidth = PADDING_X * 2 + sortedRankKeys.length * NODE_WIDTH + Math.max(0, sortedRankKeys.length - 1) * STAGE_GAP_X;

    const computedEdges: FlowDAGEdgeData[] = (graph.edges || []).map((edge) => {
      const sourceCoord = nodeCoords.get(edge.source);
      const targetCoord = nodeCoords.get(edge.target);
      return {
        ...edge,
        sourceX: sourceCoord ? sourceCoord.x + NODE_WIDTH : edge.sourceX || 0,
        sourceY: sourceCoord ? sourceCoord.y + NODE_HEIGHT / 2 : edge.sourceY || 0,
        targetX: targetCoord ? targetCoord.x : edge.targetX || 0,
        targetY: targetCoord ? targetCoord.y + NODE_HEIGHT / 2 : edge.targetY || 0,
      };
    });

    return {
      layoutNodes: computedNodes,
      layoutEdges: computedEdges,
      canvasWidth: Math.max(totalWidth, 360),
      canvasHeight: Math.max(totalHeight, 130),
    };
  }, [graph]);

  const handleZoom = (delta: number) => {
    setZoomLevel((prev) => Math.min(Math.max(0.6, Number((prev + delta).toFixed(2))), 1.5));
  };

  const handleResetZoom = () => {
    setZoomLevel(1);
    if (containerRef.current) {
      containerRef.current.scrollTo({ left: 0, behavior: 'smooth' });
    }
  };

  return (
    <div className="relative w-full rounded-xl border border-border/80 bg-background/80 overflow-hidden select-none">
      {/* Mini Controls Toolbar */}
      <div className="absolute top-2 right-2 z-20 flex items-center gap-1 p-1 rounded-lg bg-card/90 border border-border backdrop-blur-md shadow-xs">
        <button
          type="button"
          onClick={() => handleZoom(0.1)}
          aria-label="Phóng to"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <ZoomIn size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={() => handleZoom(-0.1)}
          aria-label="Thu nhỏ"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <ZoomOut size={13} strokeWidth={1.5} />
        </button>
        <button
          type="button"
          onClick={handleResetZoom}
          aria-label="Căn giữa sơ đồ"
          className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
        >
          <RotateCcw size={13} strokeWidth={1.5} />
        </button>
      </div>

      {/* Scrollable DAG Canvas Surface */}
      <div
        ref={containerRef}
        className="w-full overflow-x-auto overflow-y-hidden p-2 custom-scrollbar"
        style={{ minHeight: `${Math.min(canvasHeight + 16, 280)}px` }}
      >
        <div
          className="relative transition-transform duration-150 origin-top-left"
          style={{
            width: `${canvasWidth}px`,
            height: `${canvasHeight}px`,
            transform: `scale(${zoomLevel})`,
          }}
        >
          {/* SVG Connector Edge Layer */}
          <svg
            className="absolute inset-0 w-full h-full pointer-events-none z-0"
            width={canvasWidth}
            height={canvasHeight}
          >
            {layoutEdges.map((edge) => (
              <FlowDAGEdge
                key={edge.id}
                edge={edge}
                sourceX={edge.sourceX}
                sourceY={edge.sourceY}
                targetX={edge.targetX}
                targetY={edge.targetY}
              />
            ))}
          </svg>

          {/* Node Cards Layer */}
          {layoutNodes.map((node) => (
            <div
              key={node.id}
              className="absolute z-10"
              style={{
                left: `${node.x}px`,
                top: `${node.y}px`,
                width: `${node.width || NODE_WIDTH}px`,
                height: `${node.height || NODE_HEIGHT}px`,
              }}
            >
              <FlowDAGNode
                node={node}
                isActive={node.id === activeNodeId}
                onClick={() => onSelectNode?.(node)}
                onOpenArtifact={onOpenArtifact}
              />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
