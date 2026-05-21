import { useRef } from 'react';
import { phenomena } from './phenomena';
import TextLegibilityOverlay from './TextLegibilityOverlay';
import SceneErrorBoundary from './SceneErrorBoundary';
import PhenomenonCanvas from './PhenomenonCanvas';
import Singularity from './scenes/Singularity';
import Aurora from './scenes/Aurora';
import Crystalline from './scenes/Crystalline';
import Caustics from './scenes/Caustics';
import Resonance from './scenes/Resonance';
import Wormhole from './scenes/Wormhole';

// Scenes are imported eagerly (not React.lazy) so all six ScrollTrigger
// pins register synchronously on first mount. Lazy chunks would defer
// pin registration until each chunk loaded over the network, causing
// pin spacers to appear under the user mid-scroll on slow connections.

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
    case 'resonance':
      return <Resonance canvasId={canvasId} />;
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
  // All six phenomenon scenes pre-mount on first paint so their
  // ScrollTrigger pins (and the GSAP pin spacers those pins inject into
  // the document) exist from the start. Mounting them lazily as the user
  // scrolled used to cause a perceptible jolt at each pin handoff: the
  // next scene's pin spacer appeared late, shifting document height under
  // the user mid-scroll. With all pins registered up-front the document
  // height is stable and ScrollTrigger's per-section pin geometry is
  // correct from the moment the page is interactive.
  //
  // Trade-off: six WebGL contexts coexist from load. Modern desktop
  // browsers allow 16 by default, so this is fine in production. The
  // Replit preview iframe sandbox is more restrictive and may not be
  // able to create all six in screenshot mode — that's a development
  // visualisation limitation, not a runtime issue for real users.
  const sectionRef = useRef<HTMLElement | null>(null);

  return (
    <section
      ref={sectionRef}
      className="h-[100vh] relative overflow-hidden bg-black"
    >
      <SceneErrorBoundary>
        {sceneFor(phenomenon.id, phenomenon.canvasId)}
      </SceneErrorBoundary>

      <TextLegibilityOverlay />

      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-[24px] left-[24px] md:top-[40px] md:left-[40px] flex flex-col items-start max-w-[calc(100%-48px)] md:max-w-none">
          <div className="text-[#b8a0ff] font-display leading-none" style={{ fontSize: 'clamp(3rem, 14vw, 14rem)' }}>
            {phenomenon.numeral}
          </div>
          <h2 className="text-[#fafafa] font-display mt-[-0.2em]" style={{ fontSize: 'clamp(1.5rem, 5vw, 5rem)' }}>
            {phenomenon.title}
          </h2>
          <p className="font-display italic text-[#fafafa] opacity-60 max-w-[480px] mt-4" style={{ fontSize: 'clamp(0.875rem, 1.4vw, 1.4rem)' }}>
            {phenomenon.description}
          </p>
        </div>

        <div className="absolute bottom-[24px] left-[24px] md:bottom-[40px] md:left-[40px] flex flex-col items-start">
          <div className="w-[1px] h-[48px] md:h-[80px] bg-[#b8a0ff] mb-4"></div>
          <div className="font-mono text-[11px] text-[#fafafa] tracking-[0.3em] uppercase">
            PHENOMENON 0{index} / 06
          </div>
        </div>
      </div>
    </section>
  );
}
