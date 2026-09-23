import React from 'react';

export interface OpenWorkSplitterProps {
  direction: 'left' | 'right';
  isDragging: boolean;
  onMouseDown: (e: React.MouseEvent) => void;
  onDoubleClick?: () => void;
  className?: string;
}

export const OpenWorkSplitter: React.FC<OpenWorkSplitterProps> = ({
  direction,
  isDragging,
  onMouseDown,
  onDoubleClick,
  className = '',
}) => {
  return (
    <div
      role="separator"
      aria-orientation="vertical"
      tabIndex={0}
      onMouseDown={onMouseDown}
      onDoubleClick={onDoubleClick}
      className={`relative w-1.5 -mx-0.5 cursor-col-resize select-none z-20 flex items-center justify-center transition-colors group ${
        isDragging
          ? 'bg-[var(--color-accent,#b68235)]/80 shadow-[0_0_8px_rgba(182,130,53,0.35)]'
          : 'bg-transparent hover:bg-[var(--color-accent-soft,#fffaf2)]/60'
      } ${className}`}
      title={`Kéo để điều chỉnh độ rộng ${direction === 'left' ? 'thanh bên' : 'workbench'}`}
    >
      <div
        className={`w-0.5 h-7 rounded-full transition-all duration-150 ${
          isDragging
            ? 'bg-[var(--color-accent,#b68235)] opacity-100 scale-y-110'
            : 'bg-[var(--color-accent,#b68235)]/40 opacity-0 group-hover:opacity-100'
        }`}
      />
    </div>
  );
};

