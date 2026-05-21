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

  const currentSection = Math.min(8, Math.floor(progress * 8) + 1);

  return (
    <div 
      ref={containerRef}
      className="fixed right-[40px] top-1/2 -translate-y-1/2 flex items-center gap-4 z-50 opacity-0 pointer-events-none"
    >
      <div className="relative w-[1px] h-[200px] bg-[#fafafa] opacity-20">
        <div 
          className="absolute left-1/2 -translate-x-1/2 w-[6px] h-[6px] rounded-full bg-[#b8a0ff]"
          style={{ top: `${progress * 100}%`, transform: 'translate(-50%, -50%)' }}
        />
      </div>
      <div className="font-mono text-[11px] text-[#fafafa] tracking-[0.3em]">
        0{currentSection} / 08
      </div>
    </div>
  );
}