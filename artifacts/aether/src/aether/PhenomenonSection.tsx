import React, { Suspense } from 'react';
import { phenomena } from './phenomena';
import TextLegibilityOverlay from './TextLegibilityOverlay';

const PhenomenonCanvas = React.lazy(() => import('./PhenomenonCanvas'));
const Singularity = React.lazy(() => import('./scenes/Singularity'));
const Aurora = React.lazy(() => import('./scenes/Aurora'));
const Crystalline = React.lazy(() => import('./scenes/Crystalline'));

const sceneFor = (id: string, canvasId: string) => {
  switch (id) {
    case 'singularity':
      return <Singularity canvasId={canvasId} />;
    case 'aurora':
      return <Aurora canvasId={canvasId} />;
    case 'crystalline':
      return <Crystalline canvasId={canvasId} />;
    default:
      return <PhenomenonCanvas canvasId={canvasId} />;
  }
};

interface PhenomenonSectionProps {
  phenomenon: typeof phenomena[0];
  index: number;
}

export default function PhenomenonSection({ phenomenon, index }: PhenomenonSectionProps) {
  return (
    <section className="h-[100vh] relative overflow-hidden bg-black">
      <Suspense fallback={null}>
        {sceneFor(phenomenon.id, phenomenon.canvasId)}
      </Suspense>

      <TextLegibilityOverlay />

      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-[40px] left-[40px] flex flex-col items-start">
          <div className="text-[#b8a0ff] font-display leading-none" style={{ fontSize: 'clamp(6rem, 14vw, 14rem)' }}>
            {phenomenon.numeral}
          </div>
          <h2 className="text-[#fafafa] font-display mt-[-0.2em]" style={{ fontSize: 'clamp(2.5rem, 5vw, 5rem)' }}>
            {phenomenon.title}
          </h2>
          <p className="font-display italic text-[#fafafa] opacity-60 max-w-[480px] mt-4" style={{ fontSize: 'clamp(1rem, 1.4vw, 1.4rem)' }}>
            {phenomenon.description}
          </p>
        </div>

        <div className="absolute bottom-[40px] left-[40px] flex flex-col items-start">
          <div className="w-[1px] h-[80px] bg-[#b8a0ff] mb-4"></div>
          <div className="font-mono text-[11px] text-[#fafafa] tracking-[0.3em] uppercase">
            PHENOMENON 0{index} / 06
          </div>
        </div>
      </div>
    </section>
  );
}
