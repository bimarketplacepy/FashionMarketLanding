import React from 'react';
import { useInViewport } from './useInViewport';

interface PhenomenonCanvasProps {
  canvasId: string;
}

export default function PhenomenonCanvas({ canvasId }: PhenomenonCanvasProps) {
  // Hook exposed to pause future RAF loops when offscreen
  const { ref, isVisible } = useInViewport({
    threshold: 0
  });

  return (
    <div 
      ref={ref}
      id={canvasId} 
      className="absolute inset-0 bg-[#000000]"
      data-visible={isVisible}
    />
  );
}