import React, { useEffect, useState, useRef } from 'react';
import gsap from 'gsap';

export default function ProgressIndicator() {
  const [progress, setProgress] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  
  // Try to use global lenis if react context lenis not set up
  useEffect(() => {
    let animationFrameId: number;
    
    const checkScroll = () => {
      const scrollY = window.scrollY;
      const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
      
      if (maxScroll > 0) {
        setProgress(scrollY / maxScroll);
      }
      
      animationFrameId = requestAnimationFrame(checkScroll);
    };
    
    checkScroll();
    
    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  useEffect(() => {
    if (containerRef.current) {
      if (progress > 0.02) {
        gsap.to(containerRef.current, { opacity: 1, duration: 0.4 });
      } else {
        gsap.to(containerRef.current, { opacity: 0, duration: 0.4 });
      }
    }
  }, [progress]);

  // Section number readout ("0X / 08") removed: it was derived from raw
  // scroll progress (Math.floor(progress * 8) + 1) which did not align
  // with the actual phenomena boundaries — extended ScrollTrigger pin
  // durations and intro/outro padding meant the displayed number was
  // consistently out of sync with the visible section. The progress bar
  // stays as the silent scroll affordance.
  return (
    <div
      ref={containerRef}
      className="fixed right-[40px] top-1/2 -translate-y-1/2 flex items-center z-50 opacity-0 pointer-events-none"
    >
      <div className="relative w-[1px] h-[200px] bg-[#fafafa] opacity-20">
        <div
          className="absolute left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-[#b8a0ff]"
          style={{ top: `${progress * 100}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
    </div>
  );
}