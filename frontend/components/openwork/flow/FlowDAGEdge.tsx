import React from 'react';
import type { FlowDAGEdgeData } from './types';

export interface FlowDAGEdgeProps {
  edge: FlowDAGEdgeData;
  sourceX: number;
  sourceY: number;
  targetX: number;
  targetY: number;
}

export const FlowDAGEdge: React.FC<FlowDAGEdgeProps> = ({
  edge,
  sourceX,
  sourceY,
  targetX,
  targetY,
}) => {
  const dx = Math.max(Math.abs(targetX - sourceX), 40);
  const controlPoint1X = sourceX + dx * 0.45;
  const controlPoint2X = targetX - dx * 0.45;

  const pathData = `M ${sourceX} ${sourceY} C ${controlPoint1X} ${sourceY}, ${controlPoint2X} ${targetY}, ${targetX} ${targetY}`;

  const isRunning = edge.status === 'running';
  const isFailed = edge.status === 'failed';
  const isSuccess = edge.status === 'success';

  return (
    <g className="flow-dag-edge-group">
      {/* Base Connector Line */}
      <path
        d={pathData}
        fill="none"
        stroke="currentColor"
        className={`transition-colors duration-200 ${
          isFailed
            ? 'text-destructive/40 stroke-dashed'
            : isSuccess
            ? 'text-border/90'
            : 'text-border/50'
        }`}
        strokeWidth={1.5}
      />

      {/* Active Streaming Dash Particle Animation */}
      {isRunning && (
        <>
          <path
            d={pathData}
            fill="none"
            stroke="currentColor"
            className="text-foreground stroke-dashed flow-dag-edge-active-path"
            strokeWidth={1.5}
            strokeDasharray="4 6"
          />
          {/* Animated Particle traveling along the curve */}
          <circle r={2.5} className="fill-foreground">
            <animateMotion
              path={pathData}
              dur="1.4s"
              repeatCount="indefinite"
            />
          </circle>
        </>
      )}

      {/* Target Arrow Marker / Anchor Dot */}
      <circle
        cx={targetX}
        cy={targetY}
        r={2}
        className={`transition-colors duration-200 ${
          isRunning || isSuccess ? 'fill-foreground' : 'fill-border'
        }`}
      />
    </g>
  );
};
