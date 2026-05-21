import React, { Suspense, useEffect, useRef, useState } from 'react';
import { phenomena } from './phenomena';
import TextLegibilityOverlay from './TextLegibilityOverlay';
import SceneErrorBoundary from './SceneErrorBoundary';

const PhenomenonCanvas = React.lazy(() => import('./PhenomenonCanvas'));
const Singularity = React.lazy(() => import('./scenes/Singularity'));
const Aurora = React.lazy(() => import('./scenes/Aurora'));
const Crystalline = React.lazy(() => import('./scenes/Crystalline'));
const Caustics = React.lazy(() => import('./scenes/Caustics'));
const ParticleStorm = React.lazy(() => import('./scenes/ParticleStorm'));
const Wormhole = React.lazy(() => import('./scenes/Wormhole'));

const sceneFor = (id: string, canvasId: string) => {
  switch (id) {
    case 'singularity':
      return <Singularity canvasId={canvasId} />;
    case 'aurora':
      return <Aurora canvasId={canvasId} />;
    case 'crystalline':
      return <Crystalline canvasId={canvasId} />;
    case 'caustics':
      return <Caustics canvasId={canvasId} />;
    case 'particle-storm':
      return <ParticleStorm canvasId={canvasId} />;
    case 'wormhole':
      return <Wormhole canvasId={canvasId} />;
    default:
      return <PhenomenonCanvas canvasId={canvasId} />;
  }
};

interface PhenomenonSectionProps {
  phenomenon: typeof phenomena[0];
  index: number;
}

export default function PhenomenonSection({ phenomenon, index }: PhenomenonSectionProps) {
  // Lazy-mount the WebGL scene only when its section is actually on
  // screen (with a small ~20vh pre-roll so it has time to initialise
  // before the user scrolls onto it). Sandboxed iframes — including
  // the Replit preview — cap simultaneous WebGL contexts well below
  // the desktop browser default, so holding all six at once leaves
  // some canvases blank. Aggressive lazy mounting keeps the live
  // count to ~1-2 without touching scene code.
  const sectionRef = useRef<HTMLElement | null>(null);
  const [active, setActive] = useState(false);

  useEffect(() => {
    const el = sectionRef.current;
    if (!el || typeof IntersectionObserver === 'undefined') {
      setActive(true);
      return;
    }
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) setActive(e.isIntersecting);
      },
      { rootMargin: '20% 0px 20% 0px', threshold: 0 }
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <section
      ref={sectionRef}
      className="h-[100vh] relative overflow-hidden bg-black"
    >
      {active && (
        <SceneErrorBoundary>
          <Suspense fallback={null}>
            {sceneFor(phenomenon.id, phenomenon.canvasId)}
          </Suspense>
        </SceneErrorBoundary>
      )}

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
